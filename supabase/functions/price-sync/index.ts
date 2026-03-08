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
    const { partNumbers, mode, batchSize = 50, offset = 0, debugMode = false } = await req.json();
    
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

    const results: any[] = [];
    let updated = 0, errors = 0, skipped = 0;

    // Try multiple auth approaches
    const authMethods = [
      // Method 1: Basic Auth with "user:password"
      { type: 'basic', header: `Basic ${btoa(`user:${CATALOG_PASS}`)}` },
      // Method 2: Basic Auth with just password
      { type: 'basic-pass', header: `Basic ${btoa(`:${CATALOG_PASS}`)}` },
    ];

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

      let found = false;

      // Try approach 1: POST with code= and Basic Auth
      for (const auth of authMethods) {
        if (found) break;
        try {
          const response = await fetch(CATALOG_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': auth.header,
            },
            body: `code=${encodeURIComponent(priceCode)}`,
          });

          if (response.ok) {
            const text = await response.text();
            const prices = extractPrices(text);
            
            if (debugMode && !found) {
              results.push({ 
                oem_number: partNumber, 
                debug: true, 
                method: auth.type + '-code',
                searchCode: priceCode,
                responseLength: text.length,
                responsePreview: text.substring(0, 500),
                prices 
              });
            }

            if (prices.length > 0) {
              found = true;
              const { priceWithVat, priceWithoutVat } = pickPrices(prices);
              await savePriceUpdate(supabase, cached, partNumber, priceWithVat, priceWithoutVat, mode);
              results.push({ oem_number: partNumber, status: 'updated', method: auth.type, price_with_vat: priceWithVat, price_without_vat: priceWithoutVat });
              updated++;
            }
          } else {
            await response.text();
          }
        } catch (e) {
          console.error(`Method ${auth.type} failed for ${priceCode}:`, e);
        }
      }

      // Try approach 2: Session-based login + search form
      if (!found) {
        try {
          const sessionResult = await sessionSearch(CATALOG_PASS, priceCode, debugMode);
          
          if (debugMode && !found) {
            results.push({
              oem_number: partNumber,
              debug: true,
              method: 'session',
              searchCode: priceCode,
              ...sessionResult.debug
            });
          }

          if (sessionResult.prices.length > 0) {
            found = true;
            const { priceWithVat, priceWithoutVat } = pickPrices(sessionResult.prices);
            await savePriceUpdate(supabase, cached, partNumber, priceWithVat, priceWithoutVat, mode);
            results.push({ oem_number: partNumber, status: 'updated', method: 'session', price_with_vat: priceWithVat, price_without_vat: priceWithoutVat });
            updated++;
          }
        } catch (e) {
          console.error(`Session method failed for ${priceCode}:`, e);
        }
      }

      if (!found && !debugMode) {
        results.push({ oem_number: partNumber, status: 'not_found', searchCode: priceCode });
        errors++;
      }

      await new Promise(r => setTimeout(r, 300));
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

function extractPrices(text: string): number[] {
  const prices: number[] = [];
  
  // CSV semicolon format
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.includes(';')) {
      const parts = line.split(';');
      for (const part of parts) {
        const cleaned = part.replace(/<[^>]*>/g, '').replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        if (num > 1 && num < 1000000 && !isNaN(num)) {
          prices.push(num);
        }
      }
    }
  }

  // HTML price patterns
  const patterns = [
    /(\d[\d\s]*[,.]?\d*)\s*Kč/gi,
    /<td[^>]*>\s*(\d[\d\s]*[,.]\d{2})\s*<\/td>/gi,
    /cena[^<]*?(\d[\d\s,.]+)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const priceStr = match[1].replace(/\s/g, '').replace(',', '.');
      const p = parseFloat(priceStr);
      if (p > 1 && p < 1000000) prices.push(p);
    }
  }

  return [...new Set(prices)];
}

function pickPrices(prices: number[]): { priceWithVat: number; priceWithoutVat: number } {
  const sorted = prices.sort((a, b) => a - b);
  if (sorted.length >= 2) {
    return { priceWithoutVat: sorted[sorted.length - 2], priceWithVat: sorted[sorted.length - 1] };
  }
  return { priceWithVat: sorted[0], priceWithoutVat: Math.round(sorted[0] / 1.21 * 100) / 100 };
}

async function savePriceUpdate(supabase: any, cached: any, partNumber: string, priceWithVat: number, priceWithoutVat: number, mode: string) {
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

async function sessionSearch(password: string, searchCode: string, debugMode: boolean): Promise<{ prices: number[]; debug: any }> {
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

  // GET page
  const initResp = await fetch(CATALOG_URL, { headers: { 'User-Agent': ua }, redirect: 'follow' });
  collectCookies(initResp);
  await initResp.text();

  // POST login
  const loginResp = await fetch(CATALOG_URL, {
    method: 'POST',
    headers: {
      'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': gc(), 'Origin': 'https://www.vernostsevyplaci.cz', 'Referer': CATALOG_URL,
    },
    body: `password=${encodeURIComponent(password)}&submit-password=${encodeURIComponent('Přihlásit')}`,
    redirect: 'manual',
  });
  collectCookies(loginResp);
  await loginResp.text();
  const loc = loginResp.headers.get('location');

  // Follow redirect or re-GET
  let pageHtml = '';
  if (loc) {
    const redir = loc.startsWith('http') ? loc : `https://www.vernostsevyplaci.cz${loc}`;
    const r = await fetch(redir, { headers: { 'User-Agent': ua, 'Cookie': gc() }, redirect: 'follow' });
    collectCookies(r);
    pageHtml = await r.text();
  } else {
    const r = await fetch(CATALOG_URL, { headers: { 'User-Agent': ua, 'Cookie': gc() }, redirect: 'follow' });
    collectCookies(r);
    pageHtml = await r.text();
  }

  const loggedIn = !pageHtml.includes('submit-password') || pageHtml.includes('Zadejte') || pageHtml.includes('VYHLEDAT');

  // Try search
  const searchResp = await fetch(CATALOG_URL, {
    method: 'POST',
    headers: {
      'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': gc(), 'Referer': CATALOG_URL,
    },
    body: `search=${encodeURIComponent(searchCode)}&submit-search=${encodeURIComponent('Vyhledat')}`,
    redirect: 'follow',
  });
  const searchHtml = await searchResp.text();
  const prices = extractPrices(searchHtml);

  const debug = debugMode ? {
    loggedIn,
    loginStatus: loginResp.status,
    loginLocation: loc,
    cookies: Object.keys(cookieJar),
    searchResponseLength: searchHtml.length,
    searchPreview: searchHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500),
    pricesFound: prices,
  } : {};

  return { prices, debug };
}
