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

    // Step 1: Login with correct field name "password" + "submit-password"
    const loginResponse = await fetch(catalogUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: `password=${encodeURIComponent(password || '')}&submit-password=${encodeURIComponent('Přihlásit')}`,
      redirect: 'manual',
    });

    const cookies = loginResponse.headers.getSetCookie?.() || [];
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
    const loginStatus = loginResponse.status;
    const locationHeader = loginResponse.headers.get('location');
    const loginBody = await loginResponse.text();

    // Step 2: Follow redirect or fetch page with session
    const targetUrl = action === 'explore_page' && url ? url : (locationHeader || catalogUrl);
    const pageResp = await fetch(targetUrl, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
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

    // Extract all links
    const linkMatches = pageHtml.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi);
    const links = [];
    for (const m of linkMatches) {
      const linkText = m[2].replace(/<[^>]+>/g, '').trim();
      if (linkText && m[1] && !m[1].startsWith('javascript') && !m[1].startsWith('#')) {
        links.push({ href: m[1], text: linkText.substring(0, 80) });
      }
    }

    // Extract forms
    const formMatches = pageHtml.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/gi);
    const forms = [];
    for (const m of formMatches) {
      forms.push(m[0].substring(0, 800));
    }

    // Look for select/option elements (brand selectors etc)
    const selectMatches = pageHtml.matchAll(/<select[^>]*>([\s\S]*?)<\/select>/gi);
    const selects = [];
    for (const m of selectMatches) {
      selects.push(m[0].substring(0, 1000));
    }

    return new Response(
      JSON.stringify({
        loginStatus,
        locationHeader,
        cookies: cookies.map(c => c.split(';')[0]),
        pageUrl: pageResp.url,
        pageStatus: pageResp.status,
        textContentPreview: textContent.substring(0, 6000),
        linksCount: links.length,
        links: links.slice(0, 30),
        forms,
        selects,
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
