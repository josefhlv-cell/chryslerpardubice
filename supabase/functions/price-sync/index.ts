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
    const { partNumbers, mode } = await req.json();
    
    const CATALOG_PASS = Deno.env.get('CATALOG_PASS');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!CATALOG_PASS || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required secrets');
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: any[] = [];

    for (const partNumber of (partNumbers || []).slice(0, 50)) {
      // Add prefix "6" for price lookup
      const priceCode = `6${partNumber.replace(/^0+/, '')}`;
      
      // Check cache first
      const { data: cached } = await supabase
        .from('parts_new')
        .select('id, oem_number, price_without_vat, price_with_vat, last_price_update, price_locked')
        .eq('oem_number', partNumber)
        .single();

      if (cached?.price_locked) {
        results.push({ oem_number: partNumber, cached: true, locked: true, price_without_vat: cached.price_without_vat, price_with_vat: cached.price_with_vat });
        continue;
      }

      // Check if cache is fresh (less than 24 hours)
      if (cached?.last_price_update) {
        const lastUpdate = new Date(cached.last_price_update);
        const hoursAgo = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
        if (hoursAgo < 24 && mode !== 'force') {
          results.push({ oem_number: partNumber, cached: true, price_without_vat: cached.price_without_vat, price_with_vat: cached.price_with_vat });
          continue;
        }
      }

      // Fetch from external source
      try {
        const response = await fetch(CATALOG_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${btoa(`user:${CATALOG_PASS}`)}`,
          },
          body: `code=${encodeURIComponent(priceCode)}`,
        });

        if (response.ok) {
          const text = await response.text();
          // Parse price from response (CSV/text format)
          const lines = text.split('\n').filter(l => l.trim());
          let priceWithoutVat = 0;
          let priceWithVat = 0;
          
          for (const line of lines) {
            const parts = line.split(';');
            if (parts.length >= 3) {
              priceWithoutVat = parseFloat(parts[1]?.replace(',', '.') || '0') || 0;
              priceWithVat = parseFloat(parts[2]?.replace(',', '.') || '0') || priceWithoutVat * 1.21;
            }
          }

          if (priceWithoutVat > 0) {
            // Store price history if price changed
            if (cached && cached.price_without_vat !== priceWithoutVat) {
              await supabase.from('price_history').insert({
                part_id: cached.id,
                old_price_without_vat: cached.price_without_vat,
                new_price_without_vat: priceWithoutVat,
                old_price_with_vat: cached.price_with_vat,
                new_price_with_vat: priceWithVat,
                source: mode === 'force' ? 'manual' : 'auto',
              });
            }

            // Update or insert
            if (cached) {
              await supabase.from('parts_new').update({
                price_without_vat: priceWithoutVat,
                price_with_vat: priceWithVat,
                last_price_update: new Date().toISOString(),
              }).eq('id', cached.id);
            }

            results.push({ oem_number: partNumber, cached: false, price_without_vat: priceWithoutVat, price_with_vat: priceWithVat });
          } else {
            results.push({ oem_number: partNumber, error: 'Price not found' });
          }
        } else {
          console.error(`Price fetch failed for ${priceCode}: ${response.status}`);
          results.push({ oem_number: partNumber, error: `HTTP ${response.status}` });
        }
      } catch (fetchErr) {
        console.error(`Error fetching price for ${priceCode}:`, fetchErr);
        results.push({ oem_number: partNumber, error: 'Fetch failed' });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
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
