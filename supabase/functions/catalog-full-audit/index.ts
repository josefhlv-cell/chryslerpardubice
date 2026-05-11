// catalog-full-audit
// Async orchestrator – complete catalog reconciliation against J+M (Nextis).
//
// Pipeline (per run):
//   1. Discover K-types for vehicles missing one (nextis-ktype-lookup → validate → persist)
//   2. Warm jm cache for all K-typed vehicles (jm-proxy partsForEngine)
//   3. Rebuild J+M category tree (jm-tree-build)
//   4. Reclassify parts (jm-classify-parts)
//   5. Match OEM ↔ J+M (compat-matcher)
//   6. Run catalog-diagnostic
//   7. Persist full report + admin notification
//
// Usage:
//   POST { action: "start" }       – kicks off background run, returns runId immediately
//   POST { action: "status", runId } – returns current progress
//
// Progress is stored in api_cache (cache_type = 'catalog_full_audit', cache_key = runId)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Progress {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'done' | 'failed';
  step: string;
  pct: number;
  ktype: { total: number; resolved: number; failed: number; skipped: number };
  warm: { total: number; ok: number; failed: number };
  tree?: any;
  classify?: any;
  compat?: any;
  diagnostic?: any;
  errors: string[];
}

async function callFn(name: string, body: unknown, timeoutMs = 90_000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    return { ok: r.ok, status: r.status, body: json ?? text };
  } catch (e) {
    return { ok: false, status: 0, body: String((e as Error).message) };
  } finally {
    clearTimeout(to);
  }
}

async function saveProgress(supabase: any, p: Progress) {
  await supabase.from('api_cache').upsert({
    cache_type: 'catalog_full_audit',
    cache_key: p.runId,
    data: p,
    ttl_seconds: 60 * 60 * 24 * 30,
    created_at: new Date().toISOString(),
  }, { onConflict: 'cache_type,cache_key' });
}

