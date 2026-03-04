const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, url } = await req.json();
    const password = Deno.env.get('CATALOG_PASS');
    const catalogUrl = 'https://www.vernostsevyplaci.cz/cnd/';
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // Step 1: GET to establish session
    const initResp = await fetch(catalogUrl, {
      headers: { 'User-Agent': ua },
    });
    const initCookies = initResp.headers.getSetCookie?.() || [];
    const sessionCookie = initCookies.map(c => c.split(';')[0]).join('; ');
    await initResp.text(); // consume body

    // Step 2: POST login with session cookie
    const loginResp = await fetch(catalogUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': ua,
        'Cookie': sessionCookie,
        'Referer': catalogUrl,
        'Origin': 'https://www.vernostsevyplaci.cz',
      },
      body: `password=${encodeURIComponent(password || '')}&submit-password=${encodeURIComponent('Přihlásit')}`,
      redirect: 'manual',
    });

    const loginCookies = loginResp.headers.getSetCookie?.() || [];
    const allCookies = [...initCookies, ...loginCookies].map(c => c.split(';')[0]);
    const cookieHeader = [...new Set(allCookies)].join('; ');
    const loginStatus = loginResp.status;
    const locationHeader = loginResp.headers.get('location');
    const loginBody = await loginResp.text();

    // Step 3: Follow redirect or GET with cookies
    const targetUrl = locationHeader || (action === 'explore_page' && url ? url : catalogUrl);
    const pageResp = await fetch(targetUrl.startsWith('http') ? targetUrl : `https://www.vernostsevyplaci.cz${targetUrl}`, {
      headers: { 'Cookie': cookieHeader, 'User-Agent': ua },
      redirect: 'follow',
    });
    const pageHtml = await pageResp.text();

    // Extract text content
    const textContent = pageHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract links
    const linkMatches = pageHtml.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi);
    const links = [];
    for (const m of linkMatches) {
      const t = m[2].replace(/<[^>]+>/g, '').trim();
      if (t && m[1] && !m[1].startsWith('javascript') && !m[1].startsWith('#')) {
        links.push({ href: m[1], text: t.substring(0, 80) });
      }
    }

    // Extract forms
    const formMatches = pageHtml.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/gi);
    const forms = [];
    for (const m of formMatches) forms.push(m[0].substring(0, 800));

    // Selects
    const selectMatches = pageHtml.matchAll(/<select[^>]*>([\s\S]*?)<\/select>/gi);
    const selects = [];
    for (const m of selectMatches) selects.push(m[0].substring(0, 1000));

    // Check if still on login page
    const stillOnLogin = pageHtml.includes('name="password"') && pageHtml.includes('submit-password');

    return new Response(
      JSON.stringify({
        loginStatus,
        locationHeader,
        initCookies: initCookies.map(c => c.split(';')[0]),
        loginCookies: loginCookies.map(c => c.split(';')[0]),
        stillOnLogin,
        pageUrl: pageResp.url,
        pageStatus: pageResp.status,
        textContentPreview: textContent.substring(0, 6000),
        links: links.slice(0, 40),
        forms,
        selects,
        loginBodySnippet: loginBody.substring(0, 500),
      }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
