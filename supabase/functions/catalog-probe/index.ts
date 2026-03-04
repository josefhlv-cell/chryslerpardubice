const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, searchCode } = await req.json();
    const password = Deno.env.get('CATALOG_PASS');
    const catalogUrl = 'https://www.vernostsevyplaci.cz/cnd/';
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    const browserHeaders = {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    };

    // Collect ALL cookies across requests
    const cookieJar: Record<string, string> = {};
    
    const collectCookies = (resp: Response) => {
      const setCookies = resp.headers.getSetCookie?.() || [];
      for (const sc of setCookies) {
        const parts = sc.split(';')[0].split('=');
        const name = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        cookieJar[name] = value;
      }
    };

    const getCookieHeader = () => 
      Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');

    // Step 1: Initial GET to get session + CF cookies
    console.log('Step 1: GET initial page');
    const initResp = await fetch(catalogUrl, {
      headers: { ...browserHeaders },
      redirect: 'follow',
    });
    collectCookies(initResp);
    const initBody = await initResp.text();
    console.log('Init cookies:', Object.keys(cookieJar));
    console.log('Init status:', initResp.status);

    // Step 2: POST login
    console.log('Step 2: POST login');
    const loginResp = await fetch(catalogUrl, {
      method: 'POST',
      headers: {
        ...browserHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': getCookieHeader(),
        'Origin': 'https://www.vernostsevyplaci.cz',
        'Referer': catalogUrl,
        'Sec-Fetch-Site': 'same-origin',
      },
      body: `password=${encodeURIComponent(password || '')}&submit-password=${encodeURIComponent('Přihlásit')}`,
      redirect: 'manual',
    });
    collectCookies(loginResp);
    const loginBody = await loginResp.text();
    const loginLocation = loginResp.headers.get('location');
    console.log('Login status:', loginResp.status);
    console.log('Login location:', loginLocation);
    console.log('Login cookies after:', Object.keys(cookieJar));

    // Step 3: Follow redirect or GET page
    let pageHtml = loginBody;
    let pageUrl = catalogUrl;
    
    if (loginResp.status === 301 || loginResp.status === 302 || loginLocation) {
      const redirectUrl = loginLocation?.startsWith('http') 
        ? loginLocation 
        : `https://www.vernostsevyplaci.cz${loginLocation}`;
      console.log('Step 3: Following redirect to', redirectUrl);
      const pageResp = await fetch(redirectUrl, {
        headers: {
          ...browserHeaders,
          'Cookie': getCookieHeader(),
          'Referer': catalogUrl,
        },
        redirect: 'follow',
      });
      collectCookies(pageResp);
      pageHtml = await pageResp.text();
      pageUrl = pageResp.url;
    } else {
      // No redirect - check if login worked (page might have changed)
      console.log('No redirect, checking if login succeeded');
      const getResp = await fetch(catalogUrl, {
        headers: {
          ...browserHeaders,
          'Cookie': getCookieHeader(),
          'Referer': catalogUrl,
        },
        redirect: 'follow',
      });
      collectCookies(getResp);
      pageHtml = await getResp.text();
      pageUrl = getResp.url;
    }

    // Check if we're past login
    const stillOnLogin = pageHtml.includes('submit-password') && pageHtml.includes('name="password"') && !pageHtml.includes('Zadejte kód hledaného dílu');
    const hasSearchForm = pageHtml.includes('Zadejte kód') || pageHtml.includes('VYHLEDAT') || pageHtml.includes('hledaného dílu');

    // If we have the search form and a search code, do the search
    let searchResult = null;
    if (hasSearchForm && searchCode) {
      // Find the search form action and field names
      const formMatch = pageHtml.match(/<form[^>]*action="([^"]*)"[^>]*>([\s\S]*?)<\/form>/i);
      if (formMatch) {
        const formAction = formMatch[1] || catalogUrl;
        const inputMatch = formMatch[2].match(/<input[^>]*name="([^"]*)"[^>]*placeholder="[^"]*kód/i);
        const fieldName = inputMatch?.[1] || 'search';
        const submitMatch = formMatch[2].match(/<input[^>]*name="([^"]*)"[^>]*type="submit"/i);
        const submitName = submitMatch?.[1] || 'submit';
        const submitValue = formMatch[2].match(/value="([^"]*)"[^>]*type="submit"/i)?.[1] || 'Vyhledat';

        console.log('Search form:', { formAction, fieldName, submitName, submitValue });

        const searchUrl = formAction.startsWith('http') ? formAction : `https://www.vernostsevyplaci.cz${formAction}`;
        const searchResp = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            ...browserHeaders,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': getCookieHeader(),
            'Referer': catalogUrl,
          },
          body: `${fieldName}=${encodeURIComponent(searchCode)}&${submitName}=${encodeURIComponent(submitValue)}`,
          redirect: 'follow',
        });
        const searchHtml = await searchResp.text();
        const searchText = searchHtml
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        searchResult = {
          status: searchResp.status,
          textPreview: searchText.substring(0, 5000),
          htmlSnippet: searchHtml.substring(0, 3000),
        };
      }
    }

    // Extract text content
    const textContent = pageHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract forms
    const formMatches = pageHtml.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/gi);
    const forms = [];
    for (const m of formMatches) forms.push(m[0].substring(0, 1000));

    return new Response(
      JSON.stringify({
        stillOnLogin,
        hasSearchForm,
        pageUrl,
        cookies: Object.keys(cookieJar),
        textContentPreview: textContent.substring(0, 4000),
        forms,
        searchResult,
      }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Probe error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
