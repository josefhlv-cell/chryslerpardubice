// Brute-force OEM enumeration on vernostsevyplaci.cz
// Strategy: derive numeric neighbors (±N) around existing Mopar OEM bases,
// query each candidate, store HITS in mopar_price_staging.
// Conservative defaults: 2 req/s, ~5000 queries per test run (~40 min).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface RunConfig {
  mode: 'test' | 'conservative' | 'medium' | 'aggressive';
  neighborRange: number;       // ±N around each base
  maxCandidates: number;       // hard cap per run
  delayMs: number;             // delay between requests
  concurrency: number;
}

const PROFILES: Record<string, RunConfig> = {
  test:         { mode: 'test',         neighborRange: 5,  maxCandidates: 5000,   delayMs: 500, concurrency: 2 },
  conservative: { mode: 'conservative', neighborRange: 20, maxCandidates: 170000, delayMs: 500, concurrency: 2 },
  medium:       { mode: 'medium',       neighborRange: 30, maxCandidates: 430000, delayMs: 200, concurrency: 5 },
  aggressive:   { mode: 'aggressive',   neighborRange: 50, maxCandidates: 860000, delayMs: 100, concurrency: 10 },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const CATALOG_PASS = Deno.env.get('CATALOG_PASS');
    if (!CATALOG_PASS) return json({ error: 'Missing CATALOG_PASS' }, 500);

    const authHeader = req.headers.get('Authorization') || '';
    const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE}`;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Admin gate for browser calls
    if (!isServiceRole) {
      if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user?.id) return json({ error: 'Unauthorized' }, 401);
      const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
      if (!roleRow) return json({ error: 'Forbidden: admin only' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'start';

    if (action === 'status') {
      const { data: runs } = await supabase
        .from('mopar_enum_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);
      return json({ runs });
    }

    const profileName = (body.mode || 'test') as keyof typeof PROFILES;
    const profile = PROFILES[profileName] || PROFILES.test;
    const batchId = `${profileName}-${Date.now()}`;

    // 1. Build candidate list from existing OEM neighbors
    const candidates = await buildCandidates(supabase, profile);
    console.log(`📊 Built ${candidates.length} candidates for batch ${batchId}`);

    // Insert run record
    await supabase.from('mopar_enum_runs').insert({
      batch_id: batchId,
      mode: profileName,
      total_candidates: candidates.length,
      status: 'running',
    });

    // Login once
    const cookie = await login(CATALOG_PASS);
    if (!cookie) {
      await supabase.from('mopar_enum_runs').update({ status: 'failed', last_error: 'Login failed', finished_at: new Date().toISOString() }).eq('batch_id', batchId);
      return json({ error: 'Login failed' }, 500);
    }

    // Run async (don't block response)
    const work = (async () => {
      let processed = 0, found = 0, notFound = 0, errors = 0;
      const startTime = Date.now();
      const PROGRESS_INTERVAL = 50;

      // Worker pool
      let idx = 0;
      const workers = Array.from({ length: profile.concurrency }, async () => {
        while (idx < candidates.length) {
          const i = idx++;
          const oem = candidates[i];
          await new Promise(r => setTimeout(r, profile.delayMs));

          try {
            const res = await searchOEM(oem, cookie);
            processed++;
            if (res.found && res.priceWithVat && res.priceWithVat > 0) {
              found++;
              await supabase.from('mopar_price_staging').upsert({
                oem_number: oem,
                search_variant: res.variant,
                catalog_name: res.name,
                price_without_vat: res.priceWithoutVat,
                price_with_vat: res.priceWithVat,
                exists_in_parts_new: res.existsInParts,
                status: 'found',
                enum_batch: batchId,
              }, { onConflict: 'oem_number' });
            } else {
              notFound++;
            }

            if (processed % PROGRESS_INTERVAL === 0) {
              await supabase.from('mopar_enum_runs').update({
                processed, found, not_found: notFound, errors,
              }).eq('batch_id', batchId);
              console.log(`📈 ${batchId}: ${processed}/${candidates.length} | found=${found} | rate=${(processed / ((Date.now() - startTime) / 1000)).toFixed(1)}/s`);
            }
          } catch (e) {
            errors++;
            console.error(`❌ ${oem}: ${String(e)}`);
            // Stop run if ban suspected (>20 consecutive errors in short time)
            if (errors > 50 && errors / processed > 0.3) {
              throw new Error('Ban suspected - stopping');
            }
          }
        }
      });

      try {
        await Promise.all(workers);
        await supabase.from('mopar_enum_runs').update({
          processed, found, not_found: notFound, errors,
          status: 'completed', finished_at: new Date().toISOString(),
        }).eq('batch_id', batchId);
        console.log(`✅ ${batchId} done: ${found} new prices in ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
      } catch (e) {
        await supabase.from('mopar_enum_runs').update({
          processed, found, not_found: notFound, errors,
          status: 'failed', last_error: String(e), finished_at: new Date().toISOString(),
        }).eq('batch_id', batchId);
      }
    })();

    // @ts-ignore - EdgeRuntime is Deno deploy specific
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
    else work.catch(e => console.error('Background work failed:', e));

    return json({
      ok: true,
      batch_id: batchId,
      mode: profileName,
      total_candidates: candidates.length,
      estimated_minutes: Math.ceil((candidates.length * profile.delayMs / profile.concurrency) / 60000),
      message: `Spuštěno na pozadí. Sleduj progress přes action='status' nebo v tabulce mopar_enum_runs.`,
    });
  } catch (e) {
    console.error('Fatal:', e);
    return json({ error: String(e) }, 500);
  }
});

