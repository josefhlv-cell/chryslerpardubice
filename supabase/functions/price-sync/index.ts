const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';
const RATE_LIMIT_MS = 1500;
const MAX_RETRIES = 1; // temporarily 1 for faster debugging
const RETRY_TIMEOUT_MS = 5000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { partNumbers, mode, batchSize = 20, offset = 0, debugMode = false, exportCsv = false } = await req.json();
    
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

    // Step 1: Login to catalog with retries
    let session: { success: boolean; cookies: string; debug?: any } | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        session = await catalogLogin(CATALOG_PASS, debugMode);
        if (session.success) break;
        console.warn(`Login attempt ${attempt} failed, retrying...`);
      } catch (e) {
        console.error(`Login attempt ${attempt} error:`, e);
      }
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_TIMEOUT_MS));
    }

    if (!session?.success) {
      return new Response(JSON.stringify({
        error: 'Login to catalog failed after retries',
        debug: debugMode ? session?.debug : undefined,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Search each part
    const results: any[] = [];
    const notFound: string[] = [];
    const errorParts: string[] = [];
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

      // Search with K prefix (required by catalog)
      const searchCode = `K${partNumber}`;
      let found = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[${attempt}/${MAX_RETRIES}] Searching ${searchCode}...`);
          const searchResult = await catalogSearch(session.cookies, searchCode, debugMode);

          if (debugMode) {
            results.push({ oem_number: partNumber, searchCode, debug: true, ...searchResult.debug });
          }

          if (searchResult.prices.length > 0) {
            found = true;
            const { priceWithVat, priceWithoutVat } = pickBestPrices(searchResult.prices);
            await savePriceUpdate(supabase, cached, partNumber, priceWithVat, priceWithoutVat, mode);
            results.push({
              oem_number: partNumber, status: 'updated', searchCode,
              price_with_vat: priceWithVat, price_without_vat: priceWithoutVat,
            });
            updated++;
          }
          break; // success - exit retry loop
        } catch (e) {
          console.error(`Attempt ${attempt} error for ${searchCode}:`, e);
          if (attempt === MAX_RETRIES) {
            results.push({ oem_number: partNumber, status: 'error', error: String(e) });
            errorParts.push(partNumber);
            errors++;
          } else {
            await new Promise(r => setTimeout(r, RETRY_TIMEOUT_MS));
          }
        }
      }

      if (!found && !errorParts.includes(partNumber)) {
        // Update last_price_update even if not found (to avoid re-checking too soon)
        if (cached) {
          await supabase.from('parts_new').update({
            last_price_update: new Date().toISOString(),
          }).eq('id', cached.id);
        }
        if (!debugMode) {
          results.push({ oem_number: partNumber, status: 'not_found', searchCode });
        }
        notFound.push(partNumber);
        errors++;
      }

      // Rate limit
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }

    // Build response
    const summary = {
      total: oemNumbers.length,
      processed: results.length,
      updated,
      errors,
      skipped,
      notFoundCount: notFound.length,
      notFoundParts: notFound,
      errorParts,
    };

    // Optional CSV export
    let csv: string | undefined;
    if (exportCsv) {
      const { data: allParts } = await supabase
        .from('parts_new')
        .select('oem_number, name, price_without_vat, price_with_vat, last_price_update, availability')
        .order('oem_number');
      if (allParts) {
        csv = 'OEM;Název;Cena bez DPH;Cena s DPH;Poslední aktualizace;Dostupnost\n';
        for (const p of allParts) {
          csv += `${p.oem_number};${p.name};${p.price_without_vat};${p.price_with_vat};${p.last_price_update || ''};${p.availability || ''}\n`;
        }
      }
    }

    console.log(`Sync complete: ${updated} updated, ${errors} errors, ${skipped} skipped, ${notFound.length} not found`);

    return new Response(JSON.stringify({
      success: true, results, summary,
      ...(csv ? { csv } : {}),
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

// ─── Login ──────────────────────────────────────────────────────────────────

async function catalogLogin(password: string, debugMode: boolean): Promise<{
  success: boolean; cookies: string; debug?: any;
}> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'cs,en;q=0.5',
  };

  // GET page → get PHPSESSID
  const getResp = await fetch(CATALOG_URL, { redirect: 'follow', headers });
  const getCookies = collectCookies(getResp);
  await getResp.text();

  // POST login
  const postBody = `password=${encodeURIComponent(password)}&submit-password=${encodeURIComponent('Přihlásit')}`;
  const loginResp = await fetch(CATALOG_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': getCookies,
      'Referer': CATALOG_URL,
      'Origin': 'https://www.vernostsevyplaci.cz',
    },
    body: postBody,
  });

  const allCookies = mergeCookies(getCookies, collectCookies(loginResp));
  const html = await loginResp.text();
  const stillLogin = html.includes('name="password"');
  const hasSearch = html.includes('Zadejte') || html.includes('name="search"');

  // Find the actual search form field name
  let searchFieldName = 'search';
  const inputMatches = [...html.matchAll(/<input[^>]*name="([^"]*)"[^>]*type="text"[^>]*>/gi),
                        ...html.matchAll(/<input[^>]*type="text"[^>]*name="([^"]*)"[^>]*>/gi)];
  if (inputMatches.length > 0) {
    searchFieldName = inputMatches[0][1];
  }

  // Find submit button name
  let submitFieldName = 'submit-search';
  const submitMatches = [...html.matchAll(/<input[^>]*name="([^"]*)"[^>]*type="submit"[^>]*>/gi),
                         ...html.matchAll(/<input[^>]*type="submit"[^>]*name="([^"]*)"[^>]*>/gi)];
  for (const m of submitMatches) {
    if (m[1] !== 'submit-password') {
      submitFieldName = m[1];
      break;
    }
  }

  const debug = debugMode ? {
    getCookies, allCookies, loginStatus: loginResp.status,
    stillLogin, hasSearch, searchFieldName, submitFieldName,
    passwordLength: password.length,
    htmlLength: html.length,
    inputs: [...html.matchAll(/<input[^>]*name="([^"]*)"[^>]*/gi)].map(m => m[1]),
    formSnippet: html.match(/<form[^>]*>[\s\S]*?<\/form>/g)?.map(f => f.substring(0, 500)),
  } : undefined;

  return { success: !stillLogin, cookies: allCookies, debug };
}

// ─── Search ─────────────────────────────────────────────────────────────────

async function catalogSearch(cookies: string, searchCode: string, debugMode: boolean): Promise<{
  prices: number[]; debug?: any;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RETRY_TIMEOUT_MS);

  try {
    const resp = await fetch(CATALOG_URL, {
      method: 'POST',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cookies,
        'Referer': CATALOG_URL,
      },
      body: `search=${encodeURIComponent(searchCode)}&submit-search=Vyhledat`,
    });

    const html = await resp.text();
    const prices = extractPrices(html);
    const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

    const debug = debugMode ? {
      searchStatus: resp.status,
      htmlLength: html.length,
      pricesFound: prices,
      textSnippet: textContent.substring(0, 2000),
    } : undefined;

    return { prices, debug };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Cookie helpers ─────────────────────────────────────────────────────────

function collectCookies(resp: Response): string {
  const cookies: string[] = [];
  // Headers.entries() may collapse set-cookie, try getSetCookie first
  try {
    const sc = (resp.headers as any).getSetCookie?.();
    if (sc && sc.length > 0) {
      for (const c of sc) cookies.push(c.split(';')[0]);
      return cookies.join('; ');
    }
  } catch {}
  for (const [k, v] of resp.headers.entries()) {
    if (k.toLowerCase() === 'set-cookie') cookies.push(v.split(';')[0]);
  }
  return cookies.join('; ');
}

function mergeCookies(a: string, b: string): string {
  const map = new Map<string, string>();
  for (const c of [...a.split('; '), ...b.split('; ')].filter(Boolean)) {
    const eq = c.indexOf('=');
    if (eq > 0) map.set(c.substring(0, eq), c);
  }
  return [...map.values()].join('; ');
}

// ─── Price extraction ───────────────────────────────────────────────────────

function extractPrices(html: string): number[] {
  const prices: number[] = [];
  const text = html.replace(/<[^>]*>/g, ' ');

  // Semicolon-separated data (CSV-like table rows)
  for (const line of html.split('\n')) {
    if (line.includes(';')) {
      for (const part of line.split(';')) {
        const cleaned = part.replace(/<[^>]*>/g, '').replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        if (num > 10 && num < 1000000 && !isNaN(num)) prices.push(num);
      }
    }
  }

  // MOC s DPH / MOC bez DPH
  for (const pat of [
    /MOC\s+s\s+DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /MOC\s+bez\s+DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /s\s*DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /bez\s*DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
  ]) {
    let m;
    while ((m = pat.exec(text)) !== null) {
      const p = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      if (p > 10 && p < 1000000) prices.push(p);
    }
  }

  // Generic Kč / table cell patterns
  for (const pat of [
    /(\d[\d\s]*[,.]?\d*)\s*Kč/gi,
    /<td[^>]*>\s*(\d[\d\s]*[,.]\d{2})\s*<\/td>/gi,
  ]) {
    let m;
    while ((m = pat.exec(html)) !== null) {
      const p = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      if (p > 10 && p < 1000000) prices.push(p);
    }
  }

  return [...new Set(prices)];
}

// ─── Price logic ────────────────────────────────────────────────────────────

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
  priceWithVat: number, priceWithoutVat: number, mode: string,
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
