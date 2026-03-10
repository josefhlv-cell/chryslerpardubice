const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// 7zap.com uses subdomain-based URLs: {brand}.7zap.com/en/{region}/
const BRAND_SLUGS: Record<string, string> = {
  'Chrysler': 'chrysler',
  'Dodge': 'dodge',
  'Jeep': 'jeep',
  'RAM': 'ram',
};

const MODEL_SLUGS: Record<string, string> = {
  '300C': '300c', '300': '300', 'Pacifica': 'pacifica', 'Town & Country': 'town-country',
  'Voyager': 'voyager', 'Grand Caravan': 'grand-caravan', 'Durango': 'durango',
  'Charger': 'charger', 'Challenger': 'challenger', 'Grand Cherokee': 'grand-cherokee',
  'Wrangler': 'wrangler', 'Cherokee': 'cherokee', 'Compass': 'compass',
  '1500': '1500',
};

const REGIONS: Record<string, string> = {
  'Chrysler': 'global', 'Dodge': 'global', 'Jeep': 'global', 'RAM': 'global',
};

function buildCatalogUrl(brand: string, model: string): string {
  const brandSlug = BRAND_SLUGS[brand] || brand.toLowerCase();
  const modelSlug = MODEL_SLUGS[model] || model.toLowerCase().replace(/[&]/g, '').replace(/\s+/g, '-');
  const region = REGIONS[brand] || 'global';
  return `https://${brandSlug}.7zap.com/en/${region}/${modelSlug}-parts-catalog/`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return jsonResponse({ success: false, error: 'Firecrawl not configured' }, 500);
    }

    const body = await req.json();
    const { brand, model, year, action } = body;

    // Action: map — discover available pages on 7zap for a brand
    if (action === 'map') {
      const brandSlug = BRAND_SLUGS[brand] || brand?.toLowerCase();
      if (!brandSlug) return jsonResponse({ success: false, error: 'Brand required' }, 400);
      const region = REGIONS[brand] || 'global';

      const mapResp = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://${brandSlug}.7zap.com/en/${region}/`,
          search: model || '',
          limit: 200,
        }),
      });

      const mapData = await mapResp.json();
      return jsonResponse({ success: mapResp.ok, links: mapData.links || [], total: mapData.links?.length || 0 });
    }

    // Action: scrape-catalog — scrape a specific model's parts catalog page
    if (action === 'scrape-catalog') {
      if (!brand || !model) return jsonResponse({ success: false, error: 'brand and model required' }, 400);

      const catalogUrl = buildCatalogUrl(brand, model);
      console.log('Scraping 7zap URL:', catalogUrl);

      const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: catalogUrl,
          formats: ['markdown', 'links'],
          onlyMainContent: true,
          waitFor: 5000,
        }),
      });

      if (!scrapeResp.ok) {
        return jsonResponse({ success: false, error: `Firecrawl error: ${scrapeResp.status}` });
      }

      const data = await scrapeResp.json();
      const md = data.data?.markdown || data.markdown || '';
      const links = data.data?.links || data.links || [];

      // Parse parts data from markdown
      const parts = parsePartsFromMarkdown(md);

      // Also extract category structure from links
      const categories = links
        .filter((l: string) => l.includes('-parts-catalog/') && l !== catalogUrl)
        .map((l: string) => {
          const match = l.match(/parts-catalog\/([^/]+)/);
          return match ? match[1].replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null;
        })
        .filter(Boolean);

      // Save to DB if we found parts
      if (parts.length > 0) {
        const saved = await saveParts(parts, brand, model, year);
        return jsonResponse({
          success: true,
          url: catalogUrl,
          parts_found: parts.length,
          parts_saved: saved,
          categories: [...new Set(parts.map(p => p.category).filter(Boolean))],
          sample: parts.slice(0, 10),
        });
      }

      return jsonResponse({
        success: true,
        url: catalogUrl,
        parts_found: 0,
        categories_found: categories,
        markdownPreview: md.substring(0, 2000),
        links: links.slice(0, 20),
        note: '7zap.com requires a subscription for detailed parts data. Categories were scraped successfully.',
      });
    }

    // Action: generate-catalog — use AI to generate realistic catalog data for a model
    if (action === 'generate-catalog') {
      if (!brand || !model) return jsonResponse({ success: false, error: 'brand and model required' }, 400);

      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) return jsonResponse({ success: false, error: 'AI not configured' }, 500);

      const prompt = `You are an expert Mopar/Chrysler/Dodge/Jeep/RAM parts specialist. Generate a comprehensive OEM parts catalog for ${brand} ${model}${year ? ` ${year}` : ''}.

Return a JSON array of parts. Each part must have REAL Mopar OEM part numbers. Include 60-80 parts across these categories:
- Motor (Engine): oil filter, air filter, spark plugs, timing belt/chain, water pump, thermostat, gaskets, valve cover, oil pan
- Převodovka (Transmission): filter, fluid, seals, mounts
- Brzdový systém (Brakes): front/rear pads, rotors, calipers, brake fluid
- Odpružení (Suspension): shocks, struts, springs, control arms, ball joints, tie rods, sway bar links
- Karoserie (Body): headlights, tail lights, side mirrors, bumper covers, grille, fender
- Elektroinstalace (Electrical): battery, alternator, starter, sensors (O2, MAP, TPS, CKP, CMP)
- Klimatizace (A/C): compressor, condenser, evaporator, dryer, expansion valve
- Výfuk (Exhaust): catalytic converter, muffler, exhaust manifold, O2 sensors
- Chladící systém (Cooling): radiator, fan, hoses, coolant reservoir, water pump
- Údržba (Maintenance): oil, coolant, brake fluid, transmission fluid, cabin filter, wiper blades

Each part: { "oem_number": "real Mopar number", "name": "Czech name", "category": "Czech category", "description": "brief Czech description" }

CRITICAL: Use REAL Mopar OEM part numbers (format like 68191349AC, 5038674AA, 04892339AB etc). Return ONLY valid JSON array.`;

      const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'You are a Mopar OEM parts database expert. Return only valid JSON arrays.' },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!aiResp.ok) {
        const errText = await aiResp.text();
        console.error('AI error:', aiResp.status, errText);
        if (aiResp.status === 402) {
          return jsonResponse({ success: false, error: 'AI kredity vyčerpány. Generování katalogu je dočasně nedostupné. Kontaktujte administrátora.' }, 503);
        }
        return jsonResponse({ success: false, error: `AI error: ${aiResp.status}` });
      }

      const aiData = await aiResp.json();
      const content = aiData.choices?.[0]?.message?.content || '';

      let parts: any[] = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) parts = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('AI parse error:', e);
        return jsonResponse({ success: false, error: 'Failed to parse AI response' });
      }

      if (parts.length === 0) {
        return jsonResponse({ success: false, error: 'No parts generated' });
      }

      // Save to DB
      const saved = await saveParts(
        parts.map(p => ({
          oem_number: p.oem_number,
          name: p.name,
          category: p.category,
          description: p.description,
        })),
        brand, model, year
      );

      // Also create EPC categories
      await saveEPCCategories(parts, brand, model, year);

      return jsonResponse({
        success: true,
        parts_generated: parts.length,
        parts_saved: saved,
        categories: [...new Set(parts.map(p => p.category).filter(Boolean))],
        sample: parts.slice(0, 10),
      });
    }

    // Action: scrape-diagram — get diagram/image links for a category
    if (action === 'scrape-diagram') {
      const { url } = body;
      if (!url) return jsonResponse({ success: false, error: 'url required' }, 400);

      const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          formats: ['markdown', 'html', 'links'],
          waitFor: 5000,
        }),
      });

      const data = await scrapeResp.json();
      const html = data.data?.html || data.html || '';
      const md = data.data?.markdown || data.markdown || '';

      const imgRegex = /src=["']([^"']*(?:diagram|schema|parts|img)[^"']*\.(?:png|jpg|gif|svg|webp))/gi;
      const images: string[] = [];
      let match;
      while ((match = imgRegex.exec(html)) !== null) {
        images.push(match[1]);
      }

      const oemRegex = /\b(\d{8}[A-Z]{2})\b/g;
      const oems: string[] = [];
      while ((match = oemRegex.exec(html)) !== null) {
        oems.push(match[1]);
      }

      return jsonResponse({
        success: true,
        images,
        oem_numbers: [...new Set(oems)],
        markdownPreview: md.substring(0, 2000),
      });
    }

    return jsonResponse({ success: false, error: 'Invalid action. Use: map, scrape-catalog, scrape-diagram, generate-catalog' }, 400);
  } catch (error) {
    console.error('7zap scrape error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

async function saveParts(parts: Array<{ oem_number: string; name: string; category?: string; description?: string }>, brand: string, model: string, year?: number): Promise<number> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let saved = 0;
  for (const part of parts) {
    if (!part.oem_number) continue;
    const { data: existing } = await supabase
      .from('parts_new')
      .select('id')
      .eq('oem_number', part.oem_number)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from('parts_new').insert({
        oem_number: part.oem_number,
        name: part.name || `Díl ${part.oem_number}`,
        category: part.category || null,
        description: part.description || null,
        compatible_vehicles: `${brand} ${model}${year ? ` ${year}` : ''}`,
        catalog_source: '7zap',
      });
      if (!error) saved++;
    }
  }
  return saved;
}

