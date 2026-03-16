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
    const akUser = Deno.env.get('AUTOKELLY_USER') || '';
    const akPass = Deno.env.get('AUTOKELLY_PASS') || '';
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

    // Step 1: GET homepage to get session + CSRF token
    console.log('Step 1: GET homepage');
    const initResp = await fetch('https://www.lkq.cz/homepage/car', { headers: { 'User-Agent': ua }, redirect: 'follow' });
    collectCookies(initResp);
    const initHtml = await initResp.text();
    
    // Extract __RequestVerificationToken from hidden input
    const tokenMatch = initHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]*)"/);
    const csrfToken = tokenMatch?.[1] || '';
    
    // Also extract from cookie
    const cookieToken = cookieJar['__RequestVerificationToken'] || '';
    
    console.log('CSRF token found:', !!csrfToken, 'length:', csrfToken.length);
    console.log('Cookie token found:', !!cookieToken);
    console.log('Cookies:', Object.keys(cookieJar));

    // Step 2: POST login with CSRF token
    console.log('Step 2: POST login');
    const loginBody = new URLSearchParams();
    loginBody.set('UserName', akUser);
    loginBody.set('Password', akPass);
    if (csrfToken) loginBody.set('__RequestVerificationToken', csrfToken);
    
    const loginResp = await fetch('https://www.lkq.cz/account/logonnow', {
      method: 'POST',
      headers: {
        'User-Agent': ua,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': gc(),
        'Referer': 'https://www.lkq.cz/homepage/car',
        'Origin': 'https://www.lkq.cz',
      },
      body: loginBody.toString(),
      redirect: 'manual',
    });
    collectCookies(loginResp);
    const loginStatus = loginResp.status;
    const loginLocation = loginResp.headers.get('location');
    const loginResponseBody = await loginResp.text();
    
    console.log('Login status:', loginStatus);
    console.log('Login redirect:', loginLocation);
    console.log('Cookies after login:', Object.keys(cookieJar));

    // Follow redirect
    let loggedInHtml = loginResponseBody;
    if (loginLocation) {
      const redirUrl = loginLocation.startsWith('http') ? loginLocation : `https://www.lkq.cz${loginLocation}`;
      console.log('Following redirect to:', redirUrl);
      const r = await fetch(redirUrl, { headers: { 'User-Agent': ua, 'Cookie': gc() }, redirect: 'follow' });
      collectCookies(r);
      loggedInHtml = await r.text();
    }

    // Check if logged in
    const isLoggedIn = loggedInHtml.includes('Odhlásit') || loggedInHtml.includes('akLogoutController') || !loggedInHtml.includes('logonnow');
    console.log('Is logged in:', isLoggedIn);

    // Step 3: Try to get the search page with XHR header
    console.log('Step 3: Search for', searchCode);
    const searchResp = await fetch(`https://www.lkq.cz/Search/ResultList?searchText=${encodeURIComponent(searchCode)}`, {
      headers: {
        'User-Agent': ua,
        'Cookie': gc(),
        'X-Requested-With': 'XMLHttpRequest',
      },
      redirect: 'follow',
    });
    collectCookies(searchResp);
    const searchHtml = await searchResp.text();
    
    // Look for AngularJS data attributes that show the search controller config
    const controllerMatch = searchHtml.match(/data-ng-controller="akSearch2(?:Product)?Controller"[^>]*/g);
    
    // Look for any inline JSON data or ng-init
    const ngInitMatch = searchHtml.match(/ng-init="([^"]*)"/g);
    
    // Look for script tags with search-related URLs
    const scriptUrls = [...searchHtml.matchAll(/['"](\/?(?:api|search|Search|Ajax)[^'"]*)['"]/gi)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i);
    
    // Extract all ng-controller names
    const controllers = [...searchHtml.matchAll(/data-ng-controller="([^"]*)"/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i);
    
    // Look for $http or ajax URLs in inline scripts
    const inlineScripts = [...searchHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.length > 50 && s.length < 5000);
    
    // Look for API base URL patterns
    const apiPatterns = [...searchHtml.matchAll(/['"]\/[A-Z][a-z]+\/[A-Z][a-zA-Z]+['"]/g)].map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i);

    // Extract any product data already rendered
    const productLinks = [...searchHtml.matchAll(/href="\/Product\/([^"]+)"/g)].map(m => m[1]).slice(0, 10);

    return new Response(JSON.stringify({
      loginStatus,
      loginLocation,
      isLoggedIn,
      csrfTokenFound: !!csrfToken,
      cookiesAfterLogin: Object.keys(cookieJar),
      searchHtmlLength: searchHtml.length,
      controllers,
      controllerConfigs: controllerMatch?.slice(0, 5),
      ngInits: ngInitMatch?.slice(0, 5),
      scriptUrls: scriptUrls.slice(0, 20),
      apiPatterns: apiPatterns.slice(0, 20),
      productLinks,
      inlineScriptsCount: inlineScripts.length,
      inlineScriptPreviews: inlineScripts.slice(0, 3).map(s => s.substring(0, 300)),
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
