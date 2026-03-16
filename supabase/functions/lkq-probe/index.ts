const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    
    // Fetch the main JS bundle
    const resp = await fetch('https://www.lkq.cz/bundles/js?v=NAfm5ntEysGYeHx3xRU026isAOQGub48OFNcPpIwdbY1', {
      headers: { 'User-Agent': ua },
    });
    const js = await resp.text();
    
    // Search for API endpoints - look for URL patterns
    const patterns = [
      /['"]\/(?:Product|Search|Catalog|Cart|Api|Data)[A-Za-z]*\/[A-Za-z]+['"]/g,
      /url\s*[:=]\s*['"]([^'"]+)['"]/g,
      /FindResult/g,
      /loadDataSelf|loaddataself/gi,
      /GetProducts|getProducts/g,
      /ElasticSearch|elasticSearch/gi,
      /ProductList/g,
    ];
    
    const results: Record<string, string[]> = {};
    
    for (const pattern of patterns) {
      const key = pattern.source.substring(0, 30);
      const matches = [...js.matchAll(pattern)].map(m => {
        // Get context around the match
        const start = Math.max(0, m.index! - 50);
        const end = Math.min(js.length, m.index! + m[0].length + 50);
        return js.substring(start, end).replace(/\s+/g, ' ');
      });
      results[key] = matches.slice(0, 15);
    }

    // Special: find all URL strings that look like API endpoints
    const apiEndpoints = [...js.matchAll(/['"]\/[A-Z][a-z]+\/[A-Z][a-zA-Z]+(?:\/[A-Za-z]+)*['"]/g)]
      .map(m => m[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 50);

    return new Response(JSON.stringify({
      bundleSize: js.length,
      apiEndpoints,
      patterns: results,
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
