// Resolves engine-level K-types for nextis_vehicles rows that share a model-level
// external_id or are missing one entirely. Uses the existing jm-proxy resolveKType
// action (which scrapes the J+M / TecDoc wizard for accurate per-engine K-types)
// with fallback to nextis-ktype-lookup, and queues unresolved rows in
// admin_review_queue for manual fix-up.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callFn(name: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch (_) { /* noop */ }
  return { status: res.status, body: parsed ?? text };
}

async function resolveOne(row: any): Promise<{ k_type: number; source: string } | { error: string }> {
  // Primary: jm-proxy resolveKType (eshop TecDoc wizard — per-engine accurate).
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await callFn('jm-proxy', {
      action: 'resolveKType',
      payload: {
        brand: row.brand,
        model: row.model,
        engine: row.engine,
        year: row.year_from || undefined,
      },
    });
    if (r.status === 429 || (typeof r.body === 'object' && r.body?.error?.includes?.('Rate limit'))) {
      await sleep(15_000);
      continue;
    }
    if (r.status === 200 && r.body?.ok && Number(r.body.k_type) > 0) {
      return { k_type: Number(r.body.k_type), source: r.body.source || 'jm_eshop' };
    }
    console.log('[resolveOne] jm-proxy returned', row.brand, row.model, row.engine, '->', JSON.stringify(r));
    break;
  }
  // Fallback: nextis-ktype-lookup (authenticated API search)
  try {
    const r = await callFn('nextis-ktype-lookup', {
      action: 'lookup',
      brand: row.brand,
      model: row.model,
      engine: row.engine ?? '',
      yearFrom: row.year_from ?? 0,
      yearTo: row.year_to ?? 0,
      powerKw: row.power_kw ?? 0,
      fuel: row.fuel ?? '',
    });
    const best = (r.body?.candidates || [])[0];
    if (best && best.k_type && best.score >= 50) {
      return { k_type: Number(best.k_type), source: 'nextis_api' };
    }
  } catch (_) { /* noop */ }
  return { error: 'no candidate' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const limit = Number(url.searchParams.get('limit') || 200);
  const delayMs = Number(url.searchParams.get('delay') || 1500);

  const { data: rows, error } = await supabase
    .from('nextis_vehicles')
    .select('id, brand, model, engine, year_from, year_to, power_kw, fuel, external_id')
    .limit(limit);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Identify model-level (shared) K-types.
  const byExt = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.external_id) byExt.set(r.external_id, (byExt.get(r.external_id) ?? 0) + 1);
  }
  const targets = (rows ?? []).filter(
    (r) => !r.external_id || (r.external_id && (byExt.get(r.external_id) ?? 0) > 1),
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
    const r = await resolveOne(row);
    if ('k_type' in r && r.k_type && String(r.k_type) !== String(row.external_id ?? '')) {
      if (!dryRun) {
        await supabase.from('nextis_vehicles')
          .update({ external_id: String(r.k_type) })
          .eq('id', row.id);
      }
      result.updated++;
      result.details.push({ id: row.id, brand: row.brand, model: row.model, engine: row.engine, old: row.external_id, new: r.k_type, source: r.source });
    } else if ('k_type' in r) {
      result.unchanged++;
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
          reason: r.error,
        });
      }
      result.queued++;
      result.details.push({ id: row.id, brand: row.brand, model: row.model, engine: row.engine, queued: true, reason: r.error });
    }
    if (i < targets.length - 1) await sleep(delayMs);
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
