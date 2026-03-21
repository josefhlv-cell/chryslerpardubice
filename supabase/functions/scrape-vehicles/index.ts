const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      return json({ success: false, error: 'Firecrawl not configured' }, 500);
    }

    console.log('Scraping chrysler.cz for vehicle listings...');

    // Use Firecrawl to scrape the main page with JSON extraction
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.chrysler.cz',
        formats: [
          {
            type: 'json',
            prompt: 'Extract all vehicles for sale from this car dealership page. For each vehicle extract: brand (e.g. Chrysler, Dodge, Jeep, RAM), model, year, price in CZK (number only), mileage in km (number only), fuel type, transmission, engine, power, color, condition, description, image URLs (array), and the direct link/URL to the vehicle detail page if available.',
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
          'markdown',
        ],
        waitFor: 3000,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl error:', data);
      return json({ success: false, error: data.error || 'Scrape failed' }, 500);
    }

    const vehicles = data?.data?.json?.vehicles || data?.json?.vehicles || [];
    console.log(`Found ${vehicles.length} vehicles`);

    if (vehicles.length === 0) {
      return json({ 
        success: true, 
        message: 'No vehicles found on the page. The website may use dynamic loading that requires manual update.',
        vehicles: [],
        raw_markdown: (data?.data?.markdown || data?.markdown || '').substring(0, 2000),
      });
    }

    // Update database
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Deactivate all current vehicles
    await supabase.from('vehicles').update({ is_active: false }).eq('is_active', true);

    let updated = 0;
    let created = 0;

    for (const v of vehicles) {
      if (!v.brand || !v.model) continue;

      // Try to find existing vehicle by brand + model + year
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
        listing_url: v.listing_url || `https://www.chrysler.cz`,
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
