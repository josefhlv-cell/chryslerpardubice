import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';
const CONCURRENCY = 5; // parallel requests

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      partNumbers,
      mode = 'auto',
      batchSize = 25,
      offset = 0,
      debugMode = false,
      exportCsv = false,
    } = await req.json();

    const CATALOG_PASS = Deno.env.get('CATALOG_PASS');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!CATALOG_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Missing secrets' }, 500);
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Resolve OEM numbers ─────────────────────────────────────────
    let oemNumbers: string[] = partNumbers || [];
    if (oemNumbers.length === 0) {
      const { data: topParts } = await supabase
        .from('parts_new')
        .select('oem_number')
        .order('last_price_update', { ascending: true, nullsFirst: true })
        .range(offset, offset + batchSize - 1);
      oemNumbers = (topParts || []).map((p: any) => p.oem_number);
    }

    if (oemNumbers.length === 0) {
      return json({ success: true, summary: { total: 0, message: 'No parts to sync' } });
    }

    const batch = oemNumbers.slice(0, batchSize);
    console.log(`Processing batch of ${batch.length} parts (offset ${offset})`);

    // ── Step 1: Login ───────────────────────────────────────────────
    const cookieStr = await loginToCatalog(CATALOG_PASS);
    if (!cookieStr) {
      return json({ error: 'Catalog login failed' }, 500);
    }

    // ── Step 2: Process parts in parallel chunks ────────────────────
    const results: any[] = [];
    let updated = 0, errors = 0, skipped = 0;

    // Process in chunks of CONCURRENCY
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.allSettled(
        chunk.map(partNumber => processPart(partNumber, cookieStr, supabase, mode, debugMode))
      );

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          const r = result.value;
          results.push(r);
          if (r.status === 'updated') updated++;
          else if (r.status === 'locked' || r.status === 'fresh') skipped++;
          else if (r.status === 'not_found' || r.status === 'error') errors++;
        } else {
          results.push({ status: 'error', error: String(result.reason) });
          errors++;
        }
      }
    }

    const summary = {
      total: oemNumbers.length, batchProcessed: batch.length,
      updated, errors, skipped,
      nextOffset: offset + batch.length,
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

    console.log(`Sync complete: ${updated} updated, ${errors} errors, ${skipped} skipped`);
    return json({ success: true, results, summary, ...(csv ? { csv } : {}) });
  } catch (e) {
    console.error('price-sync error:', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

// ─── Login ──────────────────────────────────────────────────────────────────

async function loginToCatalog(password: string): Promise<string | null> {
  console.log('Logging in to catalog...');
  const loginResp = await fetch(CATALOG_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
      headers: { 'Cookie': cookieStr, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    catalogHtml = await followResp.text();
  } else {
    catalogHtml = await loginResp.text();
  }

  const hasSearchForm = catalogHtml.includes('name="search"') || catalogHtml.includes('Zadejte') || catalogHtml.includes('find-part');
  if (!hasSearchForm) {
    console.error('Login failed - no search form found');
    return null;
  }

  console.log(`Login OK, cookies=${cookies.length}`);
  return cookieStr;
}

// ─── Process single part ────────────────────────────────────────────────────

async function processPart(
  partNumber: string,
  cookieStr: string,
  supabase: any,
  mode: string,
  debugMode: boolean
): Promise<any> {
  try {
    const { data: cached } = await supabase
      .from('parts_new')
      .select('id, oem_number, price_without_vat, price_with_vat, last_price_update, price_locked')
      .eq('oem_number', partNumber)
      .single();

    if (cached?.price_locked) {
      return { oem_number: partNumber, status: 'locked' };
    }

    // Freshness: skip if updated within last day (unless forced)
    if (cached?.last_price_update && mode !== 'force') {
      const daysAgo = (Date.now() - new Date(cached.last_price_update).getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo < 1) {
        return { oem_number: partNumber, status: 'fresh', price_with_vat: cached.price_with_vat };
      }
    }

    const searchCode = `K${partNumber}`;
    const searchResp = await fetch(CATALOG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: `find-part=${encodeURIComponent(searchCode)}&search-part=Vyhledat`,
    });
    const searchHtml = await searchResp.text();

    const prices = extractPricesDOM(searchHtml);

    if (debugMode) {
      return {
        oem_number: partNumber, searchCode, debug: true,
        htmlLength: searchHtml.length, pricesFound: prices,
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
  } catch (e) {
    console.error(`Error processing ${partNumber}:`, e);
    return { oem_number: partNumber, status: 'error', error: String(e) };
  }
}

// ─── Price extraction with DOMParser ────────────────────────────────────────

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
