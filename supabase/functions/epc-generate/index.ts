/**
 * EPC AI Catalog Generator
 * Scrapes 7zap via Firecrawl, then normalizes data with AI.
 * Inserts structured data into: epc_categories, parts_new, part_vehicle_compatibility, service_procedures.
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
    const { brand, model, year, engine } = await req.json();
    if (!brand || !model) {
      return jsonResponse({ success: false, error: 'brand and model required' }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) return jsonResponse({ success: false, error: 'AI not configured' }, 500);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Try scraping 7zap first for real data
    let scrapedMarkdown = '';
    const FIRECRAWL_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (FIRECRAWL_KEY) {
      try {
        const brandSlug = brand.toLowerCase();
        const modelSlug = model.toLowerCase().replace(/[&]/g, '').replace(/\s+/g, '-');
        const url = `https://${brandSlug}.7zap.com/en/global/${modelSlug}-parts-catalog/`;
        console.log('Scraping:', url);

        const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, formats: ['markdown', 'links'], onlyMainContent: true, waitFor: 5000 }),
        });

        if (scrapeResp.ok) {
          const d = await scrapeResp.json();
          scrapedMarkdown = d.data?.markdown || d.markdown || '';
        }
      } catch (e) {
        console.error('Scrape fallback:', e);
      }
    }

    // Step 2: AI normalization + generation
    const vehicleDesc = `${brand} ${model}${year ? ` ${year}` : ''}${engine ? ` (${engine})` : ''}`;

    const aiPrompt = `You are an expert Mopar/Chrysler/Dodge/Jeep/RAM parts catalog specialist.

Generate a complete, structured EPC catalog for: ${vehicleDesc}

${scrapedMarkdown ? `Here is raw scraped data from an online catalog:\n---\n${scrapedMarkdown.substring(0, 8000)}\n---\nUse this data to extract REAL OEM numbers and part names. Normalize and structure the data.\n` : 'Generate realistic Mopar OEM part data based on your knowledge.'}

Return a JSON object with this EXACT structure:
{
  "categories": [
    {
      "category": "Czech category name",
      "subcategories": ["Czech subcategory 1", "Czech subcategory 2"],
      "sort_order": 1
    }
  ],
  "parts": [
    {
      "oem_number": "REAL Mopar OEM number (format: 68191349AC)",
      "name": "Czech part name - properly normalized",
      "category": "Must match a category above",
      "subcategory": "Must match a subcategory above or null",
      "manufacturer": "Mopar or specific brand",
      "description": "Brief Czech description"
    }
  ],
  "compatibility": [
    {
      "oem_number": "Same OEM as in parts",
      "year_from": 2011,
      "year_to": 2023,
      "engine": "3.6L V6",
      "trim": "optional trim level or null"
    }
  ],
  "service_procedures": [
    {
      "category": "Must match a category above",
      "procedure_name": "Czech procedure name",
      "description": "Brief Czech description",
      "difficulty": "easy|medium|hard",
      "estimated_time_minutes": 30,
      "tools_needed": "Czech list of tools",
      "parts_oem_numbers": ["OEM1", "OEM2"],
      "steps": ["Krok 1: ...", "Krok 2: ..."]
    }
  ]
}

Requirements:
- Include 10-12 categories with 2-4 subcategories each
- Include 80-120 parts with REAL Mopar OEM numbers
- Normalize OEM format: no spaces, no dashes, uppercase (e.g., 68191349AC)
- Normalize manufacturer names: "Mopar", "Gates", "Dayco", "Monroe", "NGK", "Denso", "Bosch"
- Normalize part names in Czech: consistent naming (e.g., always "Olejový filtr" not "filtr oleje")
- Include 8-15 service procedures for common maintenance tasks
- Include compatibility data for each part
- Return ONLY valid JSON, no markdown`;

    console.log('Calling AI for catalog generation...');
    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a Mopar parts catalog expert. Return only valid JSON objects.' },
          { role: 'user', content: aiPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return jsonResponse({ success: false, error: 'Rate limit exceeded, try again later' }, 429);
      }
      if (aiResp.status === 402) {
        return jsonResponse({ success: false, error: 'AI credits depleted' }, 402);
      }
      return jsonResponse({ success: false, error: `AI error: ${aiResp.status}` }, 500);
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    let catalog: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      catalog = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('Parse error:', e);
      return jsonResponse({ success: false, error: 'Failed to parse AI catalog data' });
    }

    // Step 3: Insert structured data
    const stats = { categories: 0, parts: 0, compatibility: 0, procedures: 0 };

    // 3a. Insert EPC categories
    if (catalog.categories?.length) {
      for (let i = 0; i < catalog.categories.length; i++) {
        const cat = catalog.categories[i];
        const subcats = cat.subcategories || [null];

        for (const sub of subcats) {
          const { data: existing } = await supabase
            .from('epc_categories')
            .select('id')
            .eq('brand', brand)
            .eq('model', model)
            .eq('category', cat.category)
            .eq('subcategory', sub || '')
            .maybeSingle();

          if (!existing) {
            await supabase.from('epc_categories').insert({
              brand,
              model,
              engine: engine || null,
              category: cat.category,
              subcategory: sub || null,
              year_from: year ? parseInt(String(year)) : 2005,
              year_to: year ? parseInt(String(year)) + 5 : 2025,
              sort_order: cat.sort_order || i,
            });
            stats.categories++;
          }
        }
      }
    }

    // 3b. Insert parts + link to EPC categories
    if (catalog.parts?.length) {
      for (const part of catalog.parts) {
        if (!part.oem_number) continue;

        // Normalize OEM
        const oem = part.oem_number.replace(/[\s\-]/g, '').toUpperCase();

        // Upsert into parts_new
        const { data: existingPart } = await supabase
          .from('parts_new')
          .select('id')
          .eq('oem_number', oem)
          .maybeSingle();

        let partId: string;
        if (!existingPart) {
          const { data: inserted } = await supabase
            .from('parts_new')
            .insert({
              oem_number: oem,
              name: part.name || `Díl ${oem}`,
              category: part.category || null,
              description: part.description || null,
              manufacturer: part.manufacturer || 'Mopar',
              compatible_vehicles: vehicleDesc,
              catalog_source: 'ai-epc',
            })
            .select('id')
            .single();
          partId = inserted?.id;
          stats.parts++;
        } else {
          partId = existingPart.id;
        }

        // Link part to EPC category
        if (partId && part.category) {
          const { data: epcCat } = await supabase
            .from('epc_categories')
            .select('id')
            .eq('brand', brand)
            .eq('model', model)
            .eq('category', part.category)
            .limit(1)
            .maybeSingle();

          if (epcCat) {
            const { data: existingLink } = await supabase
              .from('epc_part_links')
              .select('id')
              .eq('epc_category_id', epcCat.id)
              .eq('oem_number', oem)
              .maybeSingle();

            if (!existingLink) {
              await supabase.from('epc_part_links').insert({
                epc_category_id: epcCat.id,
                oem_number: oem,
                part_name: part.name,
                manufacturer: part.manufacturer || 'Mopar',
                part_id: partId,
              });
            }
          }
        }
      }
    }

    // 3c. Insert compatibility data
    if (catalog.compatibility?.length) {
      for (const comp of catalog.compatibility) {
        if (!comp.oem_number) continue;
        const oem = comp.oem_number.replace(/[\s\-]/g, '').toUpperCase();

        const { data: existing } = await supabase
          .from('part_vehicle_compatibility')
          .select('id')
          .eq('oem_number', oem)
          .eq('brand', brand)
          .eq('model', model)
          .maybeSingle();

        if (!existing) {
          await supabase.from('part_vehicle_compatibility').insert({
            oem_number: oem,
            brand,
            model,
            year_from: comp.year_from || null,
            year_to: comp.year_to || null,
            engine: comp.engine || engine || null,
            trim: comp.trim || null,
            source: 'ai-epc',
          });
          stats.compatibility++;
        }
      }
    }

    // 3d. Insert service procedures
    if (catalog.service_procedures?.length) {
      for (const proc of catalog.service_procedures) {
        const { data: existing } = await supabase
          .from('service_procedures')
          .select('id')
          .eq('brand', brand)
          .eq('model', model)
          .eq('procedure_name', proc.procedure_name)
          .maybeSingle();

        if (!existing) {
          await supabase.from('service_procedures').insert({
            brand,
            model,
            engine: engine || null,
            category: proc.category,
            procedure_name: proc.procedure_name,
            description: proc.description || null,
            difficulty: proc.difficulty || 'medium',
            estimated_time_minutes: proc.estimated_time_minutes || null,
            tools_needed: proc.tools_needed || null,
            parts_oem_numbers: proc.parts_oem_numbers || [],
            steps: proc.steps || [],
          });
          stats.procedures++;
        }
      }
    }

    // 3e. Auto-generate diagrams for each main category
    const uniqueCategories = [...new Set((catalog.categories || []).map((c: any) => c.category))];
    for (const cat of uniqueCategories) {
      const catParts = (catalog.parts || [])
        .filter((p: any) => p.category === cat)
        .slice(0, 30)
        .map((p: any) => ({ oem_number: p.oem_number, part_name: p.name }));

      try {
        // Call epc-diagram function internally via HTTP
        const SUPABASE_URL_VAL = Deno.env.get('SUPABASE_URL')!;
        const resp = await fetch(`${SUPABASE_URL_VAL}/functions/v1/epc-diagram`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            vehicle: vehicleDesc,
            category: cat,
            parts: catParts,
          }),
        });
        if (resp.ok) {
          console.log(`Diagram generated for ${cat}`);
        }
      } catch (e) {
        console.error(`Diagram generation failed for ${cat}:`, e);
      }
    }

    console.log('EPC catalog generated:', stats);

    return jsonResponse({
      success: true,
      vehicle: vehicleDesc,
      scraped: scrapedMarkdown.length > 0,
      stats,
      categories_list: uniqueCategories,
    });
  } catch (error) {
    console.error('EPC generate error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
