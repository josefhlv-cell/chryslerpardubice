const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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

    const password = Deno.env.get('CATALOG_PASS');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!password || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required secrets (CATALOG_PASS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const browserHeaders: Record<string, string> = {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Sec-Ch-Ua': '"Chromium";v="122"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Upgrade-Insecure-Requests': '1',
    };

    // Cookie jar
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

    // Step 1: GET initial page
    console.log('Step 1: GET initial page');
    const initResp = await fetch(CATALOG_URL, { headers: browserHeaders, redirect: 'follow' });
    collectCookies(initResp);
    const initBody = await initResp.text();

    const isLoginPage = initBody.includes('submit-password') && initBody.includes('name="password"');

    // Step 2: POST login if needed
    if (isLoginPage) {
      console.log('Step 2: POST login');
      const loginResp = await fetch(CATALOG_URL, {
        method: 'POST',
        headers: {
          ...browserHeaders,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': getCookieHeader(),
          'Origin': 'https://www.vernostsevyplaci.cz',
          'Referer': CATALOG_URL,
        },
        body: `password=${encodeURIComponent(password)}&submit-password=${encodeURIComponent('Přihlásit')}`,
        redirect: 'manual',
      });
      collectCookies(loginResp);
      const loginLocation = loginResp.headers.get('location');

      if (loginLocation) {
        const redirectUrl = loginLocation.startsWith('http')
          ? loginLocation
          : `https://www.vernostsevyplaci.cz${loginLocation}`;
        const pageResp = await fetch(redirectUrl, {
          headers: { ...browserHeaders, 'Cookie': getCookieHeader(), 'Referer': CATALOG_URL },
          redirect: 'follow',
        });
        collectCookies(pageResp);
        await pageResp.text();
      } else {
        // No redirect, try GET again
        const getResp = await fetch(CATALOG_URL, {
          headers: { ...browserHeaders, 'Cookie': getCookieHeader(), 'Referer': CATALOG_URL },
          redirect: 'follow',
        });
        collectCookies(getResp);
        await getResp.text();
      }
    }

    // Step 3: Search for each OEM code
    const results: Array<{
      oem_number: string;
      name: string;
      price_without_vat: number;
      price_with_vat: number;
      found: boolean;
      cached: boolean;
      search_code: string;
    }> = [];

    // Limit to 10 codes per request
    const codesToSearch = oemCodes.slice(0, 10);

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

      // Add "K" prefix for Czech catalog search
      const searchCode = `K${cleanOem}`;
      console.log(`Searching for: ${searchCode}`);

      try {
        const searchResp = await fetch(CATALOG_URL, {
          method: 'POST',
          headers: {
            ...browserHeaders,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': getCookieHeader(),
            'Referer': CATALOG_URL,
          },
          body: `code=${encodeURIComponent(searchCode)}&submit-search=${encodeURIComponent('VYHLEDAT')}`,
          redirect: 'follow',
        });
        collectCookies(searchResp);
        const searchHtml = await searchResp.text();

        // Parse the result - look for table rows with price data
        const parsed = parseSearchResult(searchHtml, cleanOem);

        if (parsed.found) {
          // Upsert into parts_new cache
          if (cached) {
            // Track price history if changed
            if (cached.price_without_vat !== parsed.price_without_vat && !cached.price_locked) {
              await supabase.from('price_history').insert({
                part_id: cached.id,
                old_price_without_vat: cached.price_without_vat,
                new_price_without_vat: parsed.price_without_vat,
                old_price_with_vat: cached.price_with_vat,
                new_price_with_vat: parsed.price_with_vat,
                source: 'catalog-search',
              });
            }
            if (!cached.price_locked) {
              await supabase.from('parts_new').update({
                name: parsed.name || cached.name,
                price_without_vat: parsed.price_without_vat,
                price_with_vat: parsed.price_with_vat,
                last_price_update: new Date().toISOString(),
              }).eq('id', cached.id);
            }
          } else {
            // Insert new
            await supabase.from('parts_new').insert({
              oem_number: cleanOem,
              name: parsed.name || `Díl ${cleanOem}`,
              price_without_vat: parsed.price_without_vat,
              price_with_vat: parsed.price_with_vat,
              last_price_update: new Date().toISOString(),
            });
          }

          results.push({
            oem_number: cleanOem,
            name: parsed.name || `Díl ${cleanOem}`,
            price_without_vat: parsed.price_without_vat,
            price_with_vat: parsed.price_with_vat,
            found: true,
            cached: false,
            search_code: searchCode,
          });
        } else {
          console.log(`No price found for ${searchCode}`);
          console.log('HTML preview:', searchHtml.substring(0, 2000));
          results.push({
            oem_number: cleanOem,
            name: `Díl ${cleanOem}`,
            price_without_vat: 0,
            price_with_vat: 0,
            found: false,
            cached: false,
            search_code: searchCode,
          });
        }
      } catch (searchErr) {
        console.error(`Error searching ${searchCode}:`, searchErr);
        results.push({
          oem_number: cleanOem,
          name: `Díl ${cleanOem}`,
          price_without_vat: 0,
          price_with_vat: 0,
          found: false,
          cached: false,
          search_code: searchCode,
        });
      }
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

function parseSearchResult(html: string, oem: string): {
  found: boolean;
  name: string;
  price_without_vat: number;
  price_with_vat: number;
} {
  // Try to extract data from HTML table rows
  // The catalog typically shows results in a table with columns like:
  // Code | Name | Price without VAT | Price with VAT

  // Remove scripts and styles
  const cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Strategy 1: Look for table rows containing the OEM code or price data
  const tableRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  let bestMatch: { name: string; priceWithout: number; priceWith: number } | null = null;

  while ((match = tableRowRegex.exec(cleanHtml)) !== null) {
    const rowHtml = match[1];
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const cellText = cellMatch[1].replace(/<[^>]+>/g, '').trim();
      cells.push(cellText);
    }

    if (cells.length < 2) continue;

    // Look for rows that contain price-like numbers
    const priceValues: number[] = [];
    let nameCandidate = '';

    for (const cell of cells) {
      // Try to parse as price (Czech format: 1 234,56 or 1234.56)
      const priceStr = cell.replace(/\s/g, '').replace(',', '.');
      const priceNum = parseFloat(priceStr);
      if (!isNaN(priceNum) && priceNum > 0 && priceNum < 1000000) {
        priceValues.push(priceNum);
      } else if (cell.length > 2 && !cell.match(/^\d+$/) && !nameCandidate) {
        nameCandidate = cell;
      }
    }

    // If we found at least one price in this row
    if (priceValues.length >= 1) {
      const priceWithout = priceValues[0];
      const priceWith = priceValues.length >= 2 ? priceValues[1] : Math.round(priceWithout * 1.21 * 100) / 100;
      bestMatch = {
        name: nameCandidate || `Díl ${oem}`,
        priceWithout,
        priceWith,
      };
      // If the row seems to contain our OEM code, prefer it
      const rowText = cells.join(' ').toUpperCase();
      if (rowText.includes(oem) || rowText.includes(`K${oem}`)) {
        break; // This is likely our match
      }
    }
  }

  if (bestMatch) {
    return {
      found: true,
      name: bestMatch.name,
      price_without_vat: bestMatch.priceWithout,
      price_with_vat: bestMatch.priceWith,
    };
  }

  // Strategy 2: Look for any price-like content in the page
  const textContent = cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  
  // Look for patterns like "Cena: 1234" or numbers near "Kč"
  const pricePattern = /(\d[\d\s]*[,.]?\d*)\s*(?:Kč|CZK|,-)/gi;
  const prices: number[] = [];
  let priceMatch;
  while ((priceMatch = pricePattern.exec(textContent)) !== null) {
    const val = parseFloat(priceMatch[1].replace(/\s/g, '').replace(',', '.'));
    if (val > 0 && val < 1000000) prices.push(val);
  }

  if (prices.length > 0) {
    return {
      found: true,
      name: `Díl ${oem}`,
      price_without_vat: prices[0],
      price_with_vat: prices.length > 1 ? prices[1] : Math.round(prices[0] * 1.21 * 100) / 100,
    };
  }

  return { found: false, name: '', price_without_vat: 0, price_with_vat: 0 };
}
