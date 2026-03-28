import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';
const CONCURRENCY = 8;
const BATCH_SIZE = 50;
const CACHE_TTL_MINUTES = 20;
const MAX_RETRIES = 3;
const MIN_DELAY = 200;
const MAX_DELAY = 600;
const LOCK_KEY = 'price-sync-lock';
const LOCK_TTL_SECONDS = 180; // 3 min lock

// User-Agent rotation pool
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.0.0',
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      partNumbers,
      mode = 'auto',
      batchSize = BATCH_SIZE,
      offset = 0,
      debugMode = false,
      exportCsv = false,
    } = await req.json();

    // Auth check - manual calls require admin, auto/cron calls are allowed
    if (mode !== 'auto') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return json({ error: 'Unauthorized' }, 401);
      }
      const { createClient: createAuthClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const authClient = createAuthClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
      if (claimsError || !claimsData?.claims?.sub) {
        return json({ error: 'Unauthorized' }, 401);
      }
      const adminCheck = createAuthClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: roleData } = await adminCheck.from('user_roles').select('role').eq('user_id', claimsData.claims.sub).eq('role', 'admin').maybeSingle();
      if (!roleData) {
        return json({ error: 'Forbidden: admin required' }, 403);
      }
    }

    const CATALOG_PASS = Deno.env.get('CATALOG_PASS');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!CATALOG_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Missing secrets' }, 500);
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Lock mechanism ──────────────────────────────────────────────
    const lockAcquired = await acquireLock(supabase);
    if (!lockAcquired) {
      console.log('⏭️ Another sync is still running, skipping');
      return json({ success: true, summary: { total: 0, message: 'Skipped - previous run still active' } });
    }

    const startTime = Date.now();

    try {
      // ── Resolve OEM numbers with priority ─────────────────────────
      let oemNumbers: string[] = partNumbers || [];
      if (oemNumbers.length === 0) {
        oemNumbers = await getPrioritizedParts(supabase, batchSize, offset);
      }

      if (oemNumbers.length === 0) {
        return json({ success: true, summary: { total: 0, message: 'No parts to sync' } });
      }

      const batch = oemNumbers.slice(0, batchSize);
      console.log(`🚀 Processing batch of ${batch.length} parts (offset ${offset}, concurrency ${CONCURRENCY})`);

      // ── Login ───────────────────────────────────────────────────────
      const cookieStr = await loginWithRetry(CATALOG_PASS);
      if (!cookieStr) {
        return json({ error: 'Catalog login failed after retries' }, 500);
      }

      // ── Adaptive throttle state ────────────────────────────────────
      const throttle: ThrottleState = {
        errorCount: 0,
        currentDelay: MIN_DELAY,
        currentConcurrency: CONCURRENCY,
      };

      // ── Process with adaptive promise pool ─────────────────────────
      const results = await processWithPool(batch, throttle, (partNumber) =>
        processPartWithRetry(partNumber, cookieStr, supabase, mode, debugMode, throttle)
      );

      // ── Stats ──────────────────────────────────────────────────────
      let updated = 0, errors = 0, skipped = 0, notFound = 0;
      for (const r of results) {
        if (r.status === 'updated') updated++;
        else if (r.status === 'locked' || r.status === 'fresh') skipped++;
        else if (r.status === 'not_found') notFound++;
        else if (r.status === 'error') errors++;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const avgMs = batch.length > 0 ? ((Date.now() - startTime) / batch.length).toFixed(0) : '0';

      const summary = {
        total: oemNumbers.length,
        batchProcessed: batch.length,
        updated, errors, notFound, skipped,
        nextOffset: offset + batch.length,
        elapsedSeconds: parseFloat(elapsed),
        avgMsPerPart: parseInt(avgMs),
        successRate: batch.length > 0 ? `${Math.round(((updated + skipped) / batch.length) * 100)}%` : '0%',
      };

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

      console.log(`✅ Sync done in ${elapsed}s: ${updated} updated, ${notFound} not found, ${errors} errors, ${skipped} skipped | ${avgMs}ms/part`);
      return json({ success: true, results, summary, ...(csv ? { csv } : {}) });
    } finally {
      await releaseLock(supabase);
    }
  } catch (e) {
    console.error('price-sync error:', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

// ─── Priority-based part selection ──────────────────────────────────────────

async function getPrioritizedParts(supabase: any, limit: number, offset: number): Promise<string[]> {
  const results: string[] = [];

  // Priority 1: Parts from recent orders (last 7 days)
  if (offset === 0) {
    const { data: orderParts } = await supabase
      .from('orders')
      .select('oem_number')
      .not('oem_number', 'is', null)
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);
    if (orderParts) {
      for (const p of orderParts) {
        if (p.oem_number && !results.includes(p.oem_number)) results.push(p.oem_number);
      }
    }
  }

  // Priority 2+3: Rest by oldest update
  const remaining = limit - results.length;
  if (remaining > 0) {
    const { data: topParts } = await supabase
      .from('parts_new')
      .select('oem_number')
      .order('last_price_update', { ascending: true, nullsFirst: true })
      .range(offset, offset + remaining - 1);
    if (topParts) {
      for (const p of topParts) {
        if (!results.includes(p.oem_number)) results.push(p.oem_number);
      }
    }
  }

  return results;
}

// ─── Lock ───────────────────────────────────────────────────────────────────

async function acquireLock(supabase: any): Promise<boolean> {
  const { data: existing } = await supabase
    .from('api_cache')
    .select('created_at')
    .eq('cache_key', LOCK_KEY)
    .eq('cache_type', 'lock')
    .single();

  if (existing) {
    const age = (Date.now() - new Date(existing.created_at).getTime()) / 1000;
    if (age < LOCK_TTL_SECONDS) return false;
    await supabase.from('api_cache').delete().eq('cache_key', LOCK_KEY).eq('cache_type', 'lock');
  }

  const { error } = await supabase.from('api_cache').insert({
    cache_key: LOCK_KEY,
    cache_type: 'lock',
    data: { started: new Date().toISOString() },
    ttl_seconds: LOCK_TTL_SECONDS,
  });

  return !error;
}

async function releaseLock(supabase: any): Promise<void> {
  await supabase.from('api_cache').delete().eq('cache_key', LOCK_KEY).eq('cache_type', 'lock');
}

// ─── Adaptive throttle ─────────────────────────────────────────────────────

interface ThrottleState {
  errorCount: number;
  currentDelay: number;
  currentConcurrency: number;
}

function adaptThrottle(throttle: ThrottleState, success: boolean) {
  if (!success) {
    throttle.errorCount++;
    // After 3 consecutive errors, slow down
    if (throttle.errorCount >= 3) {
      throttle.currentDelay = Math.min(throttle.currentDelay * 1.5, 2000);
      throttle.currentConcurrency = Math.max(Math.floor(throttle.currentConcurrency * 0.6), 2);
      console.warn(`⚠️ Throttling: delay=${throttle.currentDelay}ms, concurrency=${throttle.currentConcurrency}`);
    }
  } else {
    // Gradually recover
    if (throttle.errorCount > 0) throttle.errorCount = Math.max(0, throttle.errorCount - 1);
    if (throttle.currentDelay > MAX_DELAY) {
      throttle.currentDelay = Math.max(MIN_DELAY, throttle.currentDelay * 0.9);
    }
    if (throttle.currentConcurrency < CONCURRENCY) {
      throttle.currentConcurrency = Math.min(CONCURRENCY, throttle.currentConcurrency + 1);
    }
  }
}

// ─── Random delay ───────────────────────────────────────────────────────────

function randomDelay(throttle: ThrottleState): Promise<void> {
  const base = throttle.currentDelay;
  const jitter = base * 0.5;
  const ms = base + Math.random() * jitter;
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Promise Pool (adaptive) ───────────────────────────────────────────────

async function processWithPool<T>(
  items: string[],
  throttle: ThrottleState,
  fn: (item: string) => Promise<T>
): Promise<T[]> {
  const results: T[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      await randomDelay(throttle);
      results[i] = await fn(items[i]);
    }
  }

  const workerCount = Math.min(throttle.currentConcurrency, items.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Login with retry ───────────────────────────────────────────────────────

async function loginWithRetry(password: string): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const cookie = await loginToCatalog(password);
    if (cookie) return cookie;
    console.warn(`Login attempt ${attempt} failed, retrying...`);
    await new Promise(r => setTimeout(r, 1000 * attempt));
  }
  return null;
}

async function loginToCatalog(password: string): Promise<string | null> {
  const ua = randomUA();
  const loginResp = await fetch(CATALOG_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': ua,
    },
    body: `password=${encodeURIComponent(password)}&submit-password=P%C5%99ihl%C3%A1sit`,
    redirect: 'manual',
  });

  const cookies = loginResp.headers.getSetCookie?.() || [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

  let catalogHtml = '';
  if (loginResp.status >= 300 && loginResp.status < 400) {
    const redirectUrl = loginResp.headers.get('location') || CATALOG_URL;
    const followResp = await fetch(redirectUrl, {
      headers: { 'Cookie': cookieStr, 'User-Agent': ua },
    });
    catalogHtml = await followResp.text();
  } else {
    catalogHtml = await loginResp.text();
  }

  const hasSearchForm = catalogHtml.includes('name="search"') || catalogHtml.includes('Zadejte') || catalogHtml.includes('find-part');
  if (!hasSearchForm) {
    console.error('Login failed - no search form');
    return null;
  }

  console.log(`🔑 Login OK (${cookies.length} cookies)`);
  return cookieStr;
}

