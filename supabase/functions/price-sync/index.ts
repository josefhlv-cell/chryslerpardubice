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
    const { partNumbers, mode, batchSize = 20, offset = 0, debugMode = false } = await req.json();
    
    const CATALOG_PASS = Deno.env.get('CATALOG_PASS');
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!CATALOG_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required secrets (CATALOG_PASS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
    }
    if (!FIRECRAWL_API_KEY) {
      throw new Error('Missing FIRECRAWL_API_KEY - connect Firecrawl in Settings');
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

    const results: any[] = [];
    let updated = 0, errors = 0, skipped = 0;

    for (const partNumber of oemNumbers.slice(0, batchSize)) {
      const priceCode = `K${partNumber.replace(/^0+/, '')}`;

      // Check cache / freshness
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
        console.log(`Searching price for ${priceCode} via Firecrawl...`);
        const searchResult = await firecrawlSearch(FIRECRAWL_API_KEY, CATALOG_PASS, priceCode, debugMode);

        if (debugMode) {
          results.push({
            oem_number: partNumber,
            debug: true,
            searchCode: priceCode,
            ...searchResult.debug,
          });
        }

        if (searchResult.prices.length > 0) {
          const { priceWithVat, priceWithoutVat } = pickBestPrices(searchResult.prices);
          await savePriceUpdate(supabase, cached, partNumber, priceWithVat, priceWithoutVat, mode);
          results.push({ oem_number: partNumber, status: 'updated', price_with_vat: priceWithVat, price_without_vat: priceWithoutVat });
          updated++;
        } else {
          results.push({ oem_number: partNumber, status: 'not_found', searchCode: priceCode });
          errors++;
        }
      } catch (e) {
        console.error(`Error for ${priceCode}:`, e);
        results.push({ oem_number: partNumber, status: 'error', message: String(e) });
        errors++;
      }

      // Rate limit - Firecrawl has limits
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
 * Use Firecrawl with browser actions to:
 * 1. Load the catalog page
 * 2. Fill in the password and submit
 * 3. Fill in the search code and submit
 * 4. Scrape the results
 */
async function firecrawlSearch(
  apiKey: string,
  password: string,
  searchCode: string,
  debugMode: boolean
): Promise<{ prices: number[]; debug: any }> {
  
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
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
        { type: 'wait', milliseconds: 2000 },
        {
          type: 'executeJavascript',
          script: `
            (function() {
              var pw = document.querySelector('input[name="password"]');
              if (pw) { pw.value = '${password}'; }
              var btn = document.querySelector('input[name="submit-password"]');
              if (btn) { btn.click(); }
              return pw ? 'found' : 'not_found';
            })()
          `,
        },
        { type: 'wait', milliseconds: 4000 },
        {
          type: 'executeJavascript',
          script: `
            (function() {
              var s = document.querySelector('input[name="search"]');
              if (s) { s.value = '${searchCode}'; }
              var btn = document.querySelector('input[name="submit-search"]');
              if (btn) { btn.click(); }
              return s ? 'found' : 'not_found';
            })()
          `,
        },
        { type: 'wait', milliseconds: 4000 },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Firecrawl error:', JSON.stringify(data).substring(0, 500));
    throw new Error(`Firecrawl API error: ${response.status}`);
  }

  const html = data.data?.html || data.html || '';
  const markdown = data.data?.markdown || data.markdown || '';
  const prices = extractPrices(html);

  const debug = debugMode ? {
    htmlLength: html.length,
    markdownPreview: markdown.substring(0, 500),
    htmlPreview: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500),
    pricesFound: prices,
    passedLogin: !html.includes('submit-password') || html.includes('Zadejte'),
  } : {};

  return { prices, debug };
}

function extractPrices(text: string): number[] {
  const prices: number[] = [];

  // CSV semicolon format (common in Czech catalogs)
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
    /price[^<]*?(\d[\d\s,.]+)/gi,
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

function pickBestPrices(prices: number[]): { priceWithVat: number; priceWithoutVat: number } {
  const sorted = [...prices].sort((a, b) => a - b);
  if (sorted.length >= 2) {
    // Assume: lower = without VAT, higher = with VAT
    // Check if the ratio is ~1.21 (Czech 21% VAT)
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const ratio = sorted[j] / sorted[i];
        if (ratio > 1.18 && ratio < 1.24) {
          return { priceWithoutVat: sorted[i], priceWithVat: sorted[j] };
        }
      }
    }
    // Fallback: largest two
    return { priceWithoutVat: sorted[sorted.length - 2], priceWithVat: sorted[sorted.length - 1] };
  }
  // Single price - calculate the other
  return { priceWithVat: sorted[0], priceWithoutVat: Math.round(sorted[0] / 1.21 * 100) / 100 };
}

async function savePriceUpdate(
  supabase: any,
  cached: any,
  partNumber: string,
  priceWithVat: number,
  priceWithoutVat: number,
  mode: string
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
