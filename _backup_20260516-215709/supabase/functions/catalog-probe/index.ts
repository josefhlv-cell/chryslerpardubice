const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Test multiple URL variations and login methods
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const adminCheck = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await adminCheck.from('user_roles').select('role').eq('user_id', claimsData.claims.sub).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { searchCode } = await req.json();
    const password = Deno.env.get('CATALOG_PASS');
    if (!password) throw new Error('CATALOG_PASS not set');
    
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const results: any[] = [];

    // Test multiple URLs
    const urls = [
      'https://www.vernostsevyplaci.cz/cnd/',
      'http://www.vernostsevyplaci.cz/cnd/',
      'http://vernostsevyplaci.cz/cnd/',
      'https://vernostsevyplaci.cz/cnd/',
    ];

    for (const baseUrl of urls) {
      try {
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

        // GET
        const initResp = await fetch(baseUrl, { headers: { 'User-Agent': ua }, redirect: 'follow' });
        collectCookies(initResp);
        const initHtml = await initResp.text();
        const finalUrl = initResp.url; // Where did we end up after redirects?

        // Extract the form action from HTML
        const actionMatch = initHtml.match(/<form[^>]*action="([^"]*)"[^>]*method="post"/i);
        const formAction = actionMatch?.[1] || finalUrl;
        
        // POST login
        const loginResp = await fetch(formAction || finalUrl, {
          method: 'POST',
          headers: {
            'User-Agent': ua,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': gc(),
            'Referer': finalUrl,
          },
          body: `password=${encodeURIComponent(password)}&submit-password=${encodeURIComponent('Přihlásit')}`,
          redirect: 'manual',
        });
        collectCookies(loginResp);
        const loginBody = await loginResp.text();
        const location = loginResp.headers.get('location');

        // Follow redirect
        let pageHtml = loginBody;
        if (location) {
          const redir = location.startsWith('http') ? location : new URL(location, finalUrl).href;
          const r = await fetch(redir, { headers: { 'User-Agent': ua, 'Cookie': gc() }, redirect: 'follow' });
          collectCookies(r);
          pageHtml = await r.text();
        } else if (loginResp.status === 200) {
          // Maybe it worked and the response IS the logged-in page
          pageHtml = loginBody;
        }

        const hasLogin = pageHtml.includes('submit-password');
        const hasSearch = pageHtml.includes('Zadejte') || pageHtml.includes('VYHLEDAT') || pageHtml.includes('hledaného');

        // Try to find the search form even on "login" page - maybe the form is there
        const allForms = [...pageHtml.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/gi)];
        const formSummaries = allForms.map(f => {
          const inputs = [...f[0].matchAll(/<input[^>]*name="([^"]*)"[^>]*>/gi)].map(i => i[1]);
          return inputs.join(', ');
        });

        results.push({
          url: baseUrl,
          finalUrl,
          formAction,
          loginStatus: loginResp.status,
          location,
          cookies: Object.keys(cookieJar),
          stillOnLogin: hasLogin,
          hasSearchForm: hasSearch,
          forms: formSummaries,
          pageTextPreview: pageHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300),
        });
      } catch (e) {
        results.push({ url: baseUrl, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ results }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