// ─── Process single part with retry ─────────────────────────────────────────

async function processPartWithRetry(
  partNumber: string,
  cookieStr: string,
  supabase: any,
  mode: string,
  debugMode: boolean,
  throttle: ThrottleState
): Promise<any> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await processPart(partNumber, cookieStr, supabase, mode, debugMode);
      adaptThrottle(throttle, result.status !== 'error');
      return result;
    } catch (e) {
      adaptThrottle(throttle, false);
      if (attempt === MAX_RETRIES) {
        return { oem_number: partNumber, status: 'error', error: String(e), attempts: attempt };
      }
      await randomDelay(throttle);
    }
  }
}

async function processPart(
  partNumber: string,
  cookieStr: string,
  supabase: any,
  mode: string,
  debugMode: boolean
): Promise<any> {
  const { data: cached } = await supabase
    .from('parts_new')
    .select('id, oem_number, price_without_vat, price_with_vat, last_price_update, price_locked')
    .eq('oem_number', partNumber)
    .single();

  if (cached?.price_locked) {
    return { oem_number: partNumber, status: 'locked' };
  }

  // Cache TTL check
  if (cached?.last_price_update && mode !== 'force') {
    const minutesAgo = (Date.now() - new Date(cached.last_price_update).getTime()) / (1000 * 60);
    if (minutesAgo < CACHE_TTL_MINUTES) {
      return { oem_number: partNumber, status: 'fresh', price_with_vat: cached.price_with_vat };
    }
  }

  // Search variants with zero-padding
  const padded = partNumber.length <= 9 ? `0${partNumber}` : partNumber;
  const searchVariants = [...new Set([
    `K${padded}`,
    `K${partNumber}`,
    padded,
    partNumber,
  ])];

  let searchHtml = '';
  let searchCode = '';
  let partFound = false;
  let prices: number[] = [];
  const ua = randomUA();

  for (const variant of searchVariants) {
    searchCode = variant;
    const searchResp = await fetch(CATALOG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr,
        'User-Agent': ua,
      },
      body: `find-part=${encodeURIComponent(variant)}&search-part=Vyhledat`,
    });
    searchHtml = await searchResp.text();
    partFound = verifyPartInResults(searchHtml, partNumber, variant);
    if (partFound) {
      prices = extractPricesDOM(searchHtml);
      if (prices.length > 0) break;
    }
    // Small delay between variant attempts
    await new Promise(r => setTimeout(r, 150));
  }

  if (debugMode) {
    return {
      oem_number: partNumber, searchCode, debug: true,
      htmlLength: searchHtml.length, partFound, pricesFound: prices,
      textSnippet: searchHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').substring(0, 1500),
    };
  }

  if (prices.length > 0) {
    const { priceWithVat, priceWithoutVat } = pickBestPrices(prices);

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

    return {
      oem_number: partNumber, status: 'updated', searchCode,
      price_with_vat: priceWithVat, price_without_vat: priceWithoutVat,
    };
  } else {
    if (cached) {
      await supabase.from('parts_new').update({
        last_price_update: new Date().toISOString(),
      }).eq('id', cached.id);
    }
    return { oem_number: partNumber, status: 'not_found', searchCode };
  }
}