async function runPipeline(runId: string) {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const p: Progress = {
    runId,
    startedAt: new Date().toISOString(),
    status: 'running',
    step: 'init',
    pct: 0,
    ktype: { total: 0, resolved: 0, failed: 0, skipped: 0 },
    warm: { total: 0, ok: 0, failed: 0 },
    errors: [],
  };
  await saveProgress(supabase, p);

  try {
    // ── Step 1 — K-type discovery ───────────────────────────────────────────
    p.step = '1/7 K-type discovery';
    p.pct = 5;
    await saveProgress(supabase, p);

    const { data: vehicles } = await supabase
      .from('nextis_vehicles')
      .select('id, brand, model, engine, year_from, year_to, power_kw, fuel, external_id');

    const { data: mappings } = await supabase
      .from('vehicle_engine_mappings')
      .select('brand, model, engine, k_type');

    const mapKey = (b: string, m: string, e: string | null) =>
      `${b}|${m}|${e ?? ''}`.toLowerCase();
    const haveKType = new Map<string, number>();
    for (const m of mappings ?? []) {
      if (m.k_type) haveKType.set(mapKey(m.brand, m.model, m.engine), Number(m.k_type));
    }
    for (const v of vehicles ?? []) {
      const ext = (v.external_id || '').toString().trim();
      if (/^\d+$/.test(ext)) haveKType.set(mapKey(v.brand, v.model, v.engine), Number(ext));
    }

    const missing = (vehicles ?? []).filter((v: any) => !haveKType.has(mapKey(v.brand, v.model, v.engine)));
    p.ktype.total = missing.length;
    await saveProgress(supabase, p);

    for (let i = 0; i < missing.length; i++) {
      const v = missing[i];
      const lookup = await callFn('nextis-ktype-lookup', {
        action: 'lookup',
        brand: v.brand,
        model: v.model,
        engine: v.engine,
        yearFrom: v.year_from,
        yearTo: v.year_to,
        powerKw: v.power_kw,
        fuel: v.fuel,
      }, 25_000);

      const candidates = (lookup.body?.candidates as any[]) || [];
      let saved = false;
      for (const c of candidates.slice(0, 3)) {
        if (!c.k_type) continue;
        const val = await callFn('nextis-ktype-lookup', { action: 'validate', kType: c.k_type }, 15_000);
        if (val.body?.valid && (val.body?.sampleHits ?? 0) > 0) {
          await supabase.from('vehicle_engine_mappings').upsert({
            brand: v.brand, model: v.model, engine: v.engine, k_type: c.k_type,
            source: 'catalog-full-audit',
          }, { onConflict: 'brand,model,engine' });
          haveKType.set(mapKey(v.brand, v.model, v.engine), c.k_type);
          p.ktype.resolved++;
          saved = true;
          break;
        }
      }
      if (!saved) {
        p.ktype.failed++;
        p.errors.push(`ktype-miss: ${v.brand} ${v.model} ${v.engine ?? ''}`);
      }
      p.pct = 5 + Math.round(((i + 1) / Math.max(1, missing.length)) * 30);
      if (i % 3 === 0) await saveProgress(supabase, p);
    }
    await saveProgress(supabase, p);

    // ── Step 2 — Warm cache for every K-typed vehicle ──────────────────────
    p.step = '2/7 Warm J+M cache';
    p.pct = 35;
    await saveProgress(supabase, p);

    const targets = Array.from(haveKType.entries()).map(([key, k]) => {
      const [brand, model, engine] = key.split('|');
      return { brand, model, engine, k_type: k };
    });
    p.warm.total = targets.length;
    await saveProgress(supabase, p);

    // Process with low concurrency to be gentle to Nextis quotas
    const CONC = 2;
    let idx = 0;
    async function worker() {
      while (true) {
        const i = idx++;
        if (i >= targets.length) return;
        const t = targets[i];
        const r = await callFn('jm-proxy', {
          action: 'partsForEngine',
          payload: { engineID: t.k_type, brand: t.brand, model: t.model, engine: t.engine },
        }, 60_000);
        if (r.ok) p.warm.ok++; else p.warm.failed++;
        p.pct = 35 + Math.round(((p.warm.ok + p.warm.failed) / Math.max(1, targets.length)) * 25);
        if ((p.warm.ok + p.warm.failed) % 5 === 0) await saveProgress(supabase, p);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONC, targets.length) }, () => worker()));
    await saveProgress(supabase, p);

    // ── Step 3 — Rebuild J+M tree ──────────────────────────────────────────
    p.step = '3/7 Rebuild J+M tree';
    p.pct = 60;
    await saveProgress(supabase, p);
    const tree = await callFn('jm-tree-build', { scope: 'all' }, 120_000);
    p.tree = { ok: tree.ok, status: tree.status, summary: tree.body?.summary ?? tree.body };
    await saveProgress(supabase, p);

    // ── Step 4 — Reclassify parts ──────────────────────────────────────────
    p.step = '4/7 Reclassify parts';
    p.pct = 70;
    await saveProgress(supabase, p);
    const cls = await callFn('jm-classify-parts', {}, 120_000);
    p.classify = { ok: cls.ok, status: cls.status, summary: cls.body?.summary ?? cls.body };
    await saveProgress(supabase, p);

    // ── Step 5 — OEM ↔ J+M matcher ─────────────────────────────────────────
    p.step = '5/7 OEM/JM matcher';
    p.pct = 80;
    await saveProgress(supabase, p);
    const cm = await callFn('compat-matcher', { action: 'match-all' }, 120_000);
    p.compat = { ok: cm.ok, status: cm.status, summary: cm.body?.summary ?? cm.body };
    await saveProgress(supabase, p);

    // ── Step 6 — Catalog diagnostic ────────────────────────────────────────
    p.step = '6/7 Catalog diagnostic';
    p.pct = 90;
    await saveProgress(supabase, p);
    const diag = await callFn('catalog-diagnostic', { action: 'run' }, 120_000);
    p.diagnostic = { ok: diag.ok, status: diag.status, summary: diag.body?.summary ?? diag.body };
    await saveProgress(supabase, p);

    // ── Step 7 — Notify admins + finish ────────────────────────────────────
    p.step = '7/7 Done';
    p.pct = 100;
    p.status = 'done';
    p.finishedAt = new Date().toISOString();
    await saveProgress(supabase, p);

    const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    if (admins?.length) {
      const ok = p.ktype.resolved + p.warm.ok;
      const fail = p.ktype.failed + p.warm.failed;
      const title = `${fail === 0 ? '✅' : '⚠️'} Audit katalogu dokončen`;
      const message = `K-type vyřešeno: ${p.ktype.resolved}/${p.ktype.total} · Cache: ${p.warm.ok}/${p.warm.total} · Chyby: ${fail}`;
      await supabase.from('notifications').insert(
        admins.map((a: any) => ({ user_id: a.user_id, title, message }))
      );
    }
  } catch (e) {
    p.status = 'failed';
    p.errors.push(String((e as Error).message));
    p.finishedAt = new Date().toISOString();
    await saveProgress(supabase, p);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'start');
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    if (action === 'status') {
      const runId = String(body.runId || '');
      if (!runId) {
        return new Response(JSON.stringify({ error: 'runId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data } = await supabase.from('api_cache')
        .select('data')
        .eq('cache_type', 'catalog_full_audit')
        .eq('cache_key', runId)
        .maybeSingle();
      return new Response(JSON.stringify(data?.data ?? { error: 'not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'latest') {
      const { data } = await supabase.from('api_cache')
        .select('data, created_at')
        .eq('cache_type', 'catalog_full_audit')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return new Response(JSON.stringify(data?.data ?? { error: 'no runs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // action === 'start'
    const runId = `audit_${Date.now()}`;
    // @ts-ignore EdgeRuntime is available in supabase deno
    EdgeRuntime.waitUntil(runPipeline(runId));
    return new Response(JSON.stringify({ runId, status: 'started' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