async function buildCandidates(supabase: any, profile: RunConfig): Promise<string[]> {
  // Pull all existing Mopar-style OEM bases
  const { data: parts } = await supabase
    .from('parts_new')
    .select('oem_number')
    .in('catalog_source', ['mopar', 'mopar_oem', 'csv', 'epc-link', '7zap', 'epc-ai', 'ai-epc'])
    .not('oem_number', 'like', 'SAG-%')
    .not('oem_number', 'like', 'AK-%')
    .not('oem_number', 'like', 'JM-%')
    .limit(20000);

  const existingSet = new Set<string>();
  const baseNumbers = new Set<number>();
  const prefixes = new Set<string>();

  for (const p of parts || []) {
    const oem = (p.oem_number || '').toUpperCase().trim();
    if (!oem) continue;
    existingSet.add(oem);

    // Extract numeric core, e.g. K68229000AA → 68229000
    const m = oem.match(/^K?(\d{6,8})[A-Z]{0,3}$/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!isNaN(num) && num > 100000) {
        baseNumbers.add(num);
        // Track prefix length
        prefixes.add(m[1].length === 8 ? '8' : '7');
      }
    }
  }

  console.log(`📚 Existing: ${existingSet.size} OEMs, ${baseNumbers.size} unique numeric bases`);

  // Generate neighbors
  const candidates = new Set<string>();
  const range = profile.neighborRange;
  for (const base of baseNumbers) {
    const len = String(base).length;
    for (let delta = -range; delta <= range; delta++) {
      if (delta === 0) continue;
      const candidate = base + delta;
      if (candidate < 0) continue;
      const padded = String(candidate).padStart(len, '0');
      // Try base form (will become K-prefixed in search variants)
      const oemForm = padded + 'AA'; // most common revision suffix
      if (!existingSet.has(oemForm) && !existingSet.has('K' + oemForm)) {
        candidates.add(oemForm);
      }
    }
    if (candidates.size >= profile.maxCandidates) break;
  }

  return Array.from(candidates).slice(0, profile.maxCandidates);
}

async function login(password: string): Promise<string | null> {
  const resp = await fetch(CATALOG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: `password=${encodeURIComponent(password)}&submit-password=P%C5%99ihl%C3%A1sit`,
    redirect: 'manual',
  });
  const cookies = resp.headers.getSetCookie?.() || [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
  if (!cookieStr) return null;
  console.log(`🔑 Login OK`);
  return cookieStr;
}

interface SearchResult {
  found: boolean;
  variant?: string;
  name?: string;
  priceWithoutVat?: number;
  priceWithVat?: number;
  existsInParts?: boolean;
}

async function searchOEM(oem: string, cookie: string): Promise<SearchResult> {
  // K-prefix is required for vernostsevyplaci dealer catalog
  const variants = [`K${oem}`, oem, `6${oem}`];
  for (const variant of variants) {
    const resp = await fetch(CATALOG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookie,
        'User-Agent': UA,
      },
      body: `find-part=${encodeURIComponent(variant)}&search-part=Vyhledat`,
    });
    const html = await resp.text();
    const prices = extractPrices(html);
    if (prices.length === 0) continue;
    const name = extractName(html);
    return {
      found: true,
      variant,
      name,
      priceWithoutVat: prices[0],
      priceWithVat: prices[1] || Math.round(prices[0] * 1.21 * 100) / 100,
      existsInParts: false, // updated downstream
    };
  }
  return { found: false };
}

function extractPrices(html: string): number[] {
  const prices: number[] = [];
  // Look for price cells: numbers like "1 234,56" or "123.45"
  const re = /<td[^>]*>\s*([\d\s]+[,.]\d{2})\s*<\/td>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(n) && n > 0 && n < 10000000) prices.push(n);
  }
  return prices;
}

function extractName(html: string): string | null {
  const m = html.match(/<td[^>]*>[^<]*K?\d{5,}[A-Z]*[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  return m ? m[1].trim() : null;
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
