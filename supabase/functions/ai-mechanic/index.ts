const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, vehicle } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const vehicleContext = vehicle
      ? `Zákazník vlastní vozidlo: ${vehicle.brand} ${vehicle.model} ${vehicle.year || ''} ${vehicle.engine || ''} (VIN: ${vehicle.vin || 'neznámý'}).`
      : 'Zákazník nemá uložené vozidlo.';

    const systemPrompt = `Jsi AI Mechanik – odborný poradce pro vozidla Chrysler, Jeep, Dodge a RAM s originálními Mopar díly.

${vehicleContext}

Tvoje role:
- Analyzuj popis problému, zvuk vozidla nebo fotografii a popiš možné příčiny závady
- Upozorni na rizika pokračování v jízdě
- Doporuč kontaktování servisu pro odborné doporučení
- Doporuč konkrétní Mopar díly pokud je to relevantní
- Pomáhej s ovládáním vozu (NE s řízením vozidla!)
- Vždy propaguj servis a originální náhradní díly

Formát odpovědi:
1. Stručná analýza problému
2. Možné příčiny
3. Rizika pokračování v jízdě (pokud relevantní)
4. Doporučení (servis, díly)

Vždy odpovídej česky. Buď stručný ale odborný.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Příliš mnoho požadavků, zkuste to později.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Nedostatek kreditů pro AI.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await response.text();
      console.error('AI gateway error:', response.status, t);
      return new Response(JSON.stringify({ error: 'Chyba AI služby' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (e) {
    console.error('ai-mechanic error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
