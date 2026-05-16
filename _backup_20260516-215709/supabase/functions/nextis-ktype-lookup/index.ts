// Nextis K-type (TecDoc engineID) lookup + validation.
// Two actions:
//   action: 'lookup'   - find candidate K-types for brand/model/engine
//   action: 'validate' - check that a K-type returns sections (vehicle exists in Nextis)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BASE_URL = 'https://api.jmautodily.nextis.cz';

let cachedToken: { token: string; expiresAt: number } | null = null;
async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const login = Deno.env.get('JM_LOGIN');
  const password = Deno.env.get('JM_PASS');
  if (!login || !password) throw new Error('JM_LOGIN/JM_PASS not configured');
  const res = await fetch(`${BASE_URL}/common/authentication`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  if (!res.ok) throw new Error(`auth failed ${res.status}`);
  const j = await res.json();
  const token = j?.token || j?.Token;
  const validTo = j?.tokenValidTo || j?.TokenValidTo;
  cachedToken = { token, expiresAt: validTo ? new Date(validTo).getTime() : Date.now() + 60 * 60 * 1000 };
  return token;
}

async function nextisPost(path: string, body: Record<string, unknown>, timeoutMs = 12_000): Promise<any> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token, language: 'cs', ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 401) {
    cachedToken = null;
    return nextisPost(path, body, timeoutMs);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Nextis ${path} ${res.status}: ${t.slice(0, 200)}`);
  }
  return await res.json();
}

function normalizeStr(s: any): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function scoreCandidate(c: any, hint: { engine?: string; powerKw?: number; yearFrom?: number; yearTo?: number; fuel?: string }) {
  let score = 0;
  const eng = normalizeStr(hint.engine);
  const cEng = normalizeStr(c.engine || c.engineCode || c.engineLabel || c.label);
  if (eng) {
    if (cEng.includes(eng) || eng.includes(cEng)) score += 50;
    // Match displacement (e.g. "5.7" or "57")
    const m1 = eng.match(/(\d+\.\d+)/);
    const m2 = cEng.match(/(\d+\.\d+)/);
    if (m1 && m2 && m1[1] === m2[1]) score += 25;
  }
  if (hint.powerKw && c.powerKW) {
    const diff = Math.abs(Number(c.powerKW) - hint.powerKw);
    if (diff === 0) score += 30;
    else if (diff <= 5) score += 20;
    else if (diff <= 15) score += 10;
  }
  if (hint.yearFrom && c.yearFrom && Math.abs(Number(c.yearFrom) - hint.yearFrom) <= 2) score += 10;
  if (hint.yearTo && c.yearTo && Math.abs(Number(c.yearTo) - hint.yearTo) <= 2) score += 10;
  if (hint.fuel && c.fuelType && normalizeStr(c.fuelType) === normalizeStr(hint.fuel)) score += 10;
  return score;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const body = await req.json();
    const action = String(body.action || 'lookup');

    if (action === 'validate') {
      const kType = Number(body.kType || 0);
      if (!kType) {
        return new Response(JSON.stringify({ valid: false, error: 'kType required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Probe with a common section (oil filter genArtID=22)
      try {
        const probe = await nextisPost('/catalogs/items-finding-by-vehicle', {
          engineID: kType, genArtID: 22, getOECodes: false, target: 'P',
        }, 8_000);
        const items = probe?.items || probe?.Items || [];
        return new Response(JSON.stringify({
          valid: true, kType, sampleHits: items.length,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ valid: false, kType, error: (e as Error).message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // action === 'lookup'
    const brand = String(body.brand || '').trim();
    const model = String(body.model || '').trim();
    const engine = String(body.engine || '').trim();
    const yearFrom = Number(body.yearFrom || 0);
    const yearTo = Number(body.yearTo || 0);
    const powerKw = Number(body.powerKw || 0);
    const fuel = String(body.fuel || '').trim();
    if (!brand || !model) {
      return new Response(JSON.stringify({ candidates: [], error: 'brand+model required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cacheKey = `lookup:${brand}|${model}|${engine}|${yearFrom}-${yearTo}|${powerKw}|${fuel}`.toLowerCase();
    try {
      const { data: cached } = await supabase.from('api_cache')
        .select('data, created_at, ttl_seconds')
        .eq('cache_type', 'nextis_ktype_lookup')
        .eq('cache_key', cacheKey)
        .maybeSingle();
      if (cached) {
        const ageMs = Date.now() - new Date(cached.created_at as string).getTime();
        if (ageMs < (cached.ttl_seconds ?? 7 * 24 * 3600) * 1000) {
          return new Response(JSON.stringify({ ...(cached.data as any), fromCache: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    } catch (_) { /* noop */ }

    // Try multiple Nextis vehicle search endpoints — schema slightly varies.
    let raw: any = null;
    const attempts: string[] = [];
    for (const path of [
      '/catalogs/vehicles-by-brand-model',
      '/catalogs/vehicle-engines-by-brand-model',
      '/catalogs/vehicles-search',
    ]) {
      try {
        raw = await nextisPost(path, { brand, model, language: 'cs' });
        attempts.push(`${path}:ok`);
        if (raw && (raw.items || raw.Items || raw.vehicles || raw.Vehicles)) break;
      } catch (e) {
        attempts.push(`${path}:${(e as Error).message.slice(0, 50)}`);
      }
    }

    const list: any[] = raw?.items || raw?.Items || raw?.vehicles || raw?.Vehicles || [];
    const normalized = list.map((v: any) => ({
      k_type: Number(v.engineID || v.EngineID || v.kType || v.KType || v.id || v.Id || 0),
      label: String(v.label || v.Label || v.engineLabel || v.EngineLabel || v.name || v.Name || ''),
      engine: String(v.engine || v.Engine || v.engineCode || v.EngineCode || ''),
      power_kw: Number(v.powerKW || v.PowerKW || v.powerKw || 0),
      power_hp: Number(v.powerHP || v.PowerHP || 0),
      fuel: String(v.fuelType || v.FuelType || v.fuel || ''),
      year_from: Number(v.yearFrom || v.YearFrom || v.dateFrom?.slice(0, 4) || 0),
      year_to: Number(v.yearTo || v.YearTo || v.dateTo?.slice(0, 4) || 0),
    })).filter((c: any) => c.k_type > 0);

    const scored = normalized
      .map((c: any) => ({ ...c, score: scoreCandidate({ ...c, powerKW: c.power_kw }, { engine, powerKw, yearFrom, yearTo, fuel }) }))
      .sort((a, b) => b.score - a.score);

    const out = { candidates: scored.slice(0, 20), total: normalized.length, attempts };

    try {
      await supabase.from('api_cache').upsert({
        cache_type: 'nextis_ktype_lookup',
        cache_key: cacheKey,
        data: out,
        ttl_seconds: 7 * 24 * 3600,
        created_at: new Date().toISOString(),
      }, { onConflict: 'cache_type,cache_key' });
    } catch (_) { /* noop */ }

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
