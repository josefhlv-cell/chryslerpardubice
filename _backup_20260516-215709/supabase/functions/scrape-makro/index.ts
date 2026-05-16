const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BASE = 'https://www.makro-autodily.cz';
const BRANDS: Record<string, string> = {
  chrysler: `${BASE}/nahradni-dily-na-auta/chrysler/`,
  dodge: `${BASE}/nahradni-dily-na-auta/dodge/`,
  jeep: `${BASE}/nahradni-dily-na-auta/jeep/`,
  lancia: `${BASE}/nahradni-dily-na-auta/lancia/`,
  hummer: `${BASE}/nahradni-dily-na-auta/hummer/`,
  cadillac: `${BASE}/nahradni-dily-na-auta/cadillac/`,
};

interface Product {
  brand: string;
  model: string;
  engine: string;
  category: string;
  name: string;
  catalog_number: string;
  ean: string;
  manufacturer: string;
  image_url: string;
  detail_url: string;
  availability: string;
  params: string;
}

async function firecrawlScrape(apiKey: string, url: string): Promise<{ html: string; markdown: string } | null> {
  try {
    const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['html', 'markdown'],
        waitFor: 3000,
      }),
    });
    
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`Firecrawl error for ${url}: ${resp.status} ${err}`);
      return null;
    }
    
    const data = await resp.json();
    return {
      html: data.data?.html || data.html || '',
      markdown: data.data?.markdown || data.markdown || '',
    };
  } catch (e) {
    console.error(`Firecrawl fetch error: ${e}`);
    return null;
  }
}

function extractModelUrls(html: string, brandUrl: string): Array<{ url: string; name: string }> {
  const models: Array<{ url: string; name: string }> = [];
  const seen = new Set<string>();
  
  // Parse href links that are model-level (one deeper than brand)
  const brandPath = new URL(brandUrl).pathname;
  const brandDepth = brandPath.replace(/\/$/, '').split('/').length;
  
  const linkRegex = /href="([^"]*nahradni-dily-na-auta[^"]*)"[^>]*(?:title="([^"]*)")?/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    if (!href.startsWith('http')) href = BASE + href;
    
    const path = new URL(href).pathname;
    const depth = path.replace(/\/$/, '').split('/').length;
    
    if (depth === brandDepth + 1 && !seen.has(href) && href !== brandUrl) {
      seen.add(href);
      const name = match[2] || path.split('/').filter(Boolean).pop() || '';
      models.push({ url: href, name: decodeURIComponent(name) });
    }
  }
  
  return models;
}

function extractEngineUrls(html: string, modelUrl: string): Array<{ url: string; name: string }> {
  const engines: Array<{ url: string; name: string }> = [];
  const seen = new Set<string>();
  const modelPath = new URL(modelUrl).pathname;
  const modelDepth = modelPath.replace(/\/$/, '').split('/').length;
  
  const linkRegex = /href="([^"]*)"[^>]*(?:title="([^"]*)")?/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    if (!href.startsWith('http')) href = BASE + href;
    
    try {
      const path = new URL(href).pathname;
      const depth = path.replace(/\/$/, '').split('/').length;
      
      if (depth === modelDepth + 1 && path.startsWith(modelPath) && !seen.has(href)) {
        seen.add(href);
        const name = match[2] || path.split('/').filter(Boolean).pop() || '';
        engines.push({ url: href, name: decodeURIComponent(name) });
      }
    } catch {}
  }
  
  return engines;
}

function extractLeafCategories(html: string, engineUrl: string): string[] {
  const allCats = new Set<string>();
  const enginePath = new URL(engineUrl).pathname;
  
  const linkRegex = /href="([^"]*)"/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    if (!href.startsWith('http')) href = BASE + href;
    
    try {
      const path = new URL(href).pathname;
      if (path.startsWith(enginePath) && path !== enginePath && path.replace(/\/$/, '') !== enginePath.replace(/\/$/, '')) {
        allCats.add(href.replace(/\/$/, ''));
      }
    } catch {}
  }
  
  // Find leaves (no children)
  const parentCats = new Set<string>();
  for (const cat of allCats) {
    for (const other of allCats) {
      if (other !== cat && other.startsWith(cat + '/')) {
        parentCats.add(cat);
        break;
      }
    }
  }
  
  const leaves = [...allCats].filter(c => !parentCats.has(c));
  return leaves.sort();
}

