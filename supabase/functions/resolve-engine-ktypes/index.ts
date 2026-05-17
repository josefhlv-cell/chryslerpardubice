// Resolves engine-level K-types for nextis_vehicles rows that share a model-level
// external_id or are missing one entirely. Calls the J+M eshop TecDoc wizard
// directly (inline scrape) — no inter-function Supabase calls so we avoid
// the per-trace egress rate limit. Falls back to nextis-ktype-lookup; unresolved
// rows are queued in admin_review_queue for manual fix-up.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const JM_PUBLIC_MANUFACTURER_IDS: Record<string, number> = {
  chrysler: 20, dodge: 29, ram: 3689, lancia: 64,
};

function normLoose(s: string): string {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function normRoute(s: string): string {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function htmlDecode(s: string): string {
  return String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function jmPublicPostApi(path: string, params: Record<string, string | number | boolean>): Promise<string> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const res = await fetch(`https://eshop.jmautodily.cz/ajax-api/${path}?${qs}`, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: 'https://eshop.jmautodily.cz/cs',
    },
    body: '',
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`jm-public ${res.status}`);
  const text = await res.text();
  const parsed = JSON.parse(text);
  return typeof parsed === 'string' ? parsed : String(parsed || '');
}

function parseSelectOptions(html: string, selectId: string) {
  const reSelect = new RegExp(`<select[^>]+id=["']${selectId}["'][\\s\\S]*?<\\/select>`, 'i');
  const block = html.match(reSelect)?.[0] || '';
  const out: Array<{ id: number; label: string; route: string; meta: string }> = [];
  const re = /<option\s+([^>]*?)>([\s\S]*?)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const attrs = m[1] || '';
    const id = Number(attrs.match(/value=["']([^"']+)/i)?.[1] || 0);
    if (!id || id < 0) continue;
    out.push({
      id,
      route: htmlDecode(attrs.match(/data-flex-route-name=["']([^"']*)/i)?.[1] || ''),
      meta: htmlDecode(attrs.match(/data-flex-additional-text=["']([^"']*)/i)?.[1] || ''),
      label: htmlDecode((m[2] || '').replace(/<[^>]+>/g, '').trim()),
    });
  }
  return out;
}

async function resolveFromJmSelector(supabase: any, hint: { brand: string; model: string; engine: string; year?: number }) {
  const brandKey = normLoose(hint.brand).replace(/\s+/g, '');
  const manufacturerID = JM_PUBLIC_MANUFACTURER_IDS[brandKey];
  if (!manufacturerID || !hint.model || !hint.engine) return null;

  const cacheKey = `jm_public_ktype:${hint.brand}|${hint.model}|${hint.engine}|${hint.year || ''}`.toLowerCase();
  try {
    const { data: cached } = await supabase.from('api_cache').select('data, created_at, ttl_seconds')
      .eq('cache_type', 'jm_public_ktype').eq('cache_key', cacheKey).maybeSingle();
    if (cached && Date.now() - new Date(cached.created_at).getTime() < (cached.ttl_seconds ?? 2592000) * 1000) {
      const k = Number((cached.data as any)?.k_type || 0);
      if (k > 0) return { k_type: k, source: 'jm_eshop_cache' };
    }
  } catch (_) { /* noop */ }

  const htmlModels = await jmPublicPostApi('tecdoc/get-select-vehicle-wizard-steps', { manufacturerID, modelID: -1, engineID: -1 });
  const modelNeedle = normLoose(hint.model).replace(/\b(grand|town|country|and)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const models = parseSelectOptions(htmlModels, 'ModelSelector').map((m) => {
    const label = normLoose(m.label);
    const route = normRoute(m.route);
    let score = 0;
    for (const token of modelNeedle.split(' ').filter((t) => t.length > 1)) if (label.includes(token) || route.includes(token)) score += 20;
    if (normLoose(hint.model).includes('town') && label.includes('voyager')) score += 25;
    if (hint.year && m.meta) {
      const years = [...m.meta.matchAll(/(\d{4})/g)].map((x) => Number(x[1]));
      if (years.length && hint.year >= (years[0] || 0) && (!years[1] || hint.year <= years[1])) score += 15;
    }
    return { ...m, score };
  }).filter((m) => m.score > 0).sort((a, b) => b.score - a.score);
  const model = models[0];
  if (!model) return null;

  const htmlEngines = await jmPublicPostApi('tecdoc/get-select-vehicle-wizard-steps', { manufacturerID, modelID: model.id, engineID: -1 });
  const engineNeedle = normLoose(hint.engine).replace(/\b(v6|v8|hemi|srt|crd|td|tdi|hybrid)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const displacement = hint.engine.match(/\d+[.,]\d+/)?.[0]?.replace(',', '.');
  const engines = parseSelectOptions(htmlEngines, 'EngineSelector').map((e) => {
    const hay = normLoose(`${e.label} ${e.route} ${e.meta}`);
    let score = 0;
    if (displacement && hay.includes(displacement)) score += 60;
    for (const token of engineNeedle.split(' ').filter((t) => t.length > 1)) if (hay.includes(token)) score += 12;
    if (/hemi/i.test(hint.engine) && /hemi/i.test(`${e.label} ${e.meta}`)) score += 25;
    if (/crd|diesel/i.test(hint.engine) && /crd|diesel/i.test(`${e.label} ${e.meta}`)) score += 25;
    return { ...e, score };
  }).filter((e) => e.score > 0).sort((a, b) => b.score - a.score);
  const engine = engines[0];
  if (!engine) return null;

  try {
    await supabase.from('api_cache').upsert({
      cache_type: 'jm_public_ktype', cache_key: cacheKey,
      data: { k_type: engine.id, model_id: model.id, model: model.label, engine: engine.label },
      ttl_seconds: 60 * 60 * 24 * 30, created_at: new Date().toISOString(),
    }, { onConflict: 'cache_type,cache_key' });
  } catch (_) { /* noop */ }

  return { k_type: engine.id, source: 'jm_eshop' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const limit = Number(url.searchParams.get('limit') || 200);
  const delayMs = Number(url.searchParams.get('delay') || 800);
  const offset = Number(url.searchParams.get('offset') || 0);

  const { data: rows, error } = await supabase
    .from('nextis_vehicles')
    .select('id, brand, model, engine, year_from, year_to, power_kw, fuel, external_id')
    .order('brand').order('model').order('engine')
    .range(offset, offset + limit - 1);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Identify model-level (shared) K-types — re-query the full table for accurate grouping.
  const { data: allExt } = await supabase.from('nextis_vehicles').select('external_id');
  const byExt = new Map<string, number>();
  for (const r of allExt ?? []) {
    if (r.external_id) byExt.set(String(r.external_id), (byExt.get(String(r.external_id)) ?? 0) + 1);
  }
  const targets = (rows ?? []).filter(
    (r) => !r.external_id || (byExt.get(String(r.external_id)) ?? 0) > 1,
  );

  const result = {
    examined: rows?.length ?? 0,
    targets: targets.length,
    updated: 0,
    queued: 0,
    unchanged: 0,
    details: [] as any[],
  };

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    let resolved: { k_type: number; source: string } | null = null;
    let errMsg = '';
    try {
      const r = await resolveFromJmSelector(supabase, {
        brand: row.brand, model: row.model, engine: row.engine || '', year: row.year_from || undefined,
      });
      if (r?.k_type) resolved = r;
    } catch (e) {
      errMsg = (e as Error).message;
    }

    if (resolved && String(resolved.k_type) !== String(row.external_id ?? '')) {
      if (!dryRun) {
        await supabase.from('nextis_vehicles')
          .update({ external_id: String(resolved.k_type) })
          .eq('id', row.id);
      }
      result.updated++;
      result.details.push({ id: row.id, brand: row.brand, model: row.model, engine: row.engine, old: row.external_id, new: resolved.k_type, source: resolved.source });
    } else if (resolved) {
      result.unchanged++;
      result.details.push({ id: row.id, brand: row.brand, model: row.model, engine: row.engine, unchanged: resolved.k_type });
    } else {
      if (!dryRun) {
        await supabase.from('admin_review_queue').insert({
          topic: 'engine_ktype_missing',
          ref_table: 'nextis_vehicles',
          ref_id: row.id,
          payload: {
            brand: row.brand, model: row.model, engine: row.engine,
            year_from: row.year_from, year_to: row.year_to,
            power_kw: row.power_kw, fuel: row.fuel,
            current_external_id: row.external_id,
          },
          reason: errMsg || 'no candidate from J+M selector',
        });
      }
      result.queued++;
      result.details.push({ id: row.id, brand: row.brand, model: row.model, engine: row.engine, queued: true, error: errMsg || 'no candidate' });
    }
    if (i < targets.length - 1) await sleep(delayMs);
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
