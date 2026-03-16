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

    // Fetch the search results page
    const resp = await fetch(`https://www.lkq.cz/Search/ResultList?searchText=${encodeURIComponent(searchCode)}`, {
      headers: { 'User-Agent': ua },
      redirect: 'follow',
    });
    const html = await resp.text();
    
    // Extract the full akProductListController section with ALL data attributes
    const plMatch = html.match(/data-ng-controller="akProductListController"[^>]*/);
    
    // Also get the SearchProductController from header
    const spMatch = html.match(/data-ng-controller="akSearch2ProductController"[^>]*/);
    
    // Get all script src URLs (looking for the main AngularJS bundle)
    const allScripts = [...html.matchAll(/src="([^"]*\.js[^"]*)"/g)].map(m => m[1]);
    
    // Also look for bundled scripts (often in /bundles/)
    const bundleScripts = [...html.matchAll(/src="([^"]*(?:bundle|angular|app|main|ak\.)[^"]*)"/g)].map(m => m[1]);
    
    // Look at the full head section for script references
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const headScripts = headMatch ? [...headMatch[1].matchAll(/src="([^"]*)"/g)].map(m => m[1]) : [];
    
    // Check for the AngularJS module definition
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => ({ 
      attrs: m[0].match(/<script([^>]*)>/)?.[1] || '',
      content: m[1].trim().substring(0, 500) 
    })).filter(s => s.content.length > 0 || s.attrs.includes('src'));
    
    // Try fetching the body section to find the script tags at the bottom
    const bodyEnd = html.substring(html.length - 5000);
    const endScripts = [...bodyEnd.matchAll(/src="([^"]*)"/g)].map(m => m[1]);

    return new Response(JSON.stringify({
      productListController: plMatch?.[0]?.substring(0, 1000),
      searchProductController: spMatch?.[0]?.substring(0, 500),
      allScriptSrcs: allScripts,
      bundleScripts,
      headScripts,
      endScripts,
      inlineScripts: scripts.filter(s => s.content.length > 0).map(s => ({ preview: s.content })),
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
