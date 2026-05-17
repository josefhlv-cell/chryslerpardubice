// Resolves engine-level K-types for nextis_vehicles rows that share a model-level
// external_id or are missing one entirely. Uses the existing nextis-ktype-lookup
// function (Nextis API) and falls back to admin_review_queue when no candidate matches.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function lookup(payload: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/nextis-ktype-lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ action: 'lookup', ...payload }),
  });
  if (!res.ok) throw new Error(`lookup ${res.status}`);
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const limit = Number(url.searchParams.get('limit') || 200);

  // Targets: rows where external_id is NULL, or rows sharing same external_id with
  // a different engine (model-level K-type leak).
  const { data: rows, error } = await supabase
    .from('nextis_vehicles')
    .select('id, brand, model, engine, year_from, year_to, power_kw, fuel, external_id')
    .limit(limit);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Group by external_id to identify shared (model-level) ones.
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
    skipped: 0,
    details: [] as any[],
  };

  for (const row of targets) {
    try {
      const r = await lookup({
        brand: row.brand,
        model: row.model,
        engine: row.engine ?? '',
        yearFrom: row.year_from ?? 0,
        yearTo: row.year_to ?? 0,
        powerKw: row.power_kw ?? 0,
        fuel: row.fuel ?? '',
      });
      const best = (r.candidates || [])[0];
      // Require: strong score AND different from current model-level ID
      if (best && best.k_type && best.score >= 50 && String(best.k_type) !== String(row.external_id ?? '')) {
        if (!dryRun) {
          await supabase
            .from('nextis_vehicles')
            .update({ external_id: String(best.k_type) })
            .eq('id', row.id);
        }
        result.updated++;
        result.details.push({ id: row.id, brand: row.brand, model: row.model, engine: row.engine, old: row.external_id, new: best.k_type, score: best.score });
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
              top_candidates: (r.candidates || []).slice(0, 5),
            },
            reason: best ? `low score ${best.score}` : 'no candidates',
          });
        }
        result.queued++;
        result.details.push({ id: row.id, brand: row.brand, model: row.model, engine: row.engine, queued: true, topCandidate: best ?? null });
      }
    } catch (e) {
      result.skipped++;
      result.details.push({ id: row.id, error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
