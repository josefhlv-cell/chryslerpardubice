const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Vehicle configs for EPC generation
const VEHICLE_CONFIGS: Record<string, { brand: string; engines: string[]; year_from: number; year_to: number }> = {
  'Chrysler 300C': { brand: 'Chrysler', engines: ['3.6L V6', '5.7L HEMI V8', '6.4L SRT V8'], year_from: 2005, year_to: 2023 },
  'Chrysler Pacifica': { brand: 'Chrysler', engines: ['3.6L V6', '3.6L V6 Hybrid'], year_from: 2017, year_to: 2023 },
  'Chrysler Town & Country': { brand: 'Chrysler', engines: ['3.6L V6'], year_from: 2008, year_to: 2016 },
  'Chrysler Voyager': { brand: 'Chrysler', engines: ['3.6L V6'], year_from: 2020, year_to: 2023 },
  'Dodge Grand Caravan': { brand: 'Dodge', engines: ['3.6L V6'], year_from: 2008, year_to: 2020 },
  'Dodge Durango': { brand: 'Dodge', engines: ['3.6L V6', '5.7L HEMI V8', '6.4L SRT V8'], year_from: 2011, year_to: 2023 },
  'Dodge Charger': { brand: 'Dodge', engines: ['3.6L V6', '5.7L HEMI V8', '6.2L Hellcat V8', '6.4L SRT V8'], year_from: 2011, year_to: 2023 },
  'Dodge Challenger': { brand: 'Dodge', engines: ['3.6L V6', '5.7L HEMI V8', '6.2L Hellcat V8', '6.4L SRT V8'], year_from: 2008, year_to: 2023 },
};

const EPC_CATEGORIES = [
  'Motor', 'Převodovka', 'Chlazení', 'Palivový systém', 'Výfukový systém',
  'Elektroinstalace', 'Brzdový systém', 'Podvozek', 'Řízení', 'Karoserie',
  'Interiér', 'Klimatizace/Topení', 'Kola a pneumatiky', 'Náprava', 'Osvětlení',
];

