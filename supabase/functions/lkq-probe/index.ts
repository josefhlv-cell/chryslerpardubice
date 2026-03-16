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
    const resp = await fetch('https://www.lkq.cz/bundles/js?v=NAfm5ntEysGYeHx3xRU026isAOQGub48OFNcPpIwdbY1', {
      headers: { 'User-Agent': ua },
    });
    const js = await resp.text();
    
    // Find the loadDataSelf code block - the actual data loading call
    const loadDataSelfIdx = js.indexOf('loadDataSelf');
    const contexts: string[] = [];
    let searchFrom = 0;
    while (true) {
      const idx = js.indexOf('loadDataSelf', searchFrom);
      if (idx === -1) break;
      contexts.push(js.substring(Math.max(0, idx - 200), Math.min(js.length, idx + 300)));
      searchFrom = idx + 1;
    }

    // Find getProductList function
    const gplIdx = js.indexOf('getProductList');
    const gplContexts: string[] = [];
    let searchFrom2 = 0;
    while (true) {
      const idx = js.indexOf('getProductList', searchFrom2);
      if (idx === -1) break;
      gplContexts.push(js.substring(Math.max(0, idx - 100), Math.min(js.length, idx + 400)));
      searchFrom2 = idx + 1;
      if (gplContexts.length > 10) break;
    }

    // Find the akService.productList or similar
    const servicePatterns = ['akService.productList', 'akService.search', 'akService.find', 'ProductList/Data', 'ProductList/Get', 'Search/Data'];
    const serviceResults: Record<string, string[]> = {};
    for (const pat of servicePatterns) {
      const found: string[] = [];
      let from = 0;
      while (true) {
        const idx = js.indexOf(pat, from);
        if (idx === -1) break;
        found.push(js.substring(Math.max(0, idx - 50), Math.min(js.length, idx + 200)));
        from = idx + 1;
        if (found.length > 5) break;
      }
      if (found.length) serviceResults[pat] = found;
    }

    return new Response(JSON.stringify({
      loadDataSelfContexts: contexts.map(c => c.replace(/\s+/g, ' ')),
      getProductListContexts: gplContexts.map(c => c.replace(/\s+/g, ' ')).slice(0, 5),
      serviceResults: Object.fromEntries(Object.entries(serviceResults).map(([k, v]) => [k, v.map(s => s.replace(/\s+/g, ' '))])),
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
