const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }
    const adminCheck = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await adminCheck.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return json({ success: false, error: 'Forbidden: admin required' }, 403);
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      return json({ success: false, error: 'Firecrawl not configured' }, 500);
    }

    console.log('Scraping chrysler.cz for vehicle listings...');

    // Step 1: Get markdown only (fast, no extraction overhead)
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.chrysler.cz/#nabidka',
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: 120000,
        waitFor: 8000,
      }),
    });

    const scrapeData = await response.json();

    if (!response.ok) {
      console.error('Firecrawl error:', scrapeData);
      return json({ success: false, error: scrapeData.error || 'Scrape failed' }, 500);
    }

    const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || '';
    console.log(`Got markdown (${markdown.length} chars)`);

    if (!markdown || markdown.length < 100) {
      return json({
        success: true,
        message: 'Stránka nevrátila dostatek obsahu. Zkuste to znovu.',
        vehicles: [],
      });
    }

    // Step 2: Use AI to extract vehicles from the markdown
    const extractResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.chrysler.cz/#nabidka',
        formats: ['extract'],
        extract: {
          prompt: 'Extract all vehicles for sale. For each vehicle get: brand, model, year, price (number in CZK), mileage (km number), fuel, transmission, engine, power, color, condition, description, image URLs array, and listing_url.',
          schema: {
            type: 'object',
            properties: {
              vehicles: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    brand: { type: 'string' },
                    model: { type: 'string' },
                    year: { type: 'number' },
                    price: { type: 'number' },
                    mileage: { type: 'number' },
                    fuel: { type: 'string' },
                    transmission: { type: 'string' },
                    engine: { type: 'string' },
                    power: { type: 'string' },
                    color: { type: 'string' },
                    condition: { type: 'string' },
                    description: { type: 'string' },
                    images: { type: 'array', items: { type: 'string' } },
                    listing_url: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        timeout: 120000,
        waitFor: 8000,
      }),
    });

    const extractData = await extractResponse.json();

    if (!extractResponse.ok) {
      console.error('Extract error:', extractData);
      return json({ success: false, error: extractData.error || 'Extract failed' }, 500);
    }

    const vehicles = extractData?.data?.extract?.vehicles || extractData?.extract?.vehicles || [];
    console.log(`Found ${vehicles.length} vehicles`);

    if (vehicles.length === 0) {
      return json({
        success: true,
        message: 'Nepodařilo se extrahovat vozy. Web pravděpodobně používá dynamické načítání.',
        vehicles: [],
        raw_markdown: markdown.substring(0, 2000),
      });
    }

    // Update database
    const supabase = adminCheck;
    await supabase.from('vehicles').update({ is_active: false }).eq('is_active', true);

    let updated = 0;
    let created = 0;

    for (const v of vehicles) {
      if (!v.brand || !v.model) continue;

      const { data: existing } = await supabase
        .from('vehicles')
        .select('id')
        .eq('brand', v.brand)
        .eq('model', v.model)
        .eq('year', v.year || 0)
        .limit(1);

      const vehicleData = {
        brand: v.brand,
        model: v.model,
        year: v.year || new Date().getFullYear(),
        price: v.price || 0,
        mileage: v.mileage || null,
        fuel: v.fuel || null,
        transmission: v.transmission || null,
        engine: v.engine || null,
        power: v.power || null,
        color: v.color || null,
        condition: v.condition || null,
        description: v.description || null,
        images: v.images || [],
        listing_url: v.listing_url || 'https://www.chrysler.cz/#nabidka',
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (existing && existing.length > 0) {
        await supabase.from('vehicles').update(vehicleData).eq('id', existing[0].id);
        updated++;
      } else {
        await supabase.from('vehicles').insert(vehicleData);
        created++;
      }
    }

    return json({
      success: true,
      message: `Aktualizováno: ${updated}, Nových: ${created}, Celkem: ${vehicles.length}`,
      vehicles: vehicles.length,
      updated,
      created,
    });
  } catch (e) {
    console.error('scrape-vehicles error:', e);
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