// ─── Part verification ──────────────────────────────────────────────────────

function verifyPartInResults(html: string, partNumber: string, searchCode: string): boolean {
  const partNumClean = partNumber.replace(/\s/g, '');
  const contentOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ');

  const patterns = [partNumClean, partNumber, searchCode];
  for (const p of patterns) {
    if (p.length >= 5 && contentOnly.includes(p)) return true;
  }

  const tdPattern = new RegExp(`<td[^>]*>[^<]*${partNumClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*<\\/td>`, 'i');
  if (tdPattern.test(html)) return true;

  return false;
}

// ─── Price extraction ───────────────────────────────────────────────────────

function extractPricesDOM(html: string): number[] {
  const prices: number[] = [];

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (doc) {
      const tds = doc.querySelectorAll('td');
      for (const td of tds) {
        const text = (td as any).textContent || '';
        const m = text.match(/(\d[\d\s]*[,.]\d{2})/);
        if (m) {
          const p = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
          if (p > 10 && p < 1000000) prices.push(p);
        }
      }

      const priceEls = doc.querySelectorAll('.price, .cena, [class*="price"], [class*="cena"]');
      for (const el of priceEls) {
        const text = (el as any).textContent || '';
        const m = text.match(/(\d[\d\s]*[,.]\d{2})/);
        if (m) {
          const p = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
          if (p > 10 && p < 1000000) prices.push(p);
        }
      }
    }
  } catch (e) {
    console.log('DOMParser fallback to regex:', e);
  }

  const text = html.replace(/<[^>]*>/g, ' ');

  const kcPattern = /(?<!\d)(\d{1,3}(?:\s\d{3})*[,.]\d{2})\s*Kč/gi;
  let m;
  while ((m = kcPattern.exec(text)) !== null) {
    const p = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
    if (p > 10 && p < 1000000) prices.push(p);
  }

  const dphPatterns = [
    /Cena\s+bez\s+DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /Cena\s+s\s+DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /MOC\s+bez\s+DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /MOC\s+s\s+DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /bez\s*DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /s\s*DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
  ];
  for (const pat of dphPatterns) {
    let m2;
    while ((m2 = pat.exec(text)) !== null) {
      const p = parseFloat(m2[1].replace(/\s/g, '').replace(',', '.'));
      if (p > 10 && p < 1000000) prices.push(p);
    }
  }

  const tdPattern = /<td[^>]*>\s*(\d[\d\s]*[,.]\d{2})\s*<\/td>/gi;
  let m3;
  while ((m3 = tdPattern.exec(html)) !== null) {
    const p = parseFloat(m3[1].replace(/\s/g, '').replace(',', '.'));
    if (p > 10 && p < 1000000) prices.push(p);
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

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
