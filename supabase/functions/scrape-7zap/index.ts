const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// 7zap.com URL patterns for Mopar vehicles
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

      const mapResp = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://www.7zap.com/en/car/${brandSlug}/`,
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

      const brandSlug = BRAND_SLUGS[brand] || brand.toLowerCase();
      const modelSlug = MODEL_SLUGS[model] || model.toLowerCase().replace(/\s+/g, '-');
      
      // Try different URL patterns
      const urls = [
        `https://www.7zap.com/en/car/${brandSlug}/${modelSlug}/`,
        `https://www.7zap.com/en/car/${brandSlug}/${modelSlug}${year ? `/${year}/` : '/'}`,
      ];

      let bestResult: any = null;

      for (const url of urls) {
        console.log('Scraping 7zap URL:', url);
        const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            formats: ['markdown', 'links'],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });

        if (scrapeResp.ok) {
          const data = await scrapeResp.json();
          const md = data.data?.markdown || data.markdown || '';
          const links = data.data?.links || data.links || [];
          
          if (md.length > 100) {
            bestResult = { url, markdown: md, links, markdownLength: md.length };
            break;
          }
        }
      }

      if (!bestResult) {
        return jsonResponse({ success: false, error: 'Could not scrape 7zap catalog for this model' });
      }

      // Parse parts data from markdown
      const parts = parsePartsFromMarkdown(bestResult.markdown);
      
      // Save to DB if we found parts
      if (parts.length > 0) {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        let saved = 0;
        for (const part of parts) {
          const { data: existing } = await supabase
            .from('parts_new')
            .select('id')
            .eq('oem_number', part.oem_number)
            .maybeSingle();

          if (!existing) {
            const { error } = await supabase.from('parts_new').insert({
              oem_number: part.oem_number,
              name: part.name,
              category: part.category || null,
              compatible_vehicles: `${brand} ${model}${year ? ` ${year}` : ''}`,
              catalog_source: '7zap',
            });
            if (!error) saved++;
          }
        }

        return jsonResponse({
          success: true,
          url: bestResult.url,
          parts_found: parts.length,
          parts_saved: saved,
          categories: [...new Set(parts.map(p => p.category).filter(Boolean))],
          sample: parts.slice(0, 10),
        });
      }

      return jsonResponse({
        success: true,
        url: bestResult.url,
        parts_found: 0,
        markdownPreview: bestResult.markdown.substring(0, 2000),
        links: bestResult.links.slice(0, 20),
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
      
      // Extract image URLs (diagrams)
      const imgRegex = /src=["']([^"']*(?:diagram|schema|parts|img)[^"']*\.(?:png|jpg|gif|svg|webp))/gi;
      const images: string[] = [];
      let match;
      while ((match = imgRegex.exec(html)) !== null) {
        images.push(match[1]);
      }

      // Extract OEM numbers from the page
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

    return jsonResponse({ success: false, error: 'Invalid action. Use: map, scrape-catalog, scrape-diagram' }, 400);
  } catch (error) {
    console.error('7zap scrape error:', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function parsePartsFromMarkdown(md: string): Array<{ oem_number: string; name: string; category: string }> {
  const parts: Array<{ oem_number: string; name: string; category: string }> = [];
  const lines = md.split('\n');
  let currentCategory = '';

  for (const line of lines) {
    // Detect category headers
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      currentCategory = headerMatch[1].trim();
      continue;
    }

    // Match Mopar OEM numbers (8+ digits followed by 2 letters)
    const oemMatches = line.match(/\b(\d{8,}[A-Z]{2,3})\b/g);
    if (oemMatches) {
      for (const oem of oemMatches) {
        // Try to extract name from surrounding text
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
