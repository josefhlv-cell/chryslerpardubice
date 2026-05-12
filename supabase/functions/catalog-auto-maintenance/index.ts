// Catalog Auto-Maintenance — periodic 1:1 J+M & OEM verification.
// Steps (each step is bounded so we don't blow the 60s edge limit):
//   1) Backfill missing K-types (external_id) for nextis_vehicles via nextis-ktype-lookup
//   2) Kick jm-tree-build (idempotent)
//   3) Kick compat-matcher (match-all)
//   4) Run catalog-jm-audit and persist report
//   5) Mark all 0/NULL price parts as availability='on_order'
//   6) Optionally trigger price-sync if too many missing prices
//
// Designed to be called by pg_cron every night and on-demand by admin UI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callFn(name: string, body: unknown, timeoutMs = 45_000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify(body ?? {}),
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const params = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const KTYPE_LIMIT = Number(params.ktypeLimit ?? 15); // backfill at most N vehicles per run
  const SKIP_PRICE_SYNC = Boolean(params.skipPriceSync);

  const report: Record<string, unknown> = { startedAt };

  // ============ STEP 1: K-type backfill ============
  const { data: missing } = await supabase
    .from("nextis_vehicles")
    .select("id, brand, model, engine, year_from, year_to, external_id")
    .limit(500);

  // Filter: external_id is NULL OR non-numeric
  const candidates: any[] = [];
  for (const v of missing ?? []) {
    const ext = (v.external_id ?? "").toString().trim();
    if (ext && /^\d+$/.test(ext)) continue;
    candidates.push(v);
    if (candidates.length >= KTYPE_LIMIT) break;
  }
  const ktypeResults: any[] = [];
  for (const v of candidates) {
    const r = await callFn("jm-proxy", {
      action: "resolveKType",
      payload: {
        brand: v.brand,
        model: v.model,
        engine: v.engine || "",
        year: v.year_from || undefined,
      },
    }, 20_000);
    const data = r.body?.data ?? r.body;
    const k = Number(data?.k_type || 0);
    if (k > 0) {
      await supabase.from("nextis_vehicles")
        .update({ external_id: String(k) })
        .eq("id", v.id);
      ktypeResults.push({ vehicle: `${v.brand} ${v.model} ${v.engine}`, k_type: k, source: data?.source, ok: true });
    } else {
      ktypeResults.push({ vehicle: `${v.brand} ${v.model} ${v.engine}`, ok: false, error: data?.error || "no_match" });
    }
  }
  report.ktype_backfill = {
    attempted: candidates.length,
    success: ktypeResults.filter((x) => x.ok).length,
    details: ktypeResults,
  };

  // ============ STEP 2: Mark on_order ============
  const { error: onOrdErr, count: markedCount } = await supabase
    .from("parts_new")
    .update({ availability: "on_order" }, { count: "exact" })
    .or("price_with_vat.is.null,price_with_vat.lte.0")
    .neq("availability", "on_order");
  report.on_order_marked = { count: markedCount ?? 0, error: onOrdErr?.message };

  // ============ STEP 3: Trigger downstream (fire-and-forget short timeout) ============
  const treeBuild = await callFn("jm-tree-build", { action: "start" }, 8_000);
  const matcher = await callFn("compat-matcher", { action: "match-all" }, 8_000);
  report.tree_build_kick = { ok: treeBuild.ok, status: treeBuild.status };
  report.matcher_kick = { ok: matcher.ok, status: matcher.status };

  // ============ STEP 4: Run audit ============
  const audit = await callFn("catalog-jm-audit", { mode: "full" }, 30_000);
  report.audit = {
    ok: audit.ok,
    status: audit.status,
    summary: typeof audit.body === "object" ? (audit.body as any)?.summary ?? null : null,
  };

  // ============ STEP 5: Optional price sync trigger ============
  if (!SKIP_PRICE_SYNC) {
    const { count: missingPrices } = await supabase
      .from("parts_new")
      .select("*", { count: "exact", head: true })
      .or("price_with_vat.is.null,price_with_vat.lte.0");
    if ((missingPrices ?? 0) > 100) {
      const ps = await callFn("price-sync", { batchSize: 100, mode: "auto" }, 5_000);
      report.price_sync_kick = { missingPrices, ok: ps.ok, status: ps.status };
    } else {
      report.price_sync_kick = { missingPrices, skipped: true };
    }
  }

  // ============ Persist ============
  const finishedAt = new Date().toISOString();
  report.finishedAt = finishedAt;
  report.durationMs = Date.now() - t0;

  await supabase.from("api_cache").upsert({
    cache_key: `catalog_auto_maintenance_${startedAt.slice(0, 10)}`,
    cache_type: "auto_maintenance",
    data: report,
    ttl_seconds: 60 * 60 * 24 * 30,
    created_at: finishedAt,
  } as any, { onConflict: "cache_type,cache_key" } as any);

  return new Response(JSON.stringify(report, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
