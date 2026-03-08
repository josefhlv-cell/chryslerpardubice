/**
 * EPC Catalog Generator — Categories Only (optimized, no timeout risk)
 * Generates EPC categories + queues batch part generation.
 * Parts are generated lazily via epc-generate-batch.
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

    const vehicleDesc = `${brand} ${model}${year ? ` ${year}` : ''}${engine ? ` (${engine})` : ''}`;

    // Step 1: Check if categories already exist
    const { data: existingCats } = await supabase
      .from('epc_categories')
      .select('id, category, subcategory')
      .eq('brand', brand)
      .eq('model', model);

    if (existingCats && existingCats.length > 0) {
      return jsonResponse({
        success: true,
        vehicle: vehicleDesc,
        cached: true,
        stats: { categories: existingCats.length, parts: 0 },
        categories_list: [...new Set(existingCats.map((c: any) => c.category))],
      });
    }

    // Step 2: Try scraping 7zap for real category structure
    let scrapedMarkdown = '';
    const FIRECRAWL_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (FIRECRAWL_KEY) {
      try {
        const brandSlug = brand.toLowerCase();
        const modelSlug = model.toLowerCase().replace(/[&]/g, '').replace(/\s+/g, '-');
        const url = `https://${brandSlug}.7zap.com/en/global/${modelSlug}-parts-catalog/`;
        const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, waitFor: 5000 }),
        });
        if (scrapeResp.ok) {
          const d = await scrapeResp.json();
          scrapedMarkdown = d.data?.markdown || '';
        }
      } catch (e) {
        console.error('Scrape fallback:', e);
      }
    }

    // Step 3: AI — generate ONLY categories (fast, <20s)
    const aiPrompt = `You are an expert Mopar/Chrysler/Dodge/Jeep/RAM parts catalog specialist.

Generate the EPC category structure for: ${vehicleDesc}

${scrapedMarkdown ? `Here is scraped catalog data:\n---\n${scrapedMarkdown.substring(0, 4000)}\n---\nExtract the category structure from this data.\n` : ''}

Return a JSON object with ONLY categories:
{
  "categories": [
    {
      "category": "Czech category name (e.g. Motor, Převodovka, Brzdy)",
      "subcategories": ["Czech subcategory 1", "Czech subcategory 2"],
      "sort_order": 1
    }
  ]
}

Requirements:
- 10-15 main categories
- 2-5 subcategories each
- Czech names only
- Categories: Motor, Převodovka, Podvozek, Karoserie, Elektronika, Vytápění a klimatizace, Palivový systém, Brzdový systém, Řízení, Výfukový systém, Filtry, Příslušenství, Osvětlení, Kola a pneumatiky, Interiér
- Return ONLY valid JSON`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: 'Return only valid JSON.' },
          { role: 'user', content: aiPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      return jsonResponse({ success: false, error: `AI error: ${aiResp.status}` }, aiResp.status >= 500 ? 500 : aiResp.status);
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    let catalog: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      catalog = JSON.parse(jsonMatch[0]);
    } catch {
      return jsonResponse({ success: false, error: 'Failed to parse AI category data' });
    }

    // Step 4: Insert categories
    let categoriesCount = 0;
    const queueItems: any[] = [];

    if (catalog.categories?.length) {
      for (let i = 0; i < catalog.categories.length; i++) {
        const cat = catalog.categories[i];
        const subcats = cat.subcategories?.length ? cat.subcategories : [null];

        for (const sub of subcats) {
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
          categoriesCount++;

          // Queue batch part generation for each category+subcategory
          queueItems.push({
            brand,
            model,
            engine: engine || null,
            year: year ? parseInt(String(year)) : null,
            category: cat.category,
            subcategory: sub || null,
            status: 'pending',
            batch_size: 50,
          });
        }
      }
    }

    // Step 5: Insert queue items for lazy/async part generation
    if (queueItems.length > 0) {
      await supabase.from('epc_generation_queue').insert(queueItems);
    }

    const uniqueCategories = [...new Set((catalog.categories || []).map((c: any) => c.category))];
    console.log(`EPC categories generated: ${categoriesCount} for ${vehicleDesc}, ${queueItems.length} batch jobs queued`);

    return jsonResponse({
      success: true,
      vehicle: vehicleDesc,
      scraped: scrapedMarkdown.length > 0,
      stats: { categories: categoriesCount, parts: 0, queued: queueItems.length },
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
