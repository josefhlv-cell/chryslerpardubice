const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';

async function createSession(password: string): Promise<{ cookies: string; loggedIn: boolean; searchFormHtml: string }> {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  const cookieJar: Record<string, string> = {};
  
  const collectCookies = (resp: Response) => {
    const setCookies = resp.headers.getSetCookie?.() || [];
    for (const sc of setCookies) {
      const [nameVal] = sc.split(';');
      const eqIdx = nameVal.indexOf('=');
      if (eqIdx > 0) {
        cookieJar[nameVal.substring(0, eqIdx).trim()] = nameVal.substring(eqIdx + 1).trim();
      }
    }
  };
  const getCookie = () => Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');

  // Step 1: GET to get PHPSESSID
  console.log('Step 1: GET initial page');
  const initResp = await fetch(CATALOG_URL, {
    headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  });
  collectCookies(initResp);
  await initResp.text();
  console.log('Got cookies:', Object.keys(cookieJar));

  // Step 2: POST login with manual redirect to preserve cookies
  console.log('Step 2: POST login');
  const loginResp = await fetch(CATALOG_URL, {
    method: 'POST',
    headers: {
      'User-Agent': ua,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': getCookie(),
      'Origin': 'https://www.vernostsevyplaci.cz',
      'Referer': CATALOG_URL,
      'Accept': 'text/html,application/xhtml+xml',
    },
    body: `password=${encodeURIComponent(password)}&submit-password=${encodeURIComponent('Přihlásit')}`,
    redirect: 'manual',
  });
  collectCookies(loginResp);
  await loginResp.text();
  const loginLocation = loginResp.headers.get('location');
  console.log('Login status:', loginResp.status, 'Location:', loginLocation, 'Cookies:', Object.keys(cookieJar));

  // Step 3: Follow redirect(s) manually with cookies
  let loginHtml = '';
  if (loginLocation || loginResp.status === 301 || loginResp.status === 302) {
    const redir = loginLocation?.startsWith('http') ? loginLocation : `https://www.vernostsevyplaci.cz${loginLocation || '/cnd/'}`;
    console.log('Step 3: Following redirect to', redir);
    const redirResp = await fetch(redir, {
      headers: { 'User-Agent': ua, 'Cookie': getCookie(), 'Referer': CATALOG_URL, 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    collectCookies(redirResp);
    loginHtml = await redirResp.text();
    console.log('Redirect status:', redirResp.status, 'URL:', redirResp.url);
  } else {
    // No redirect - re-GET with cookies
    console.log('Step 3: No redirect, re-GET with cookies');
    const getResp = await fetch(CATALOG_URL, {
      headers: { 'User-Agent': ua, 'Cookie': getCookie(), 'Referer': CATALOG_URL, 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    collectCookies(getResp);
    loginHtml = await getResp.text();
    console.log('Re-GET status:', getResp.status);
  }

  // Check if we're past login
  const hasSearchForm = loginHtml.includes('Zadejte') || loginHtml.includes('hledaného') || 
                         loginHtml.includes('VYHLEDAT') || loginHtml.includes('search');
  const stillOnLogin = loginHtml.includes('submit-password') && loginHtml.includes('name="password"');
  
  console.log('Has search form:', hasSearchForm, 'Still on login:', stillOnLogin);
  console.log('Page snippet:', loginHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500));

  return { 
    cookies: getCookie(), 
    loggedIn: !stillOnLogin || hasSearchForm,
    searchFormHtml: loginHtml
  };
}

async function searchPart(cookies: string, searchCode: string, pageHtml: string): Promise<{ price_with_vat: number; price_without_vat: number } | null> {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  // Find the search form in the HTML
  const formMatch = pageHtml.match(/<form[^>]*action="([^"]*)"[^>]*method="post"[^>]*>([\s\S]*?)<\/form>/gi);
  let searchFormAction = CATALOG_URL;
  let searchFieldName = 'search';
  let submitFieldName = 'submit-search';
  let submitValue = 'Vyhledat';

  if (formMatch) {
    for (const form of formMatch) {
      // Skip login form
      if (form.includes('submit-password')) continue;
      
      const actionMatch = form.match(/action="([^"]*)"/);
      if (actionMatch) searchFormAction = actionMatch[1] || CATALOG_URL;
      
      const inputMatch = form.match(/<input[^>]*name="([^"]*)"[^>]*(?:placeholder|type="text")/i);
      if (inputMatch) searchFieldName = inputMatch[1];
      
      const submitMatch = form.match(/<input[^>]*name="([^"]*)"[^>]*type="submit"[^>]*value="([^"]*)"/i);
      if (!submitMatch) {
        const submitMatch2 = form.match(/<input[^>]*type="submit"[^>]*name="([^"]*)"[^>]*value="([^"]*)"/i);
        if (submitMatch2) { submitFieldName = submitMatch2[1]; submitValue = submitMatch2[2]; }
      } else { submitFieldName = submitMatch[1]; submitValue = submitMatch[2]; }
      
      console.log('Found search form:', { searchFormAction, searchFieldName, submitFieldName, submitValue });
      break;
    }
  }

  if (!searchFormAction.startsWith('http')) {
    searchFormAction = `https://www.vernostsevyplaci.cz${searchFormAction}`;
  }

  const searchResp = await fetch(searchFormAction, {
    method: 'POST',
    headers: {
      'User-Agent': ua,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'Referer': CATALOG_URL,
      'Accept': 'text/html,application/xhtml+xml',
    },
    body: `${searchFieldName}=${encodeURIComponent(searchCode)}&${submitFieldName}=${encodeURIComponent(submitValue)}`,
    redirect: 'follow',
  });

  const html = await searchResp.text();
  console.log('Search response for', searchCode, '- status:', searchResp.status, 'length:', html.length);

  // Extract prices from HTML
  const allPrices: number[] = [];
  
  // Pattern: Czech price formats
  const pricePatterns = [
    /(\d[\d\s]*[,.]?\d*)\s*Kč/gi,
    /cena[^<]*?(\d[\d\s,.]*)/gi,
    /<td[^>]*>\s*(\d[\d\s]*[,.]\d{2})\s*<\/td>/gi,
  ];

  for (const pattern of pricePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const priceStr = match[1].replace(/\s/g, '').replace(',', '.');
      const price = parseFloat(priceStr);
      if (price > 1 && price < 1000000) {
        allPrices.push(price);
      }
    }
  }

  // Also try CSV-style data
  const lines = html.split('\n');
  for (const line of lines) {
    if (line.includes(';')) {
      const parts = line.split(';');
      for (const part of parts) {
        const cleaned = part.replace(/<[^>]*>/g, '').replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        if (num > 1 && num < 1000000 && !isNaN(num)) {
          allPrices.push(num);
        }
      }
    }
  }

  if (allPrices.length === 0) {
    const textContent = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log('No prices found for', searchCode, '- text preview:', textContent.substring(0, 300));
    return null;
  }

  const sorted = [...new Set(allPrices)].sort((a, b) => a - b);
  let priceWithVat: number;
  let priceWithoutVat: number;

  if (sorted.length >= 2) {
    priceWithoutVat = sorted[sorted.length - 2];
    priceWithVat = sorted[sorted.length - 1];
  } else {
    priceWithVat = sorted[0];
    priceWithoutVat = Math.round(priceWithVat / 1.21 * 100) / 100;
  }

  return { price_with_vat: priceWithVat, price_without_vat: priceWithoutVat };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { partNumbers, mode, batchSize = 50, offset = 0 } = await req.json();
    
    const CATALOG_PASS = Deno.env.get('CATALOG_PASS');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!CATALOG_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required secrets');
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get part numbers
    let oemNumbers = partNumbers;
    if (!oemNumbers || oemNumbers.length === 0) {
      const { data: topParts } = await supabase
        .from('parts_new')
        .select('oem_number')
        .order('updated_at', { ascending: false })
        .range(offset, offset + batchSize - 1);
      oemNumbers = (topParts || []).map((p: any) => p.oem_number);
    }

    // Login to catalog
    const session = await createSession(CATALOG_PASS);
    if (!session.loggedIn) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Login failed - still on login page',
        debug: session.searchFormHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500)
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];
    let updated = 0, errors = 0, skipped = 0;

    for (const partNumber of (oemNumbers || []).slice(0, batchSize)) {
      const priceCode = `K${partNumber.replace(/^0+/, '')}`;
      
      // Check cache
      const { data: cached } = await supabase
        .from('parts_new')
        .select('id, oem_number, price_without_vat, price_with_vat, last_price_update, price_locked')
        .eq('oem_number', partNumber)
        .single();

      if (cached?.price_locked) {
        results.push({ oem_number: partNumber, status: 'locked' });
        skipped++;
        continue;
      }

      if (cached?.last_price_update && mode !== 'force') {
        const daysAgo = (Date.now() - new Date(cached.last_price_update).getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo < 14) {
          results.push({ oem_number: partNumber, status: 'fresh', price_with_vat: cached.price_with_vat });
          skipped++;
          continue;
        }
      }

      try {
        const priceResult = await searchPart(session.cookies, priceCode, session.searchFormHtml);

        if (priceResult) {
          if (cached && cached.price_with_vat !== priceResult.price_with_vat) {
            await supabase.from('price_history').insert({
              part_id: cached.id,
              old_price_without_vat: cached.price_without_vat || 0,
              new_price_without_vat: priceResult.price_without_vat,
              old_price_with_vat: cached.price_with_vat || 0,
              new_price_with_vat: priceResult.price_with_vat,
              source: mode === 'force' ? 'manual' : 'auto',
            });
          }

          if (cached) {
            await supabase.from('parts_new').update({
              price_without_vat: priceResult.price_without_vat,
              price_with_vat: priceResult.price_with_vat,
              last_price_update: new Date().toISOString(),
            }).eq('id', cached.id);
            updated++;
          }

          results.push({ oem_number: partNumber, status: 'updated', ...priceResult });
        } else {
          results.push({ oem_number: partNumber, status: 'not_found', searchCode: priceCode });
          errors++;
        }
      } catch (fetchErr) {
        console.error(`Error for ${priceCode}:`, fetchErr);
        results.push({ oem_number: partNumber, status: 'error', error: String(fetchErr) });
        errors++;
      }

      await new Promise(r => setTimeout(r, 500));
    }

    return new Response(JSON.stringify({ 
      success: true, results,
      summary: { total: oemNumbers?.length || 0, updated, errors, skipped }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('price-sync error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