function parseProducts(html: string, brand: string, model: string, engine: string, categoryPath: string): Product[] {
  const products: Product[] = [];
  
  // Split by product cards
  const cardRegex = /class="[^"]*product-card-tecdoc[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*product-card-tecdoc|<\/section|$)/g;
  let cardMatch;
  
  while ((cardMatch = cardRegex.exec(html)) !== null) {
    const card = cardMatch[1];
    
    // Name & detail URL
    const titleMatch = card.match(/class="product-card-title-link"[^>]*href="([^"]*)"[^>]*title="([^"]*)"[^>]*>([^<]*)/);
    if (!titleMatch) continue;
    
    let detailUrl = titleMatch[1];
    if (detailUrl && !detailUrl.startsWith('http')) detailUrl = BASE + detailUrl;
    const name = titleMatch[3]?.trim() || titleMatch[2]?.trim() || '';
    
    // Image
    const imgMatch = card.match(/class="product-card-image"[^>]*src="([^"]*)"/);
    const imageUrl = imgMatch?.[1] || '';
    
    // Catalog number & EAN
    const catNumMatch = card.match(/Katalogové číslo produktu:\s*([^<\n]+)/);
    const catalogNum = catNumMatch?.[1]?.trim() || '';
    
    const eanMatch = card.match(/EAN kód produktu:\s*([^<\n]+)/);
    const ean = eanMatch?.[1]?.trim() || '';
    
    // Manufacturer from name
    let manufacturer = '';
    const knownManufacturers = ['TYC', 'ABAKUS', 'BOSCH', 'FEBI', 'TOPRAN', 'BILSTEIN', 'SACHS', 'LUK', 'VALEO',
      'HELLA', 'DELPHI', 'DENSO', 'NGK', 'BREMBO', 'ATE', 'TRW', 'MANN-FILTER', 'MANN', 'MAHLE',
      'MEYLE', 'SWAG', 'CORTECO', 'ELRING', 'SKF', 'SNR', 'INA', 'FAG', 'GATES',
      'DAYCO', 'CONTITECH', 'MONROE', 'KYB', 'OPTIMAL', 'NK', 'MAPCO', 'METZGER', 'VEMO', 'VAICO',
      'MAXGEAR', 'RIDEX', 'JAPANPARTS', 'BLUE PRINT', 'KRAFT', 'STABILUS', 'MAGNETI MARELLI',
      'CONTINENTAL', 'LEMFÖRDER', 'LEMFORDER', 'FERODO', 'TEXTAR', 'JURID', 'PAGID', 'ZIMMERMANN',
      'NIPPARTS', 'HERTH+BUSS', 'KAMOKA', 'KAVO', 'ASHIKA'];
    const nameUpper = name.toUpperCase();
    for (const m of knownManufacturers) {
      if (nameUpper.includes(m)) {
        manufacturer = m;
        break;
      }
    }
    
    // Availability
    const avail = card.includes('NEDOSTUPNÉ') ? 'nedostupné' : 
                  card.includes('SKLADEM') ? 'skladem' : 'na dotaz';
    
    // Technical params
    const params: Record<string, string> = {};
    const paramRegex = /(?:montovací strana|Typ světla|Design světla|levosmerný|Doplnkovy|vybavení|Typ povolení|parova|Provedení|Konstrukční|Montáž)[^:]*:\s*([^\n<]+)/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(card)) !== null) {
      const full = paramMatch[0];
      const colonIdx = full.indexOf(':');
      if (colonIdx > 0) {
        const key = full.substring(0, colonIdx).trim();
        const val = full.substring(colonIdx + 1).trim();
        if (key && val) params[key] = val;
      }
    }
    
    if (name && catalogNum) {
      products.push({
        brand,
        model,
        engine,
        category: categoryPath,
        name,
        catalog_number: catalogNum,
        ean,
        manufacturer,
        image_url: imageUrl,
        detail_url: detailUrl,
        availability: avail,
        params: Object.keys(params).length > 0 ? JSON.stringify(params) : '',
      });
    }
  }
  
  return products;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { createClient: createAuthClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const authClient = createAuthClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action, brand, modelUrl, engineUrl, categoryUrl } = body;

    // Action: list-models - get all model URLs for a brand
    if (action === 'list-models') {
      const brandUrl = BRANDS[brand];
      if (!brandUrl) {
        return new Response(
          JSON.stringify({ success: false, error: `Unknown brand: ${brand}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`Listing models for ${brand}...`);
      const result = await firecrawlScrape(apiKey, brandUrl);
      if (!result) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to scrape brand page' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const models = extractModelUrls(result.html, brandUrl);
      console.log(`Found ${models.length} models for ${brand}`);
      
      return new Response(
        JSON.stringify({ success: true, brand, models }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: list-engines - get engine URLs for a model
    if (action === 'list-engines') {
      console.log(`Listing engines for ${modelUrl}...`);
      const result = await firecrawlScrape(apiKey, modelUrl);
      if (!result) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to scrape model page' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const engines = extractEngineUrls(result.html, modelUrl);
      console.log(`Found ${engines.length} engines`);
      
      return new Response(
        JSON.stringify({ success: true, engines }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: list-categories - get leaf category URLs for an engine
    if (action === 'list-categories') {
      console.log(`Listing categories for ${engineUrl}...`);
      const result = await firecrawlScrape(apiKey, engineUrl);
      if (!result) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to scrape engine page' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const categories = extractLeafCategories(result.html, engineUrl);
      console.log(`Found ${categories.length} leaf categories`);
      
      return new Response(
        JSON.stringify({ success: true, categories }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: scrape-products - scrape products from a category page
    if (action === 'scrape-products') {
      const { brand: b, model: m, engine: e, category: cat } = body;
      // Append ppp=36 for more products
      const url = categoryUrl + (categoryUrl.includes('?') ? '&' : '?') + 'ppp=36';
      
      console.log(`Scraping products from ${categoryUrl}...`);
      const result = await firecrawlScrape(apiKey, url);
      if (!result) {
        return new Response(
          JSON.stringify({ success: true, products: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const products = parseProducts(result.html, b || '', m || '', e || '', cat || '');
      console.log(`Found ${products.length} products`);
      
      return new Response(
        JSON.stringify({ success: true, products }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: full-scrape - scrape one model completely (models -> engines -> categories -> products)
    if (action === 'full-scrape') {
      const allProducts: Product[] = [];
      const brandName = body.brand || '';
      const modelName = body.modelName || '';
      const mUrl = body.modelUrl;
      
      console.log(`Full scrape: ${brandName} ${modelName} (${mUrl})`);
      
      // Step 1: Get engines
      const engineResult = await firecrawlScrape(apiKey, mUrl);
      if (!engineResult) {
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to get engines' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const engines = extractEngineUrls(engineResult.html, mUrl);
      console.log(`  ${engines.length} engines found`);
      
      // Limit to first 3 engines to avoid timeout
      const engineSlice = engines.slice(0, 3);
      
      for (const eng of engineSlice) {
        console.log(`  Engine: ${eng.name}`);
        
        // Step 2: Get categories
        const catResult = await firecrawlScrape(apiKey, eng.url);
        if (!catResult) continue;
        
        const leaves = extractLeafCategories(catResult.html, eng.url);
        console.log(`    ${leaves.length} categories`);
        
        // Limit to first 20 categories per engine to avoid timeout
        const leafSlice = leaves.slice(0, 20);
        
        for (const leafUrl of leafSlice) {
          const catPath = leafUrl.replace(eng.url.replace(/\/$/, ''), '').replace(/^\//, '');
          const prodUrl = leafUrl + (leafUrl.includes('?') ? '&' : '?') + 'ppp=36';
          
          const prodResult = await firecrawlScrape(apiKey, prodUrl);
          if (!prodResult) continue;
          
          const prods = parseProducts(prodResult.html, brandName, modelName, eng.name, catPath);
          allProducts.push(...prods);
        }
      }
      
      console.log(`Total products for ${brandName} ${modelName}: ${allProducts.length}`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          products: allProducts,
          stats: {
            engines: engines.length,
            enginesScraped: engineSlice.length,
            totalProducts: allProducts.length,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Unknown action. Use: list-models, list-engines, list-categories, scrape-products, full-scrape' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