const AI_PROMPT = `You are an expert Mopar OEM parts database. Generate a JSON array of genuine OEM parts for the specified vehicle and category.

For each part, provide:
- oem_number: The genuine Mopar/Chrysler OEM part number (e.g., "68191349AC", "4663515AE")
- part_name: Czech name of the part
- manufacturer: Usually "Mopar" for genuine parts

IMPORTANT: Only include REAL, verified Mopar OEM part numbers. Do not invent numbers.
If you're not confident about a specific OEM number, skip that part.

Return ONLY a valid JSON array, no markdown, no explanation.
Example: [{"oem_number":"68191349AC","part_name":"Olejový filtr","manufacturer":"Mopar"}]`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    const { createClient: createAuthClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const authClient = createAuthClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims?.sub) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    const adminCheckClient = createAuthClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await adminCheckClient.from('user_roles').select('role').eq('user_id', claimsData.claims.sub).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return jsonResponse({ success: false, error: 'Forbidden: admin required' }, 403);
    }

    const body = await req.json();
    const { vehicle, category, action } = body;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase config');

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // List available vehicles
    if (action === 'list') {
      return jsonResponse({ 
        success: true, 
        vehicles: Object.entries(VEHICLE_CONFIGS).map(([name, cfg]) => ({
          name, brand: cfg.brand, engines: cfg.engines, year_from: cfg.year_from, year_to: cfg.year_to,
        })),
        categories: EPC_CATEGORIES,
      });
    }

    // Generate EPC data for a vehicle + category using AI
    if (action === 'generate') {
      if (!vehicle || !category) {
        return jsonResponse({ success: false, error: 'vehicle and category required' }, 400);
      }

      const config = VEHICLE_CONFIGS[vehicle];
      if (!config) {
        return jsonResponse({ success: false, error: `Vehicle not found: ${vehicle}`, available: Object.keys(VEHICLE_CONFIGS) }, 400);
      }

      const engine = body.engine || config.engines[0];
      const model = vehicle.replace(`${config.brand} `, '');

      // Call Lovable AI gateway
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: AI_PROMPT },
            { role: 'user', content: `Vehicle: ${vehicle} (${engine}, ${config.year_from}-${config.year_to})\nCategory: ${category}\n\nGenerate 10-30 genuine OEM parts for this category.` },
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error('AI gateway error:', errText);
        throw new Error(`AI gateway error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content || '';

      // Parse JSON from AI response
      let parts: Array<{ oem_number: string; part_name: string; manufacturer?: string }> = [];
      try {
        // Try to extract JSON array from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parts = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        console.error('Failed to parse AI response:', content.substring(0, 500));
        return jsonResponse({ success: false, error: 'Failed to parse AI response', raw: content.substring(0, 200) });
      }

      if (parts.length === 0) {
        return jsonResponse({ success: false, error: 'AI returned no parts', raw: content.substring(0, 200) });
      }

      // Ensure/create category in DB
      let categoryId: string;
      const { data: existingCat } = await supabase
        .from('epc_categories')
        .select('id')
        .eq('brand', config.brand)
        .eq('model', model)
        .eq('category', category)
        .maybeSingle();

      if (existingCat) {
        categoryId = existingCat.id;
      } else {
        const { data: newCat, error: catErr } = await supabase
          .from('epc_categories')
          .insert({
            brand: config.brand,
            model: model,
            engine: engine,
            category: category,
            year_from: config.year_from,
            year_to: config.year_to,
          })
          .select('id')
          .single();

        if (catErr) throw new Error(`Category insert error: ${catErr.message}`);
        categoryId = newCat.id;
      }

      // Insert parts
      const insertRows = parts
        .filter(p => p.oem_number && p.oem_number.length >= 5)
        .map(p => ({
          epc_category_id: categoryId,
          oem_number: p.oem_number.replace(/[\s-]/g, ''),
          part_name: p.part_name || `Díl ${p.oem_number}`,
          manufacturer: p.manufacturer || 'Mopar',
        }));

      let inserted = 0;
      if (insertRows.length > 0) {
        const { error: insertErr } = await supabase.from('epc_part_links').insert(insertRows);
        if (insertErr) {
          console.error('Parts insert error:', insertErr.message);
        } else {
          inserted = insertRows.length;
        }
      }

      // Also insert/update parts_new for price lookups
      for (const part of insertRows) {
        const { data: existing } = await supabase
          .from('parts_new')
          .select('id')
          .eq('oem_number', part.oem_number)
          .maybeSingle();

        if (!existing) {
          await supabase.from('parts_new').insert({
            oem_number: part.oem_number,
            name: part.part_name,
            manufacturer: part.manufacturer,
            category: category,
            compatible_vehicles: `${config.brand} ${model} ${engine}`,
            catalog_source: 'epc-ai',
          });
        }
      }

      return jsonResponse({
        success: true,
        vehicle, category, engine,
        parts_generated: parts.length,
        parts_inserted: inserted,
        parts: insertRows.map(p => ({ oem_number: p.oem_number, part_name: p.part_name })),
      });
    }

    // Generate ALL categories for a vehicle
    if (action === 'generate-all') {
      if (!vehicle) {
        return jsonResponse({ success: false, error: 'vehicle required' }, 400);
      }

      const config = VEHICLE_CONFIGS[vehicle];
      if (!config) {
        return jsonResponse({ success: false, error: `Vehicle not found: ${vehicle}` }, 400);
      }

      const engine = body.engine || config.engines[0];
      const results: Array<{ category: string; parts: number; status: string }> = [];

      for (const cat of EPC_CATEGORIES) {
        try {
          // Recursive call to generate
          const genResp = await fetch(`${SUPABASE_URL}/functions/v1/epc-scrape`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ vehicle, category: cat, engine, action: 'generate' }),
          });

          const genData = await genResp.json();
          results.push({ 
            category: cat, 
            parts: genData.parts_inserted || 0, 
            status: genData.success ? 'ok' : (genData.error || 'error'),
          });

          // Rate limit
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          results.push({ category: cat, parts: 0, status: `error: ${err}` });
        }
      }

      const totalParts = results.reduce((sum, r) => sum + r.parts, 0);
      return jsonResponse({ success: true, vehicle, engine, total_parts: totalParts, results });
    }

    return jsonResponse({ success: false, error: 'Invalid action. Use: list, generate, generate-all' }, 400);
  } catch (error) {
    console.error('epc-scrape error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
