const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims?.sub) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    }

    const { vin } = await req.json();
    if (!vin || vin.length < 11) {
      return jsonResponse({ success: false, error: 'Valid VIN required' }, 400);
    }

    // 1. Decode via NHTSA
    console.log('Decoding VIN:', vin);
    const nhtsaResp = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${vin}?format=json`
    );
    const nhtsaData = await nhtsaResp.json();
    const r = nhtsaData.Results?.[0];
    if (!r || !r.Make) {
      return jsonResponse({ success: false, error: 'VIN not recognized by NHTSA' });
    }

    const basicInfo = {
      vin,
      brand: r.Make || '',
      model: r.Model || '',
      year: r.ModelYear || '',
      trim: r.Trim || '',
      body_class: r.BodyClass || '',
      doors: r.Doors || '',
      drive_type: r.DriveType || '',
      engine_displacement: r.DisplacementL ? `${r.DisplacementL}L` : '',
      engine_cylinders: r.EngineCylinders || '',
      engine_model: r.EngineModel || '',
      fuel_type: r.FuelTypePrimary || '',
      transmission: r.TransmissionStyle || '',
      plant_country: r.PlantCountry || '',
      plant_city: r.PlantCity || '',
      gvwr: r.GVWR || '',
      abs: r.ABS || '',
      tpms: r.TPMS || '',
      airbags: [r.AirBagLocFront, r.AirBagLocSide, r.AirBagLocCurtain].filter(Boolean).join(', '),
      error_code: r.ErrorCode || '0',
    };

    // 2. Enrich with AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ success: true, basic: basicInfo, enriched: null, note: 'AI enrichment unavailable' });
    }

    const aiPrompt = `You are an expert Mopar/Chrysler/Dodge/Jeep/RAM vehicle specialist. 
Given this decoded VIN data, provide enriched information in JSON format.

Vehicle: ${basicInfo.brand} ${basicInfo.model} ${basicInfo.year}
Trim: ${basicInfo.trim}
Engine: ${basicInfo.engine_displacement} ${basicInfo.engine_cylinders}cyl ${basicInfo.fuel_type}
Transmission: ${basicInfo.transmission}
Drive: ${basicInfo.drive_type}
Body: ${basicInfo.body_class}

Return a JSON object with these fields:
- equipment_highlights: array of 5-10 notable standard equipment features for this trim (in Czech)
- engine_specs: { hp, torque_nm, oil_capacity_l, coolant_capacity_l, oil_type, oil_filter_oem, air_filter_oem, spark_plug_oem }
- transmission_specs: { type, gears, fluid_type, fluid_capacity_l }
- service_intervals: array of { service_name (Czech), interval_km, interval_months, recommended_oem } for key maintenance items
- common_issues: array of 3-5 known common issues for this model/year (in Czech)
- tire_size: recommended OE tire size
- brake_info: { front_type, rear_type, front_pad_oem, rear_pad_oem, front_rotor_oem, rear_rotor_oem }

Only include data you're confident about. Use real Mopar OEM part numbers where possible.
Return ONLY valid JSON, no markdown.`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a Mopar vehicle expert. Return only valid JSON.' },
          { role: 'user', content: aiPrompt },
        ],
      }),
    });

    let enriched = null;
    if (aiResp.ok) {
      const aiData = await aiResp.json();
      const content = aiData.choices?.[0]?.message?.content || '';
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) enriched = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('AI parse error:', e);
      }
    }

    return jsonResponse({ success: true, basic: basicInfo, enriched });
  } catch (error) {
    console.error('VIN decode error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
