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
    const { partNumbers, mode, batchSize = 5, offset = 0, debugMode = false } = await req.json();
    
    const CATALOG_PASS = Deno.env.get('CATALOG_PASS');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!CATALOG_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required secrets');
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get part numbers to sync
    let oemNumbers = partNumbers;
    if (!oemNumbers || oemNumbers.length === 0) {
      const { data: topParts } = await supabase
        .from('parts_new')
        .select('oem_number')
        .order('last_price_update', { ascending: true, nullsFirst: true })
        .range(offset, offset + batchSize - 1);
      oemNumbers = (topParts || []).map((p: any) => p.oem_number);
    }

    if (!oemNumbers || oemNumbers.length === 0) {
      return new Response(JSON.stringify({ success: true, summary: { total: 0 } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Login and get session cookie (direct HTTP - no Firecrawl needed)
    const session = await catalogLogin(CATALOG_PASS, debugMode);
    
    if (!session.success) {
      return new Response(JSON.stringify({ 
        error: 'Login to catalog failed', 
        debug: debugMode ? session.debug : undefined 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];
    let updated = 0, errors = 0, skipped = 0;

    for (const partNumber of oemNumbers.slice(0, batchSize)) {
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
        console.log(`Searching price for ${partNumber}...`);
        const searchResult = await catalogSearch(session.cookies, partNumber, debugMode);

        if (debugMode) {
          results.push({ oem_number: partNumber, debug: true, ...searchResult.debug });
        }

        if (searchResult.prices.length > 0) {
          const { priceWithVat, priceWithoutVat } = pickBestPrices(searchResult.prices);
          await savePriceUpdate(supabase, cached, partNumber, priceWithVat, priceWithoutVat, mode);
          results.push({ oem_number: partNumber, status: 'updated', price_with_vat: priceWithVat, price_without_vat: priceWithoutVat });
          updated++;
        } else if (!debugMode) {
          results.push({ oem_number: partNumber, status: 'not_found' });
          errors++;
        } else {
          errors++;
        }
      } catch (e) {
        console.error(`Error for ${partNumber}:`, e);
        results.push({ oem_number: partNumber, status: 'error', error: String(e) });
        errors++;
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    return new Response(JSON.stringify({
      success: true, results,
      summary: { total: oemNumbers.length, updated, errors, skipped },
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

/**
 * Login to the catalog via direct HTTP POST (no browser needed).
 * PHP sessions use cookies - we capture Set-Cookie headers.
 */
async function catalogLogin(password: string, debugMode: boolean): Promise<{
  success: boolean;
  cookies: string;
  debug?: any;
}> {
  // First GET the page to get initial session cookie
  const getResp = await fetch(CATALOG_URL, {
    redirect: 'manual',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  
  const initialCookies = extractCookies(getResp.headers);
  const getHtml = await getResp.text();
  
  // POST login
  const loginResp = await fetch(CATALOG_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': initialCookies,
      'Referer': CATALOG_URL,
      'Origin': 'https://www.vernostsevyplaci.cz',
    },
    body: `password=${encodeURIComponent(password)}&submit-password=${encodeURIComponent('Přihlásit')}`,
  });
  
  // Merge cookies from login response
  const loginCookies = mergeCookies(initialCookies, extractCookies(loginResp.headers));
  const loginStatus = loginResp.status;
  
  // Follow redirect if 302/301
  let finalHtml = '';
  let finalUrl = '';
  if (loginStatus === 302 || loginStatus === 301) {
    const redirectUrl = loginResp.headers.get('Location') || CATALOG_URL;
    finalUrl = redirectUrl.startsWith('http') ? redirectUrl : `https://www.vernostsevyplaci.cz${redirectUrl}`;
    const redirectResp = await fetch(finalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': loginCookies,
      },
    });
    finalHtml = await redirectResp.text();
  } else {
    finalHtml = await loginResp.text();
    finalUrl = CATALOG_URL;
  }
  
  // Check if login succeeded (no more password field)
  const stillLogin = finalHtml.includes('name="password"');
  const hasSearchField = finalHtml.includes('name="search"') || finalHtml.includes('type="text"');
  
  const debug = debugMode ? {
    initialCookies,
    loginCookies,
    loginStatus,
    finalUrl,
    finalHtmlLength: finalHtml.length,
    stillLogin,
    hasSearchField,
    htmlSnippet: finalHtml.substring(0, 2000),
    // Find all input fields
    inputs: [...finalHtml.matchAll(/<input[^>]*name="([^"]*)"[^>]*>/g)].map(m => m[1]),
  } : undefined;

  return {
    success: !stillLogin,
    cookies: loginCookies,
    debug,
  };
}

/**
 * Search for a part number in the logged-in catalog.
 */
async function catalogSearch(cookies: string, searchCode: string, debugMode: boolean): Promise<{
  prices: number[];
  debug?: any;
}> {
  const searchResp = await fetch(CATALOG_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': cookies,
      'Referer': CATALOG_URL,
    },
    body: `search=${encodeURIComponent(searchCode)}&submit-search=Vyhledat`,
  });
  
  const searchHtml = await searchResp.text();
  const prices = extractPrices(searchHtml);
  
  const debug = debugMode ? {
    searchStatus: searchResp.status,
    searchHtmlLength: searchHtml.length,
    pricesFound: prices,
    htmlSnippet: searchHtml.substring(0, 3000),
    textContent: searchHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').substring(0, 2000),
  } : undefined;

  return { prices, debug };
}

function extractCookies(headers: Headers): string {
  const cookies: string[] = [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      const cookiePart = value.split(';')[0];
      cookies.push(cookiePart);
    }
  });
  return cookies.join('; ');
}

function mergeCookies(existing: string, newCookies: string): string {
  const map = new Map<string, string>();
  for (const c of existing.split('; ').filter(Boolean)) {
    const [name] = c.split('=');
    map.set(name, c);
  }
  for (const c of newCookies.split('; ').filter(Boolean)) {
    const [name] = c.split('=');
    map.set(name, c);
  }
  return [...map.values()].join('; ');
}

function extractPrices(html: string): number[] {
  const prices: number[] = [];
  const text = html.replace(/<[^>]*>/g, ' ');

  // CSV semicolon format
  const lines = html.split('\n');
  for (const line of lines) {
    if (line.includes(';')) {
      const parts = line.split(';');
      for (const part of parts) {
        const cleaned = part.replace(/<[^>]*>/g, '').replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        if (num > 10 && num < 1000000 && !isNaN(num)) {
          prices.push(num);
        }
      }
    }
  }

  // MOC patterns
  const mocPatterns = [
    /MOC\s+s\s+DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /MOC\s+bez\s+DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
  ];
  for (const pattern of mocPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const priceStr = match[1].replace(/\s/g, '').replace(',', '.');
      const p = parseFloat(priceStr);
      if (p > 10 && p < 1000000) prices.push(p);
    }
  }

  // General price patterns
  const patterns = [
    /(\d[\d\s]*[,.]?\d*)\s*Kč/gi,
    /<td[^>]*>\s*(\d[\d\s]*[,.]\d{2})\s*<\/td>/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const priceStr = match[1].replace(/\s/g, '').replace(',', '.');
      const p = parseFloat(priceStr);
      if (p > 10 && p < 1000000) prices.push(p);
    }
  }

  return [...new Set(prices)];
}

function pickBestPrices(prices: number[]): { priceWithVat: number; priceWithoutVat: number } {
  const sorted = [...prices].sort((a, b) => a - b);
  if (sorted.length >= 2) {
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const ratio = sorted[j] / sorted[i];
        if (ratio > 1.18 && ratio < 1.24) {
          return { priceWithoutVat: sorted[i], priceWithVat: sorted[j] };
        }
      }
    }
    return { priceWithoutVat: sorted[sorted.length - 2], priceWithVat: sorted[sorted.length - 1] };
  }
  return { priceWithVat: sorted[0], priceWithoutVat: Math.round(sorted[0] / 1.21 * 100) / 100 };
}

async function savePriceUpdate(
  supabase: any, cached: any, partNumber: string,
  priceWithVat: number, priceWithoutVat: number, mode: string
) {
  if (cached && cached.price_with_vat !== priceWithVat) {
    await supabase.from('price_history').insert({
      part_id: cached.id,
      old_price_without_vat: cached.price_without_vat || 0,
      new_price_without_vat: priceWithoutVat,
      old_price_with_vat: cached.price_with_vat || 0,
      new_price_with_vat: priceWithVat,
      source: mode === 'force' ? 'manual' : 'auto',
    });
  }
  if (cached) {
    await supabase.from('parts_new').update({
      price_without_vat: priceWithoutVat,
      price_with_vat: priceWithVat,
      last_price_update: new Date().toISOString(),
    }).eq('id', cached.id);
  }
}
