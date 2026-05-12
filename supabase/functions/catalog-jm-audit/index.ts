// catalog-jm-audit — verifies 1:1 parity between local catalog and J+M (Nextis).
// Produces per-vehicle and per-part report. Stored in api_cache for the UI to consume.
// Optional fix actions: reclassify, mark on_order, recompute compatibility for one vehicle.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REPORT_CACHE_KEY = "catalog_jm_audit_report";
const PROGRESS_CACHE_KEY = "catalog_jm_audit_progress";

const CANONICAL_CATEGORIES = [
  "Brzdový systém","Chlazení","Elektroinstalace","Filtry","Interiér","Karoserie",
  "Klimatizace","Motor","Odpružení","Osvětlení","Palivový systém","Převodovka",
  "Řízení","Údržba","Výfuk","Náplně a kapaliny","Pneumatiky a disky",
  "Příslušenství a nářadí","Náprava","Ostatní",
];

async function setCache(supabase: any, key: string, value: any, ttl = 3600) {
  await supabase.from("api_cache").upsert(
    { cache_key: key, cache_value: value, ttl_seconds: ttl, created_at: new Date().toISOString() },
    { onConflict: "cache_key" },
  );
}
async function getCache(supabase: any, key: string) {
  const { data } = await supabase.from("api_cache").select("cache_value").eq("cache_key", key).maybeSingle();
  return data?.cache_value || null;
}

async function runStructuralAudit(supabase: any) {
  const startedAt = new Date().toISOString();
  await setCache(supabase, PROGRESS_CACHE_KEY, { status: "running", phase: "summary", at: startedAt });

  // 1. Global counts
  const [{ count: totalParts }, { count: totalMapped }, { count: totalCompat },
         { count: totalVehicles }, { count: totalGlobals }, { count: totalCats },
         { count: totalSubs }, { count: priceMissing }] = await Promise.all([
    supabase.from("parts_new").select("*", { count: "exact", head: true }),
    supabase.from("catalog_part_categories").select("*", { count: "exact", head: true }).eq("is_primary", true),
    supabase.from("catalog_vehicle_compatibility").select("*", { count: "exact", head: true }),
    supabase.from("nextis_vehicles").select("*", { count: "exact", head: true }),
    supabase.from("catalog_categories").select("*", { count: "exact", head: true }).eq("node_type", "global"),
    supabase.from("catalog_categories").select("*", { count: "exact", head: true }).eq("node_type", "category"),
    supabase.from("catalog_categories").select("*", { count: "exact", head: true }).eq("node_type", "subcategory"),
    supabase.from("parts_new").select("*", { count: "exact", head: true }).or("price_with_vat.is.null,price_with_vat.lte.0"),
  ]);

  // 2. Per-vehicle stats
  await setCache(supabase, PROGRESS_CACHE_KEY, { status: "running", phase: "per-vehicle", at: new Date().toISOString() });
  const { data: vehicles } = await supabase
    .from("nextis_vehicles")
    .select("id, brand, model, engine, year_from, year_to, external_id")
    .order("brand").order("model");

  const perVehicle: any[] = [];
  for (const v of vehicles || []) {
    const { count: cParts } = await supabase
      .from("catalog_vehicle_compatibility")
      .select("*", { count: "exact", head: true })
      .eq("nextis_vehicle_id", v.id);
    const { count: cCats } = await supabase
      .from("catalog_categories")
      .select("*", { count: "exact", head: true })
      .eq("vehicle_brand", v.brand)
      .eq("vehicle_model", v.model)
      .eq("node_type", "category");
    const { count: cSubs } = await supabase
      .from("catalog_categories")
      .select("*", { count: "exact", head: true })
      .eq("vehicle_brand", v.brand)
      .eq("vehicle_model", v.model)
      .eq("node_type", "subcategory");
    const issues: string[] = [];
    if (!v.external_id) issues.push("Chybí Nextis K-type (external_id)");
    if ((cParts || 0) === 0) issues.push("Nemá žádné kompatibilní díly");
    if ((cCats || 0) === 0) issues.push("Chybí strom kategorií");
    perVehicle.push({
      id: v.id, brand: v.brand, model: v.model, engine: v.engine,
      year_from: v.year_from, year_to: v.year_to,
      external_id: v.external_id,
      parts: cParts || 0, categories: cCats || 0, subcategories: cSubs || 0,
      issues,
      ok: issues.length === 0,
    });
  }

  // 3. Part anomalies (sample)
  await setCache(supabase, PROGRESS_CACHE_KEY, { status: "running", phase: "parts", at: new Date().toISOString() });
  const { data: unmapped } = await supabase
    .from("parts_new")
    .select("id, oem_number, name, category, catalog_source")
    .not("id", "in",
      `(select part_id from catalog_part_categories where is_primary = true)`)
    .limit(100);

  const { data: noPriceList } = await supabase
    .from("parts_new")
    .select("id, oem_number, name, catalog_source, price_with_vat")
    .or("price_with_vat.is.null,price_with_vat.lte.0")
    .limit(100);

  const { data: noCompat } = await supabase
    .from("parts_new")
    .select("id, oem_number, name, catalog_source")
    .not("id", "in",
      `(select part_id from catalog_vehicle_compatibility where part_id is not null)`)
    .in("catalog_source", ["mopar", "mopar_oem", "csv", "epc-ai", "7zap", "epc-link"])
    .limit(100);

  const { data: nonCanonical } = await supabase
    .from("parts_new")
    .select("category")
    .not("category", "in", `(${CANONICAL_CATEGORIES.map(c => `"${c}"`).join(",")})`)
    .not("category", "is", null)
    .limit(500);
  const uniqueNonCanonical = Array.from(new Set((nonCanonical || []).map((r: any) => r.category)));

  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      totalParts: totalParts || 0,
      mappedParts: totalMapped || 0,
      classificationRate: totalParts ? Math.round(((totalMapped || 0) / totalParts) * 100) : 0,
      compatibilityLinks: totalCompat || 0,
      vehicles: totalVehicles || 0,
      vehiclesOk: perVehicle.filter(v => v.ok).length,
      vehiclesWithIssues: perVehicle.filter(v => !v.ok).length,
      categoryNodes: { globals: totalGlobals || 0, categories: totalCats || 0, subcategories: totalSubs || 0 },
      priceMissing: priceMissing || 0,
      unmappedParts: (unmapped || []).length,
      partsWithoutCompat: (noCompat || []).length,
      nonCanonicalCategories: uniqueNonCanonical.length,
    },
    perVehicle,
    samples: {
      unmapped: unmapped || [],
      noPrice: noPriceList || [],
      noCompat: noCompat || [],
      nonCanonicalCategories: uniqueNonCanonical,
    },
  };
  await setCache(supabase, REPORT_CACHE_KEY, report, 7 * 24 * 3600);
  await setCache(supabase, PROGRESS_CACHE_KEY, { status: "done", phase: "complete", at: new Date().toISOString() });
  return report;
}

