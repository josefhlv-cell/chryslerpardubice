const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';
const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/scrape';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      partNumbers,
      mode = 'auto',
      batchSize = 5,
      offset = 0,
      debugMode = false,
      exportCsv = false,
    } = await req.json();

    const CATALOG_PASS = Deno.env.get('CATALOG_PASS');
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!CATALOG_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Missing secrets (CATALOG_PASS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' }, 500);
    }
    if (!FIRECRAWL_API_KEY) {
      return json({ error: 'FIRECRAWL_API_KEY not configured' }, 500);
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

    // Limit to batchSize
    const batch = oemNumbers.slice(0, batchSize);
    console.log(`Processing batch of ${batch.length} parts (offset ${offset}):`, batch);

    // ── Process each part ───────────────────────────────────────────
    const results: any[] = [];
    let updated = 0, errors = 0, skipped = 0;
    const notFound: string[] = [];
    const errorParts: string[] = [];

    for (const partNumber of batch) {
      try {
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
        console.log(`Searching ${searchCode}...`);

        // Single Firecrawl call: login + search + scrape
        const scrapeResult = await firecrawlLoginAndSearch(FIRECRAWL_API_KEY, CATALOG_PASS, searchCode);
        const html = scrapeResult.data?.html || '';
        const prices = extractPrices(html);

        if (debugMode) {
          const textSnippet = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').substring(0, 2000);
          results.push({
            oem_number: partNumber, searchCode, debug: true,
            htmlLength: html.length, pricesFound: prices, textSnippet,
          });
        }

        if (prices.length > 0) {
          const { priceWithVat, priceWithoutVat } = pickBestPrices(prices);

          // Save to DB
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

          results.push({
            oem_number: partNumber, status: 'updated', searchCode,
            price_with_vat: priceWithVat, price_without_vat: priceWithoutVat,
          });
          updated++;
        } else {
          // Mark as checked even if not found
          if (cached) {
            await supabase.from('parts_new').update({
              last_price_update: new Date().toISOString(),
            }).eq('id', cached.id);
          }
          results.push({ oem_number: partNumber, status: 'not_found', searchCode });
          notFound.push(partNumber);
          errors++;
        }
      } catch (e) {
        console.error(`Error processing ${partNumber}:`, e);
        results.push({ oem_number: partNumber, status: 'error', error: String(e) });
        errorParts.push(partNumber);
        errors++;
      }
    }

    // ── Summary ─────────────────────────────────────────────────────
    const summary = {
      total: oemNumbers.length,
      batchProcessed: batch.length,
      updated, errors, skipped,
      notFound: notFound.length,
      nextOffset: offset + batch.length,
      hasMore: oemNumbers.length > batch.length,
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

// ─── Firecrawl: login + search in one call ──────────────────────────────────

async function firecrawlLoginAndSearch(
  apiKey: string, catalogPass: string, searchCode: string
): Promise<any> {
  const resp = await fetch(FIRECRAWL_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: CATALOG_URL,
      formats: ['html'],
      waitFor: 3000,
      actions: [
        { type: 'wait', milliseconds: 1500 },
        // Login if password field exists
        {
          type: 'executeJavascript',
          script: `
            const pw = document.querySelector('input[name="password"]');
            if (pw) {
              pw.value = '${catalogPass}';
              const form = pw.closest('form');
              if (form) form.submit();
            }
          `,
        },
        { type: 'wait', milliseconds: 3000 },
        // Search for the part
        {
          type: 'executeJavascript',
          script: `
            const inputs = document.querySelectorAll('input[type="text"], input[name="search"], input[name="q"]');
            let searchInput = null;
            for (const inp of inputs) {
              if (inp.offsetParent !== null) { searchInput = inp; break; }
            }
            if (searchInput) {
              searchInput.value = '${searchCode}';
              const form = searchInput.closest('form');
              if (form) form.submit();
            }
          `,
        },
        { type: 'wait', milliseconds: 4000 },
        { type: 'scrape' },
      ],
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Firecrawl error ${resp.status}: ${JSON.stringify(data).substring(0, 500)}`);
  }
  return data;
}

// ─── Price extraction ───────────────────────────────────────────────────────

function extractPrices(html: string): number[] {
  const prices: number[] = [];
  const text = html.replace(/<[^>]*>/g, ' ');

  // Semicolon-separated data rows (catalog format)
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
  const pricePatterns = [
    /MOC\s+s\s+DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /MOC\s+bez\s+DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /s\s*DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /bez\s*DPH[:\s]*(\d[\d\s]*[,.]\d{2})/gi,
    /(\d[\d\s]*[,.]?\d*)\s*Kč/gi,
  ];

  for (const pat of pricePatterns) {
    let m;
    while ((m = pat.exec(text)) !== null) {
      const p = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
      if (p > 10 && p < 1000000) prices.push(p);
    }
  }

  // Table cell prices
  const tdPattern = /<td[^>]*>\s*(\d[\d\s]*[,.]\d{2})\s*<\/td>/gi;
  let m;
  while ((m = tdPattern.exec(html)) !== null) {
    const p = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
    if (p > 10 && p < 1000000) prices.push(p);
  }

  return [...new Set(prices)];
}

// ─── Pick best price pair (VAT ratio ~1.21) ────────────────────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
