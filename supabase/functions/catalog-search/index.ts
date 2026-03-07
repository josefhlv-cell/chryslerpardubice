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

    const password = Deno.env.get('CATALOG_PASS');
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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

      let searchResult: { found: boolean; name: string; price_without_vat: number; price_with_vat: number } = {
        found: false, name: '', price_without_vat: 0, price_with_vat: 0
      };

      // Method 1: Try Firecrawl (handles Cloudflare + JS)
      if (firecrawlKey) {
        try {
          searchResult = await searchWithFirecrawl(firecrawlKey, password || '', searchCode, cleanOem);
        } catch (err) {
          console.error('Firecrawl search failed:', err);
        }
      }

      // Method 2: Fallback to direct HTTP if Firecrawl didn't work
      if (!searchResult.found && password) {
        try {
          searchResult = await searchDirect(password, searchCode, cleanOem);
        } catch (err) {
          console.error('Direct search failed:', err);
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

async function searchWithFirecrawl(
  apiKey: string, password: string, searchCode: string, oem: string
): Promise<{ found: boolean; name: string; price_without_vat: number; price_with_vat: number }> {
  console.log('Trying Firecrawl for:', searchCode);

  // Use Firecrawl actions to: login, search, extract results
  const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: CATALOG_URL,
      formats: ['html', 'markdown'],
      waitFor: 3000,
      actions: [
        { type: 'wait', milliseconds: 2000 },
        {
          type: 'executeJavascript',
          script: `
            const pwInput = document.querySelector('input[name="password"]');
            if (pwInput) {
              pwInput.value = '${password}';
              const submitBtn = document.querySelector('input[name="submit-password"]');
              if (submitBtn) submitBtn.click();
            }
          `
        },
        { type: 'wait', milliseconds: 5000 },
        {
          type: 'executeJavascript',
          script: `
            // After login, find search input and submit search
            const codeInput = document.querySelector('input[placeholder*="kód"]') || document.querySelector('input[name="code"]') || document.querySelector('input[type="text"]');
            if (codeInput) {
              codeInput.value = '${searchCode}';
              const searchBtn = document.querySelector('input[type="submit"][value*="VYHLEDAT"]') || document.querySelector('input[type="submit"]');
              if (searchBtn) searchBtn.click();
            }
          `
        },
        { type: 'wait', milliseconds: 5000 },
        { type: 'scrape' },
      ],
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error('Firecrawl error:', JSON.stringify(data).substring(0, 500));
    return { found: false, name: '', price_without_vat: 0, price_with_vat: 0 };
  }

  const html = data.data?.html || data.html || '';
  const markdown = data.data?.markdown || data.markdown || '';

  console.log('Firecrawl markdown preview:', markdown.substring(0, 1000));

  return parseSearchResult(html, markdown, oem);
}

async function searchDirect(
  password: string, searchCode: string, oem: string
): Promise<{ found: boolean; name: string; price_without_vat: number; price_with_vat: number }> {
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  const browserHeaders: Record<string, string> = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,*/*',
    'Accept-Language': 'cs-CZ,cs;q=0.9',
  };

  const cookieJar: Record<string, string> = {};
  const collectCookies = (resp: Response) => {
    const sc = resp.headers.getSetCookie?.() || [];
    for (const c of sc) {
      const parts = c.split(';')[0].split('=');
      cookieJar[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  };
  const getCookieHeader = () => Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');

  // GET page
  const initResp = await fetch(CATALOG_URL, { headers: browserHeaders, redirect: 'follow' });
  collectCookies(initResp);
  await initResp.text();

  // POST login
  console.log('Direct login with password length:', password.length);
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
    redirect: 'follow',
  });
  collectCookies(loginResp);
  const loginBody = await loginResp.text();
  const loginOk = !loginBody.includes('submit-password') || loginBody.includes('Zadejte kód');
  console.log('Direct login ok:', loginOk);

  if (!loginOk) {
    return { found: false, name: '', price_without_vat: 0, price_with_vat: 0 };
  }

  // POST search
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
  const searchHtml = await searchResp.text();

  return parseSearchResult(searchHtml, '', oem);
}

function parseSearchResult(html: string, markdown: string, oem: string): {
  found: boolean;
  name: string;
  price_without_vat: number;
  price_with_vat: number;
} {
  // Clean HTML
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
      return {
        found: true,
        name: nameCandidate || `Díl ${oem}`,
        price_without_vat: priceWithout,
        price_with_vat: priceWith,
      };
    }
  }

  // Strategy 2: Parse from markdown (Firecrawl)
  if (markdown) {
    // Look for table rows in markdown: | col1 | col2 | col3 |
    const mdLines = markdown.split('\n');
    for (const line of mdLines) {
      if (!line.includes('|')) continue;
      const cols = line.split('|').map(c => c.trim()).filter(c => c && !c.match(/^-+$/));
      if (cols.length < 2) continue;

      const priceValues: number[] = [];
      let nameCandidate = '';
      for (const col of cols) {
        const num = parseFloat(col.replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(num) && num > 0 && num < 1000000) {
          priceValues.push(num);
        } else if (col.length > 2 && !col.match(/^\d+$/) && !nameCandidate) {
          nameCandidate = col;
        }
      }

      if (priceValues.length >= 1) {
        return {
          found: true,
          name: nameCandidate || `Díl ${oem}`,
          price_without_vat: priceValues[0],
          price_with_vat: priceValues.length >= 2 ? priceValues[1] : Math.round(priceValues[0] * 1.21 * 100) / 100,
        };
      }
    }
  }

  // Strategy 3: Look for price patterns in text
  const textContent = cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
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
