const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { searchCode, method } = await req.json().catch(() => ({ searchCode: '68225170AA', method: 'firecrawl' }));
    const akUser = Deno.env.get('AUTOKELLY_USER') || '';
    const akPass = Deno.env.get('AUTOKELLY_PASS') || '';
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY') || '';

    const results: any = {};

    // Method 1: Try direct POST to /account/logonnow and then search
    if (method === 'direct' || method === 'all') {
      try {
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
        const cookieJar: Record<string, string> = {};
        const collectCookies = (resp: Response) => {
          const sc = resp.headers.getSetCookie?.() || [];
          for (const c of sc) {
            const [nv] = c.split(';');
            const eq = nv.indexOf('=');
            if (eq > 0) cookieJar[nv.substring(0, eq).trim()] = nv.substring(eq + 1).trim();
          }
        };
        const gc = () => Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');

        // Step 1: GET homepage to get cookies
        const initResp = await fetch('https://www.lkq.cz/homepage/car', { headers: { 'User-Agent': ua }, redirect: 'follow' });
        collectCookies(initResp);
        await initResp.text();

        // Step 2: POST login
        const loginResp = await fetch('https://www.lkq.cz/account/logonnow', {
          method: 'POST',
          headers: {
            'User-Agent': ua,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': gc(),
            'Referer': 'https://www.lkq.cz/homepage/car',
          },
          body: `UserName=${encodeURIComponent(akUser)}&Password=${encodeURIComponent(akPass)}`,
          redirect: 'manual',
        });
        collectCookies(loginResp);
        const loginLocation = loginResp.headers.get('location');
        const loginBody = await loginResp.text();
        
        // Follow redirect if needed
        if (loginLocation) {
          const redirUrl = loginLocation.startsWith('http') ? loginLocation : `https://www.lkq.cz${loginLocation}`;
          const r = await fetch(redirUrl, { headers: { 'User-Agent': ua, 'Cookie': gc() }, redirect: 'follow' });
          collectCookies(r);
          await r.text();
        }

        // Step 3: Try searching - try multiple AJAX endpoint patterns
        const searchEndpoints = [
          { url: `/Search/ResultList?searchText=${searchCode}`, method: 'GET' },
          { url: `/Search/ResultList`, method: 'POST', body: JSON.stringify({ searchText: searchCode }), ct: 'application/json' },
          { url: `/Search/GetProducts`, method: 'POST', body: JSON.stringify({ searchText: searchCode, owner: 'Header', elasticSearchEnabled: true }), ct: 'application/json' },
          { url: `/api/v1/search?q=${searchCode}`, method: 'GET' },
          { url: `/Search/Suggest?term=${searchCode}`, method: 'GET' },
          { url: `/Search/AutoComplete?term=${searchCode}`, method: 'GET' },
          { url: `/Search/Elastic?searchText=${searchCode}`, method: 'GET' },
          { url: `/ajax/search?q=${searchCode}`, method: 'GET' },
        ];

        const searchResults: any[] = [];
        for (const ep of searchEndpoints) {
          try {
            const fullUrl = `https://www.lkq.cz${ep.url}`;
            const fetchOpts: any = {
              method: ep.method,
              headers: {
                'User-Agent': ua,
                'Cookie': gc(),
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/html, */*',
              },
              redirect: 'follow',
            };
            if (ep.body) {
              fetchOpts.body = ep.body;
              fetchOpts.headers['Content-Type'] = ep.ct || 'application/json';
            }
            
            const r = await fetch(fullUrl, fetchOpts);
            const text = await r.text();
            const isJson = text.trim().startsWith('{') || text.trim().startsWith('[');
            
            searchResults.push({
              endpoint: ep.url,
              method: ep.method,
              status: r.status,
              contentType: r.headers.get('content-type'),
              isJson,
              bodyLength: text.length,
              preview: text.substring(0, 500),
            });
          } catch (e) {
            searchResults.push({ endpoint: ep.url, error: String(e) });
          }
        }

        results.direct = {
          loginStatus: loginResp.status,
          loginLocation,
          cookies: Object.keys(cookieJar),
          searchResults,
        };
      } catch (e) {
        results.direct = { error: String(e) };
      }
    }

    // Method 2: Firecrawl with actions
    if ((method === 'firecrawl' || method === 'all') && firecrawlKey) {
      try {
        const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: `https://www.lkq.cz/Search/ResultList?searchText=${searchCode}`,
            formats: ['markdown'],
            waitFor: 5000,
            actions: [
              { type: 'wait', milliseconds: 3000 },
              { type: 'scrape' },
            ],
          }),
        });
        const data = await resp.json();
        const md = data.data?.markdown || data.markdown || '';
        results.firecrawl = {
          status: resp.status,
          markdownLength: md.length,
          markdownPreview: md.substring(0, 2000),
        };
      } catch (e) {
        results.firecrawl = { error: String(e) };
      }
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
