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
    const { vehicle, category, parts } = body;

    if (!vehicle || !category) {
      return jsonResponse({ success: false, error: 'vehicle and category required' }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ success: false, error: 'AI not configured' }, 500);
    }

    // Build parts list for prompt
    const partsDesc = (parts || [])
      .slice(0, 30)
      .map((p: any, i: number) => `${i + 1}. ${p.oem_number || '?'} – ${p.part_name || 'Unknown'}`)
      .join('\n');

    const aiPrompt = `Generate an SVG technical diagram for an automotive parts catalog.

Vehicle: ${vehicle}
Category: ${category}
Parts to position:
${partsDesc || 'Generate typical parts for this category'}

Create a clean, professional SVG diagram (viewBox="0 0 800 600") showing a simplified schematic view of the ${category} system for ${vehicle}.

Requirements:
- Use simple geometric shapes (rectangles, circles, lines, paths) to represent the system
- Use a clean monochrome style with #1a1a2e for lines and #e2e8f0 for fills
- Add numbered circles (1, 2, 3...) positioned near each part's location
- Each numbered circle should have: id="part-{index}" data-oem="{oem_number}" attributes
- Make numbered circles clickable (cursor: pointer) with r="12" and fill="#2563eb"
- Add text labels in Czech near major components
- Include connecting lines/arrows showing how parts relate
- The diagram should be technically informative but visually clean
- Do NOT include any <script> tags
- Return ONLY the SVG code, starting with <svg and ending with </svg>`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert technical illustrator for automotive parts catalogs. Return ONLY valid SVG code.' },
          { role: 'user', content: aiPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      return jsonResponse({ success: false, error: `AI error: ${aiResp.status}` }, 500);
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    // Extract SVG from response
    const svgMatch = content.match(/<svg[\s\S]*<\/svg>/i);
    if (!svgMatch) {
      return jsonResponse({ success: false, error: 'No SVG generated', raw: content.substring(0, 500) });
    }

    let svg = svgMatch[0];
    // Security: strip any script tags
    svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '');

    // Optionally save to DB
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Extract brand/model from vehicle string
      const [brand, ...modelParts] = vehicle.split(' ');
      const model = modelParts.join(' ');

      // Update diagram_svg for matching categories
      await supabase
        .from('epc_categories')
        .update({ diagram_svg: svg })
        .eq('brand', brand)
        .eq('model', model)
        .eq('category', category);
    }

    return jsonResponse({ success: true, svg, vehicle, category });
  } catch (error) {
    console.error('EPC diagram error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
