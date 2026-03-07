const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { oemCodes } = await req.json();

    if (!oemCodes || !Array.isArray(oemCodes) || oemCodes.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'oemCodes array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const password = Deno.env.get('CATALOG_PASS') || '';
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('CATALOG_PASS length:', password.length, 'first3:', password.substring(0, 3));

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: Array<{
      oem_number: string;
      name: string;
      price_without_vat: number;
      price_with_vat: number;
      found: boolean;
      cached: boolean;
      search_code: string;
    }> = [];

    const codesToSearch = oemCodes.slice(0, 10);

    // Step 1: Login to catalog once, get session cookie
    const session = await loginToCatalog(password);
    console.log('Login success:', session.loggedIn, 'cookies:', Object.keys(session.cookies).join(','));

    for (const oem of codesToSearch) {
      const cleanOem = oem.replace(/[\s-]/g, '').toUpperCase();

      // Check cache first (parts_new)
      const { data: cached } = await supabase
        .from('parts_new')
        .select('id, oem_number, name, price_without_vat, price_with_vat, last_price_update, price_locked')
        .eq('oem_number', cleanOem)
        .single();

      // If cached and fresh (< 24h), return cached
      if (cached?.last_price_update) {
        const hoursAgo = (Date.now() - new Date(cached.last_price_update).getTime()) / (1000 * 60 * 60);
        if (hoursAgo < 24 || cached.price_locked) {
          results.push({
            oem_number: cleanOem,
            name: cached.name,
            price_without_vat: cached.price_without_vat,
            price_with_vat: cached.price_with_vat,
            found: true,
            cached: true,
            search_code: `K${cleanOem}`,
          });
          continue;
        }
      }

      const searchCode = `K${cleanOem}`;
      console.log(`Searching for: ${searchCode}`);

      let searchResult = { found: false, name: '', price_without_vat: 0, price_with_vat: 0 };

      if (session.loggedIn) {
        try {
          searchResult = await searchCatalog(session, searchCode, cleanOem);
        } catch (err) {
          console.error('Search failed:', err);
        }
      }

      if (searchResult.found) {
        // Upsert into parts_new cache
        if (cached) {
          if (cached.price_without_vat !== searchResult.price_without_vat && !cached.price_locked) {
            await supabase.from('price_history').insert({
              part_id: cached.id,
              old_price_without_vat: cached.price_without_vat,
              new_price_without_vat: searchResult.price_without_vat,
              old_price_with_vat: cached.price_with_vat,
              new_price_with_vat: searchResult.price_with_vat,
              source: 'catalog-search',
            });
          }
          if (!cached.price_locked) {
            await supabase.from('parts_new').update({
              name: searchResult.name || cached.name,
              price_without_vat: searchResult.price_without_vat,
              price_with_vat: searchResult.price_with_vat,
              last_price_update: new Date().toISOString(),
            }).eq('id', cached.id);
          }
        } else {
          await supabase.from('parts_new').insert({
            oem_number: cleanOem,
            name: searchResult.name || `Díl ${cleanOem}`,
            price_without_vat: searchResult.price_without_vat,
            price_with_vat: searchResult.price_with_vat,
            last_price_update: new Date().toISOString(),
          });
        }
      }

      results.push({
        oem_number: cleanOem,
        name: searchResult.name || `Díl ${cleanOem}`,
        price_without_vat: searchResult.price_without_vat,
        price_with_vat: searchResult.price_with_vat,
        found: searchResult.found,
        cached: false,
        search_code: searchCode,
      });
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('catalog-search error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

type Session = {
  loggedIn: boolean;
  cookies: Record<string, string>;
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function collectCookies(resp: Response, jar: Record<string, string>) {
  const setCookies = resp.headers.getSetCookie?.() || [];
  for (const c of setCookies) {
    const parts = c.split(';')[0].split('=');
    if (parts.length >= 2) {
      jar[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  }
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function loginToCatalog(password: string): Promise<Session> {
  const cookies: Record<string, string> = {};
  const headers: Record<string, string> = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.5',
  };

  // Step 1: GET to get PHPSESSID
  console.log('Step 1: GET initial page');
  const initResp = await fetch(CATALOG_URL, { headers, redirect: 'manual' });
  collectCookies(initResp, cookies);
  const initBody = await initResp.text();
  console.log('Initial page status:', initResp.status, 'has password form:', initBody.includes('name="password"'));

  // Step 2: POST password
  console.log('Step 2: POST login, cookie:', cookieHeader(cookies));
  const loginResp = await fetch(CATALOG_URL, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader(cookies),
      'Origin': 'https://www.vernostsevyplaci.cz',
      'Referer': CATALOG_URL,
    },
    body: `password=${encodeURIComponent(password)}&submit-password=${encodeURIComponent('Přihlásit')}`,
    redirect: 'manual',
  });
  collectCookies(loginResp, cookies);
  const loginStatus = loginResp.status;
  const loginLocation = loginResp.headers.get('location') || '';
  console.log('Login response status:', loginStatus, 'location:', loginLocation);

  // If redirect (302/303), follow it
  if (loginStatus >= 300 && loginStatus < 400 && loginLocation) {
    const followResp = await fetch(loginLocation.startsWith('http') ? loginLocation : CATALOG_URL, {
      headers: { ...headers, 'Cookie': cookieHeader(cookies) },
      redirect: 'manual',
    });
    collectCookies(followResp, cookies);
    const followBody = await followResp.text();
    const loggedIn = followBody.includes('Zadejte kód') || followBody.includes('submit-search') || followBody.includes('VYHLEDAT');
    console.log('Follow redirect - logged in:', loggedIn);
    return { loggedIn, cookies };
  }

  // If 200, check the body
  const loginBody = await loginResp.text();
  const loggedIn = !loginBody.includes('name="password"') || loginBody.includes('Zadejte kód') || loginBody.includes('submit-search');
  console.log('Login body check - logged in:', loggedIn, 'body length:', loginBody.length);
  
  // Log a snippet of the response to see what we got
  const bodySnippet = loginBody.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500);
  console.log('Login body snippet:', bodySnippet);

  return { loggedIn, cookies };
}

async function searchCatalog(
  session: Session, searchCode: string, oem: string
): Promise<{ found: boolean; name: string; price_without_vat: number; price_with_vat: number }> {
  const headers: Record<string, string> = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.5',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': cookieHeader(session.cookies),
    'Referer': CATALOG_URL,
  };

  const searchBody = `code=${encodeURIComponent(searchCode)}&submit-search=${encodeURIComponent('VYHLEDAT')}`;
  console.log('Search POST body:', searchBody);
  console.log('Search cookie:', cookieHeader(session.cookies));

  const searchResp = await fetch(CATALOG_URL, {
    method: 'POST',
    headers,
    body: searchBody,
    redirect: 'follow',
  });
  const searchHtml = await searchResp.text();
  
  // Log search page content
  const searchText = searchHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log('Search response length:', searchHtml.length);
  console.log('Search has code input:', searchHtml.includes('name="code"'));
  console.log('Search has results table:', searchHtml.includes('<table') && searchHtml.includes('Kč'));
  console.log('Search text snippet:', searchText.substring(0, 800));

  return parseSearchResult(searchHtml, oem);
}

function parseSearchResult(html: string, oem: string): {
  found: boolean;
  name: string;
  price_without_vat: number;
  price_with_vat: number;
} {
  const cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Strategy 1: Parse table rows
  const tableRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;

  while ((match = tableRowRegex.exec(cleanHtml)) !== null) {
    const rowHtml = match[1];
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    if (cells.length < 2) continue;

    const priceValues: number[] = [];
    let nameCandidate = '';

    for (const cell of cells) {
      const priceStr = cell.replace(/\s/g, '').replace(',', '.');
      const priceNum = parseFloat(priceStr);
      if (!isNaN(priceNum) && priceNum > 0 && priceNum < 1000000) {
        priceValues.push(priceNum);
      } else if (cell.length > 2 && !cell.match(/^\d+$/) && !nameCandidate) {
        nameCandidate = cell;
      }
    }

    if (priceValues.length >= 1) {
      const priceWithout = priceValues[0];
      const priceWith = priceValues.length >= 2 ? priceValues[1] : Math.round(priceWithout * 1.21 * 100) / 100;
      console.log('Found price:', priceWithout, 'with VAT:', priceWith, 'name:', nameCandidate);
      return {
        found: true,
        name: nameCandidate || `Díl ${oem}`,
        price_without_vat: priceWithout,
        price_with_vat: priceWith,
      };
    }
  }

  // Strategy 2: Look for price patterns in text
  const textContent = cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const pricePattern = /(\d[\d\s]*[,.]?\d*)\s*(?:Kč|CZK|,-)/gi;
  const prices: number[] = [];
  let priceMatch;
  while ((priceMatch = pricePattern.exec(textContent)) !== null) {
    const val = parseFloat(priceMatch[1].replace(/\s/g, '').replace(',', '.'));
    if (val > 0 && val < 1000000) prices.push(val);
  }

  if (prices.length > 0) {
    console.log('Found prices from text:', prices);
    return {
      found: true,
      name: `Díl ${oem}`,
      price_without_vat: prices[0],
      price_with_vat: prices.length > 1 ? prices[1] : Math.round(prices[0] * 1.21 * 100) / 100,
    };
  }

  console.log('No price found for', oem, '- text snippet:', textContent.substring(0, 300));
  return { found: false, name: '', price_without_vat: 0, price_with_vat: 0 };
}
