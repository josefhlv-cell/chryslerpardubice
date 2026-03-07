const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, type } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const prompt = type === 'spz'
      ? `Analyzuj tuto fotografii a najdi SPZ (státní poznávací značku / registrační značku) vozidla. 
         Vrať POUZE SPZ ve formátu bez mezer. Pokud SPZ nenajdeš, vrať "NOT_FOUND".
         Odpověz POUZE textem SPZ, nic jiného.`
      : `Analyzuj tuto fotografii a najdi VIN kód (Vehicle Identification Number).
         VIN má přesně 17 znaků (písmena a číslice, bez písmen I, O, Q).
         Může být na štítku vozidla, technickém průkazu, nebo jiném dokumentu.
         Odstraň všechny mezery a speciální znaky.
         Pokud VIN nenajdeš nebo není validní, vrať "NOT_FOUND".
         Odpověz POUZE textem VIN (17 znaků), nic jiného.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ]},
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Příliš mnoho požadavků.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Nedostatek kreditů.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await response.text();
      console.error('AI error:', response.status, t);
      return new Response(JSON.stringify({ error: 'Chyba AI služby' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim() || 'NOT_FOUND';

    // Validate VIN format
    if (type !== 'spz') {
      const cleaned = result.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
      if (cleaned.length === 17) {
        return new Response(JSON.stringify({ vin: cleaned, raw: result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ vin: null, raw: result, error: 'VIN nenalezen nebo neplatný formát' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SPZ
    const spzCleaned = result.replace(/\s/g, '').toUpperCase();
    if (spzCleaned !== 'NOT_FOUND' && spzCleaned.length >= 5) {
      return new Response(JSON.stringify({ spz: spzCleaned, raw: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ spz: null, raw: result, error: 'SPZ nenalezena' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('vin-ocr error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
