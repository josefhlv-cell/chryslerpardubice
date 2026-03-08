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
    const { partNumbers, mode, batchSize = 50, offset = 0 } = await req.json();
    
    const CATALOG_PASS = Deno.env.get('CATALOG_PASS');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!CATALOG_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required secrets');
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // If no partNumbers provided, fetch top parts from DB
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
    let updated = 0;
    let errors = 0;
    let skipped = 0;

    // Login to catalog first to get session cookie
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const cookieJar: Record<string, string> = {};
    
    const collectCookies = (resp: Response) => {
      const setCookies = resp.headers.getSetCookie?.() || [];
      for (const sc of setCookies) {
        const parts = sc.split(';')[0].split('=');
        cookieJar[parts[0].trim()] = parts.slice(1).join('=').trim();
      }
    };
    const getCookieHeader = () => Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');

    // Step 1: GET initial page
    const initResp = await fetch(CATALOG_URL, { headers: { 'User-Agent': ua }, redirect: 'follow' });
    collectCookies(initResp);
    await initResp.text();

    // Step 2: POST login
    const loginResp = await fetch(CATALOG_URL, {
      method: 'POST',
      headers: {
        'User-Agent': ua,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': getCookieHeader(),
        'Origin': 'https://www.vernostsevyplaci.cz',
        'Referer': CATALOG_URL,
      },
      body: `password=${encodeURIComponent(CATALOG_PASS)}&submit-password=${encodeURIComponent('Přihlásit')}`,
      redirect: 'manual',
    });
    collectCookies(loginResp);
    const loginLocation = loginResp.headers.get('location');
    await loginResp.text();

    // Step 3: Follow redirect if needed
    if (loginLocation) {
      const redirectUrl = loginLocation.startsWith('http') ? loginLocation : `https://www.vernostsevyplaci.cz${loginLocation}`;
      const pageResp = await fetch(redirectUrl, {
        headers: { 'User-Agent': ua, 'Cookie': getCookieHeader(), 'Referer': CATALOG_URL },
        redirect: 'follow',
      });
      collectCookies(pageResp);
      await pageResp.text();
    }

    // Process parts in sequence (with session)
    for (const partNumber of (oemNumbers || []).slice(0, batchSize)) {
      // Add prefix "K" for price lookup
      const priceCode = `K${partNumber.replace(/^0+/, '')}`;
      
      // Check cache first
      const { data: cached } = await supabase
        .from('parts_new')
        .select('id, oem_number, price_without_vat, price_with_vat, last_price_update, price_locked')
        .eq('oem_number', partNumber)
        .single();

      if (cached?.price_locked) {
        results.push({ oem_number: partNumber, cached: true, locked: true });
        skipped++;
        continue;
      }

      // Check if cache is fresh (less than 14 days for regular sync)
      if (cached?.last_price_update && mode !== 'force') {
        const lastUpdate = new Date(cached.last_price_update);
        const daysAgo = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo < 14) {
          results.push({ oem_number: partNumber, cached: true, price_with_vat: cached.price_with_vat });
          skipped++;
          continue;
        }
      }

      // Search on catalog page
      try {
        const searchResp = await fetch(CATALOG_URL, {
          method: 'POST',
          headers: {
            'User-Agent': ua,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': getCookieHeader(),
            'Referer': CATALOG_URL,
          },
          body: `search=${encodeURIComponent(priceCode)}&submit-search=${encodeURIComponent('Vyhledat')}`,
          redirect: 'follow',
        });
        collectCookies(searchResp);

        if (searchResp.ok) {
          const html = await searchResp.text();
          
          // Parse price from HTML response - look for price patterns
          let priceWithVat = 0;
          let priceWithoutVat = 0;

          // Try multiple price extraction patterns
          // Pattern 1: table cells with price
          const pricePatterns = [
            // Common Czech price formats in HTML
            /(\d[\d\s]*[,.]?\d*)\s*Kč\s*s\s*DPH/gi,
            /s\s*DPH[:\s]*(\d[\d\s]*[,.]?\d*)\s*Kč/gi,
            /cena[:\s]*(\d[\d\s]*[,.]?\d*)\s*Kč/gi,
            // Table-based prices
            /<td[^>]*>(\d[\d\s]*[,.]\d{2})\s*<\/td>/gi,
            // Generic price with Kč
            /(\d{1,3}(?:[\s.]\d{3})*(?:,\d{2})?)\s*Kč/gi,
          ];

          const allPrices: number[] = [];
          for (const pattern of pricePatterns) {
            let match;
            while ((match = pattern.exec(html)) !== null) {
              const priceStr = match[1].replace(/\s/g, '').replace(',', '.');
              const price = parseFloat(priceStr);
              if (price > 0 && price < 1000000) {
                allPrices.push(price);
              }
            }
          }

          // Also try CSV/semicolon format in response
          const lines = html.split('\n').filter(l => l.includes(';'));
          for (const line of lines) {
            const parts = line.split(';');
            if (parts.length >= 3) {
              const p1 = parseFloat(parts[1]?.replace(',', '.').replace(/\s/g, '') || '0');
              const p2 = parseFloat(parts[2]?.replace(',', '.').replace(/\s/g, '') || '0');
              if (p1 > 0) allPrices.push(p1);
              if (p2 > 0) allPrices.push(p2);
            }
          }

          if (allPrices.length > 0) {
            // Take the highest price as price with VAT (usually s DPH > bez DPH)
            priceWithVat = Math.max(...allPrices);
            priceWithoutVat = Math.round(priceWithVat / 1.21 * 100) / 100;

            // If we found 2 prices, smaller is bez DPH, larger is s DPH
            if (allPrices.length >= 2) {
              const sorted = [...new Set(allPrices)].sort((a, b) => a - b);
              if (sorted.length >= 2) {
                priceWithoutVat = sorted[sorted.length - 2];
                priceWithVat = sorted[sorted.length - 1];
              }
            }
          }

          if (priceWithVat > 0) {
            // Store price history if price changed
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

            // Update part
            if (cached) {
              await supabase.from('parts_new').update({
                price_without_vat: priceWithoutVat,
                price_with_vat: priceWithVat,
                last_price_update: new Date().toISOString(),
              }).eq('id', cached.id);
              updated++;
            }

            results.push({ oem_number: partNumber, price_with_vat: priceWithVat, price_without_vat: priceWithoutVat, updated: true });
          } else {
            // Save raw HTML snippet for debugging
            const textContent = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .substring(0, 500);
            results.push({ oem_number: partNumber, error: 'Price not found', searchCode: priceCode, preview: textContent });
            errors++;
          }
        } else {
          console.error(`Price fetch failed for ${priceCode}: ${searchResp.status}`);
          await searchResp.text();
          results.push({ oem_number: partNumber, error: `HTTP ${searchResp.status}` });
          errors++;
        }
      } catch (fetchErr) {
        console.error(`Error fetching price for ${priceCode}:`, fetchErr);
        results.push({ oem_number: partNumber, error: 'Fetch failed' });
        errors++;
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));
    }

    return new Response(JSON.stringify({ 
      success: true, 
      results,
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
