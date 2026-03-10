const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { oem_number, part_name, action } = body;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Action: lookup — check existing cross-references in DB
    if (action === 'lookup') {
      if (!oem_number) return jsonResponse({ success: false, error: 'oem_number required' }, 400);

      const normalized = oem_number.replace(/[\s-]/g, '').toUpperCase();

      // Check supersessions
      const [{ data: supersededBy }, { data: supersedes }] = await Promise.all([
        supabase.from('part_supersessions').select('*').eq('old_oem_number', normalized),
        supabase.from('part_supersessions').select('*').eq('new_oem_number', normalized),
      ]);

      return jsonResponse({
        success: true,
        oem_number: normalized,
        superseded_by: supersededBy || [],
        supersedes: supersedes || [],
      });
    }

    // Action: generate — use AI to find cross-references
    if (action === 'generate') {
      if (!oem_number) return jsonResponse({ success: false, error: 'oem_number required' }, 400);

      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) return jsonResponse({ success: false, error: 'AI not available' }, 500);

      const normalized = oem_number.replace(/[\s-]/g, '').toUpperCase();

      const aiPrompt = `You are an expert in Mopar OEM parts cross-referencing.

For OEM part number: ${normalized}
${part_name ? `Part name: ${part_name}` : ''}

Find cross-reference information:
1. If this OEM number has been superseded, provide the new number
2. List aftermarket alternatives from known brands (Dorman, Gates, Dayco, Monroe, Wagner, ACDelco, Bosch, Mann, Mahle, NGK, Denso, KYB, Moog, TRW, Febi, etc.)
3. For each alternative, provide the manufacturer's part number

Return JSON:
{
  "oem_number": "${normalized}",
  "part_name": "Czech name of the part",
  "superseded_by": "new OEM number or null",
  "supersedes": "old OEM number or null", 
  "alternatives": [
    { "manufacturer": "Brand", "part_number": "123456", "note": "optional note in Czech" }
  ]
}

Only include REAL, verified part numbers. If unsure, omit.
Return ONLY valid JSON.`;

      const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'You are a Mopar parts cross-reference expert. Return only valid JSON.' },
            { role: 'user', content: aiPrompt },
          ],
        }),
      });

      if (!aiResp.ok) {
        if (aiResp.status === 402) {
          return jsonResponse({ success: false, error: 'AI kredity vyčerpány.' }, 503);
        }
        return jsonResponse({ success: false, error: `AI error: ${aiResp.status}` }, 500);
      }

      const aiData = await aiResp.json();
      const content = aiData.choices?.[0]?.message?.content || '';

      let crossRef: any = null;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) crossRef = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('Parse error:', e);
        return jsonResponse({ success: false, error: 'Failed to parse AI response' });
      }

      if (!crossRef) {
        return jsonResponse({ success: false, error: 'No cross-reference data generated' });
      }

      // Save supersession to DB if found
      if (crossRef.superseded_by) {
        const newOem = crossRef.superseded_by.replace(/[\s-]/g, '').toUpperCase();
        const { data: existing } = await supabase
          .from('part_supersessions')
          .select('id')
          .eq('old_oem_number', normalized)
          .eq('new_oem_number', newOem)
          .maybeSingle();

        if (!existing) {
          await supabase.from('part_supersessions').insert({
            old_oem_number: normalized,
            new_oem_number: newOem,
            source: 'ai-crossref',
          });
        }
      }

      return jsonResponse({ success: true, ...crossRef });
    }

    return jsonResponse({ success: false, error: 'Invalid action. Use: lookup, generate' }, 400);
  } catch (error) {
    console.error('OEM crossref error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