async function saveEPCCategories(parts: Array<{ category?: string }>, brand: string, model: string, year?: number) {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const categories = [...new Set(parts.map(p => p.category).filter(Boolean))];
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const { data: existing } = await supabase
      .from('epc_categories')
      .select('id')
      .eq('brand', brand)
      .eq('model', model)
      .eq('category', cat!)
      .maybeSingle();

    if (!existing) {
      await supabase.from('epc_categories').insert({
        brand,
        model,
        category: cat,
        year_from: year || 2005,
        year_to: year || 2023,
        sort_order: i,
      });
    }
  }
}

function parsePartsFromMarkdown(md: string): Array<{ oem_number: string; name: string; category: string }> {
  const parts: Array<{ oem_number: string; name: string; category: string }> = [];
  const lines = md.split('\n');
  let currentCategory = '';

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      currentCategory = headerMatch[1].trim();
      continue;
    }

    const oemMatches = line.match(/\b(\d{8,}[A-Z]{2,3})\b/g);
    if (oemMatches) {
      for (const oem of oemMatches) {
        const nameMatch = line.replace(oem, '').replace(/[|*\-#[\]()]/g, '').trim();
        parts.push({
          oem_number: oem.replace(/[\s-]/g, ''),
          name: nameMatch || `Díl ${oem}`,
          category: currentCategory,
        });
      }
    }
  }

  return parts;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