async function applyFix(supabase: any, fix: string) {
  const out: any = { fix, ok: true };
  if (fix === "mark_on_order") {
    const { error, count } = await supabase
      .from("parts_new")
      .update({ availability: "on_order" })
      .or("price_with_vat.is.null,price_with_vat.lte.0")
      .neq("availability", "on_order")
      .select("*", { count: "exact", head: true });
    out.affected = count || 0;
    if (error) { out.ok = false; out.error = error.message; }
  } else if (fix === "reclassify") {
    const { data, error } = await supabase.functions.invoke("jm-classify-parts", { body: { action: "start" } });
    out.runId = data?.runId; out.message = "Klasifikace spuštěna";
    if (error) { out.ok = false; out.error = error.message; }
  } else if (fix === "rebuild_compat") {
    const { data, error } = await supabase.functions.invoke("compat-matcher", { body: { action: "match-all", limit: 100, onlyMissing: true } });
    out.message = data?.message || "Spárování spuštěno";
    if (error) { out.ok = false; out.error = error.message; }
  } else if (fix === "rebuild_tree") {
    const { data, error } = await supabase.functions.invoke("jm-tree-build", { body: { action: "start" } });
    out.message = "Build stromu spuštěn"; out.runId = data?.runId;
    if (error) { out.ok = false; out.error = error.message; }
  } else {
    out.ok = false; out.error = "Unknown fix";
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "report";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "progress") {
      const p = await getCache(supabase, PROGRESS_CACHE_KEY);
      return json({ ok: true, progress: p });
    }
    if (action === "report") {
      const r = await getCache(supabase, REPORT_CACHE_KEY);
      return json({ ok: true, report: r });
    }
    if (action === "run") {
      const progress = await getCache(supabase, PROGRESS_CACHE_KEY);
      if (progress?.status === "running") return json({ ok: true, queued: false, message: "Audit již běží" });
      // background
      const work = runStructuralAudit(supabase).catch(async (e) => {
        await setCache(supabase, PROGRESS_CACHE_KEY, { status: "failed", error: String(e?.message || e), at: new Date().toISOString() });
      });
      // @ts-ignore
      if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
        // @ts-ignore
        (EdgeRuntime as any).waitUntil(work);
      } else { await work; }
      return json({ ok: true, queued: true, message: "Audit spuštěn na pozadí" });
    }
    if (action === "fix") {
      const result = await applyFix(supabase, body.fix);
      return json(result);
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }

  function json(b: unknown, status = 200) {
    return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
