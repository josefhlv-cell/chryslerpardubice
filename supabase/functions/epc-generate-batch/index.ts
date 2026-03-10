/**
 * EPC Parts Batch Generator
 * Generates parts for a specific category/subcategory in batches of ~50.
 * Called lazily when user first views a category, or by async queue processor.
 * 
 * Also generates diagram after parts are created.
 */

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
    const { brand, model, engine, year, category, subcategory, queue_id } = body;

    if (!brand || !model || !category) {
      return jsonResponse({ success: false, error: 'brand, model, and category required' }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) return jsonResponse({ success: false, error: 'AI not configured' }, 500);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const vehicleDesc = `${brand} ${model}${year ? ` ${year}` : ''}${engine ? ` (${engine})` : ''}`;
    const fullCategory = subcategory ? `${category} > ${subcategory}` : category;

    // Update queue status if queue_id provided
    if (queue_id) {
      await supabase.from('epc_generation_queue')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', queue_id);
    }

    // Check if parts already exist for this category
    const { data: existingCats } = await supabase
      .from('epc_categories')
      .select('id')
      .eq('brand', brand)
      .eq('model', model)
      .eq('category', category)
      .eq('subcategory', subcategory || '');

    const catIds = (existingCats || []).map((c: any) => c.id);

    if (catIds.length > 0) {
      const { data: existingParts, count } = await supabase
        .from('epc_part_links')
        .select('id', { count: 'exact' })
        .in('epc_category_id', catIds)
        .limit(1);

      if (count && count > 0) {
        // Parts already exist — mark queue as done
        if (queue_id) {
          await supabase.from('epc_generation_queue')
            .update({ status: 'done', parts_generated: count, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', queue_id);
        }
        return jsonResponse({ success: true, cached: true, parts_count: count, category: fullCategory });
      }
    }

    // Generate parts via AI (batch of ~50)
    const aiPrompt = `You are an expert Mopar parts catalog specialist.

Generate REAL OEM parts for: ${vehicleDesc}
Category: ${fullCategory}

Return JSON:
{
  "parts": [
    {
      "oem_number": "REAL Mopar OEM (format: 68191349AC)",
      "name": "Czech part name",
      "manufacturer": "Mopar/Gates/Dayco/Monroe/NGK/Denso/Bosch",
      "description": "Brief Czech description",
      "position_label": "Optional position (e.g. Přední, Zadní, Levý, Pravý)"
    }
  ]
}

Requirements:
- Generate 30-50 parts for this specific category
- Use REAL Mopar OEM numbers (format: uppercase, no dashes, e.g., 68191349AC)
- Czech part names, properly normalized
- Include position labels where relevant
- Return ONLY valid JSON`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Return only valid JSON with real Mopar OEM part data.' },
          { role: 'user', content: aiPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const is402 = aiResp.status === 402;
      const errMsg = is402 ? 'AI kredity vyčerpány' : `AI error: ${aiResp.status}`;
      if (queue_id) {
        const retryCount = body.retry_count || 0;
        await supabase.from('epc_generation_queue')
          .update({ 
            status: retryCount < 3 ? 'pending' : 'failed',
            error_message: errMsg,
            retry_count: retryCount + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', queue_id);
      }
      return jsonResponse({ success: false, error: errMsg }, 500);
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      if (queue_id) {
        await supabase.from('epc_generation_queue')
          .update({ status: 'failed', error_message: 'JSON parse error', updated_at: new Date().toISOString() })
          .eq('id', queue_id);
      }
      return jsonResponse({ success: false, error: 'Failed to parse AI parts data' });
    }

    // Insert parts
    let partsInserted = 0;
    const partsForDiagram: any[] = [];

    if (parsed.parts?.length && catIds.length > 0) {
      const targetCatId = catIds[0];

      for (const part of parsed.parts) {
        if (!part.oem_number) continue;
        const oem = part.oem_number.replace(/[\s\-]/g, '').toUpperCase();

        // Upsert into parts_new
        const { data: existingPart } = await supabase
          .from('parts_new')
          .select('id')
          .eq('oem_number', oem)
          .maybeSingle();

        let partId: string | null = null;
        if (!existingPart) {
          const { data: inserted } = await supabase
            .from('parts_new')
            .insert({
              oem_number: oem,
              name: part.name || `Díl ${oem}`,
              category: category,
              description: part.description || null,
              manufacturer: part.manufacturer || 'Mopar',
              compatible_vehicles: vehicleDesc,
              catalog_source: 'ai-epc',
            })
            .select('id')
            .single();
          partId = inserted?.id || null;
        } else {
          partId = existingPart.id;
        }

        // Link to EPC category
        const { data: existingLink } = await supabase
          .from('epc_part_links')
          .select('id')
          .eq('epc_category_id', targetCatId)
          .eq('oem_number', oem)
          .maybeSingle();

        if (!existingLink) {
          await supabase.from('epc_part_links').insert({
            epc_category_id: targetCatId,
            oem_number: oem,
            part_name: part.name,
            manufacturer: part.manufacturer || 'Mopar',
            part_id: partId,
            position_label: part.position_label || null,
          });
          partsInserted++;
        }

        partsForDiagram.push({ oem_number: oem, part_name: part.name });
      }
    }

    // Auto-generate diagram for this category (fire-and-forget, won't block response)
    if (partsForDiagram.length > 0) {
      fetch(`${SUPABASE_URL}/functions/v1/epc-diagram`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          vehicle: `${brand} ${model}`,
          category,
          subcategory: subcategory || null,
          parts: partsForDiagram.slice(0, 30),
        }),
      }).catch(e => console.error('Diagram generation error:', e));
    }

    // Update queue status
    if (queue_id) {
      await supabase.from('epc_generation_queue')
        .update({
          status: 'done',
          parts_generated: partsInserted,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', queue_id);
    }

    console.log(`Batch: ${partsInserted} parts for ${vehicleDesc} / ${fullCategory}`);

    return jsonResponse({
      success: true,
      vehicle: vehicleDesc,
      category: fullCategory,
      parts_count: partsInserted,
      diagram_queued: partsForDiagram.length > 0,
    });
  } catch (error) {
    console.error('Batch generate error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
