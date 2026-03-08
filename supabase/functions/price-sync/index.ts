const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';
const RATE_LIMIT_MS = 2000;
const MAX_RETRIES = 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { partNumbers, mode, batchSize = 20, offset = 0, debugMode = false, exportCsv = false } = await req.json();

    const CATALOG_PASS = Deno.env.get('CATALOG_PASS');
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!CATALOG_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required secrets (CATALOG_PASS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
    }
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured – connect Firecrawl in Settings');
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
      return json({ success: true, summary: { total: 0 } });
    }

    // Step 1: Login via Firecrawl (handles Cloudflare)
    console.log('Logging in via Firecrawl...');
    const loginResult = await firecrawlScrape(FIRECRAWL_API_KEY, CATALOG_URL, {
      formats: ['html'],
      waitFor: 3000,
      actions: [
        { type: 'wait', milliseconds: 2000 },
        {
          type: 'executeJavascript',
          script: `
            const pw = document.querySelector('input[name="password"]');
            if (pw) { pw.value = '${CATALOG_PASS}'; pw.closest('form')?.submit(); }
          `,
        },
        { type: 'wait', milliseconds: 5000 },
        { type: 'scrape' },
      ],
    });

    const loginHtml = loginResult.data?.html || '';
    const loggedIn = !loginHtml.includes('name="password"') && (loginHtml.includes('Zadejte') || loginHtml.includes('name="search"'));

    if (!loggedIn) {
      console.error('Login failed. HTML length:', loginHtml.length);
      return json({
        error: 'Catalog login failed via Firecrawl',
        debug: debugMode ? { htmlLength: loginHtml.length, htmlPreview: loginHtml.substring(0, 1000) } : undefined,
      }, 500);
    }

    console.log('Login OK, searching parts...');

    // Step 2: Search each part via Firecrawl actions
    const results: any[] = [];
    const notFound: string[] = [];
    const errorParts: string[] = [];
    let updated = 0, errors = 0, skipped = 0;

    for (const partNumber of oemNumbers.slice(0, batchSize)) {
      // Check cache / lock
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

      const searchCode = `K${partNumber}`;
      let found = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[${attempt}] Searching ${searchCode}...`);

          // Use Firecrawl actions: fill search field, submit, scrape result
          const searchResult = await firecrawlScrape(FIRECRAWL_API_KEY, CATALOG_URL, {
            formats: ['html'],
            waitFor: 3000,
            actions: [
              { type: 'wait', milliseconds: 2000 },
              // First login again (session may not persist)
              {
                type: 'executeJavascript',
                script: `
                  const pw = document.querySelector('input[name="password"]');
                  if (pw) { pw.value = '${CATALOG_PASS}'; pw.closest('form')?.submit(); }
                `,
              },
              { type: 'wait', milliseconds: 4000 },
              // Now search
              {
                type: 'executeJavascript',
                script: `
                  const searchInput = document.querySelector('input[type="text"]');
                  if (searchInput) {
                    searchInput.value = '${searchCode}';
                    const form = searchInput.closest('form');
                    if (form) form.submit();
                  }
                `,
              },
              { type: 'wait', milliseconds: 5000 },
              { type: 'scrape' },
            ],
          });

          const html = searchResult.data?.html || '';
          const prices = extractPrices(html);

          if (debugMode) {
            results.push({
              oem_number: partNumber, searchCode, debug: true,
              htmlLength: html.length, pricesFound: prices,
              textSnippet: html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').substring(0, 1000),
            });
          }

          if (prices.length > 0) {
            found = true;
            const { priceWithVat, priceWithoutVat } = pickBestPrices(prices);
            await savePriceUpdate(supabase, cached, partNumber, priceWithVat, priceWithoutVat, mode);
            results.push({
              oem_number: partNumber, status: 'updated', searchCode,
              price_with_vat: priceWithVat, price_without_vat: priceWithoutVat,
            });
            updated++;
          }
          break;
        } catch (e) {
          console.error(`Attempt ${attempt} error for ${searchCode}:`, e);
          if (attempt === MAX_RETRIES) {
            results.push({ oem_number: partNumber, status: 'error', error: String(e) });
            errorParts.push(partNumber);
            errors++;
          } else {
            await sleep(3000);
          }
        }
      }

      if (!found && !errorParts.includes(partNumber)) {
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

      await sleep(RATE_LIMIT_MS);
    }

    const summary = {
      total: oemNumbers.length, processed: results.length,
      updated, errors, skipped,
      notFoundCount: notFound.length, notFoundParts: notFound, errorParts,
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

    console.log(`Sync complete: ${updated} updated, ${errors} errors, ${skipped} skipped`);

    return json({ success: true, results, summary, ...(csv ? { csv } : {}) });
  } catch (e) {
    console.error('price-sync error:', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

// ─── Firecrawl helper ───────────────────────────────────────────────────────

async function firecrawlScrape(apiKey: string, url: string, options: any): Promise<any> {
  const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, ...options }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Firecrawl error ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ─── Price extraction ───────────────────────────────────────────────────────

function extractPrices(html: string): number[] {
  const prices: number[] = [];
  const text = html.replace(/<[^>]*>/g, ' ');

  // Semicolon-separated data rows
  for (const line of html.split('\n')) {
    if (line.includes(';')) {
      for (const part of line.split(';')) {
        const cleaned = part.replace(/<[^>]*>/g, '').replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        if (num > 10 && num < 1000000 && !isNaN(num)) prices.push(num);
      }
    }
  }

  // MOC s DPH / MOC bez DPH patterns
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

  // Kč / table cell patterns
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
