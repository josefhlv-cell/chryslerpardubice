// Spouští se denně v 00:01 přes pg_cron.
// 1) Ověří engineId flow pro VŠECHNY vozy s namapovaným K-type
//    (nextis_vehicles.external_id číselné NEBO vehicle_engine_mappings.k_type)
// 2) Spustí compat-matcher (match-all) pro propojení OEM <-> J+M

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Konkurence + limity (jemně k API – 20k volání/den)
const VEHICLE_CONCURRENCY = 2;
const PER_VEHICLE_TIMEOUT_MS = 60_000;
const GLOBAL_BUDGET_MS = 25 * 60_000; // max 25 minut

async function callFn(name: string, body: unknown, timeoutMs = PER_VEHICLE_TIMEOUT_MS) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* keep text */ }
    return { ok: r.ok, status: r.status, ms: Date.now() - t0, body: json ?? text };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, body: String((e as Error).message) };
  } finally {
    clearTimeout(to);
  }
}

async function runConcurrent<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) break;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  // 1) Sesbírej všechny vozy s K-type (z mappings i z nextis_vehicles.external_id)
  const targets: Array<{
    brand: string; model: string; engine: string | null; k_type: number; source: string;
  }> = [];

  const { data: mappings } = await supabase
    .from("vehicle_engine_mappings")
    .select("brand,model,engine,k_type")
    .order("brand");
  for (const m of mappings ?? []) {
    if (m.k_type) targets.push({ brand: m.brand, model: m.model, engine: m.engine ?? null, k_type: Number(m.k_type), source: "mapping" });
  }

  const { data: vehicles } = await supabase
    .from("nextis_vehicles")
    .select("brand,model,engine,external_id");
  for (const v of vehicles ?? []) {
    const ext = (v.external_id || "").toString().trim();
    if (!/^\d+$/.test(ext)) continue;
    const k = Number(ext);
    if (targets.some((t) => t.k_type === k)) continue;
    targets.push({ brand: v.brand, model: v.model, engine: v.engine ?? null, k_type: k, source: "nextis_external" });
  }

  // 2) Paralelně ověř všechny vozy (s globálním budgetem)
  const results = await runConcurrent(targets, VEHICLE_CONCURRENCY, async (t) => {
    if (Date.now() - t0 > GLOBAL_BUDGET_MS) {
      return { ...t, skipped: true, reason: "budget_exceeded" };
    }
    const r = await callFn("jm-proxy", {
      action: "partsForEngine",
      payload: { engineID: t.k_type, brand: t.brand, model: t.model, engine: t.engine },
    });
    return {
      ...t,
      ok: r.ok,
      status: r.status,
      ms: r.ms,
      sectionsScanned: r.body?.debug?.sectionsScanned ?? null,
      sectionsHit: r.body?.debug?.sectionsHit ?? null,
      totalRawHits: r.body?.debug?.totalRawHits ?? null,
      categories: Array.isArray(r.body?.categories) ? r.body.categories.length : null,
      flow: r.body?.debug?.flow ?? null,
    };
  });

  // 3) Spuštění OEM ↔ J+M párování
  const matcher = await callFn("compat-matcher", { action: "match-all" }, 120_000);

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    vehiclesTotal: targets.length,
    vehiclesOk: results.filter((r: any) => r.ok).length,
    vehiclesEmpty: results.filter((r: any) => r.ok && (r.sectionsHit ?? 0) === 0).length,
    vehiclesFailed: results.filter((r: any) => !r.ok && !r.skipped).length,
    vehiclesSkipped: results.filter((r: any) => r.skipped).length,
    totalSections: results.reduce((s: number, r: any) => s + (r.sectionsHit || 0), 0),
    matcher: {
      ok: matcher.ok,
      status: matcher.status,
      ms: matcher.ms,
      summary: matcher.body?.summary ?? matcher.body?.result ?? null,
    },
    perVehicle: results,
  };

  // Audit do api_cache
  await supabase.from("api_cache").upsert({
    cache_key: `nightly_catalog_verify_${startedAt.slice(0, 10)}`,
    cache_type: "nightly_verify",
    data: summary,
    ttl_seconds: 60 * 60 * 24 * 14,
    created_at: new Date().toISOString(),
  } as any);

  // Notifikace pro adminy
  const status = summary.vehiclesEmpty === 0 && summary.vehiclesFailed === 0 ? "✅" : "⚠️";
  const title = `${status} Noční ověření katalogu (${summary.vehiclesTotal} vozů)`;
  const message = `OK: ${summary.vehiclesOk} · prázdné: ${summary.vehiclesEmpty} · chyby: ${summary.vehiclesFailed} · sekcí celkem: ${summary.totalSections}. Matcher: ${matcher.ok ? "OK" : "FAIL"}`;

  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (admins?.length) {
    await supabase.from("notifications").insert(
      admins.map((a: any) => ({ user_id: a.user_id, title, message }))
    );
  }

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
