const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { searchCode } = await req.json().catch(() => ({ searchCode: '68225170AA' }));
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    // Fetch the search results page as guest
    const resp = await fetch(`https://www.lkq.cz/Search/ResultList?searchText=${encodeURIComponent(searchCode)}`, {
      headers: { 'User-Agent': ua },
      redirect: 'follow',
    });
    const html = await resp.text();
    
    // Extract ALL ng-init directives - they might contain embedded product data
    const ngInits = [...html.matchAll(/ng-init="([^"]*)"/g)].map(m => m[1]);
    
    // Extract all data-* attributes from controllers
    const dataAttrs = [...html.matchAll(/data-([a-z]+)="([^"]{20,})"/g)].map(m => ({ attr: m[1], value: m[2].substring(0, 200) }));
    
    // Look for JSON-like data in script tags
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
      .map(m => m[1].trim())
      .filter(s => s.length > 0);
    
    // Extract JS bundle URLs
    const jsUrls = [...html.matchAll(/src="([^"]*\.js[^"]*)"/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i);
    
    // Look for API URLs in script content
    const apiUrls: string[] = [];
    for (const script of scripts) {
      const matches = [...script.matchAll(/['"]\/([A-Z][a-z]+(?:\/[A-Za-z0-9]+)+)['"]/g)];
      for (const m of matches) {
        if (!apiUrls.includes(m[1])) apiUrls.push(m[1]);
      }
    }
    
    // Look for $http patterns
    const httpPatterns: string[] = [];
    for (const script of scripts) {
      const matches = [...script.matchAll(/\$http[^;]{0,200}/g)];
      for (const m of matches) {
        httpPatterns.push(m[0].substring(0, 200));
      }
    }

    // Find the product list controller section 
    const productListMatch = html.match(/data-ng-controller="akProductListController"[\s\S]{0,5000}/);
    
    // Look for data URLs like /data/ or /api/ or /Search/
    const dataUrls = [...html.matchAll(/['"](\/(Search|Product|Catalog|Data|Api|api|Cart|Account)[A-Za-z0-9\/\?=&]*)['"]/g)]
      .map(m => m[1])
      .filter((v, i, a) => a.indexOf(v) === i);

    return new Response(JSON.stringify({
      htmlLength: html.length,
      ngInits: ngInits.map(i => i.substring(0, 300)),
      jsUrls,
      apiUrls: apiUrls.slice(0, 30),
      dataUrls: dataUrls.slice(0, 30),
      httpPatterns: httpPatterns.slice(0, 10),
      scriptsCount: scripts.length,
      scriptLengths: scripts.map(s => s.length),
      productListControllerPreview: productListMatch?.[0]?.substring(0, 500),
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
