// Catalog Diagnostic — admin background job
// POST { action: "start" } -> creates run, schedules background scan, returns run_id
// POST { action: "status", run_id } -> returns current run state + recent results
// POST { action: "cancel", run_id } -> marks run cancelled
// Job continues even after admin disconnects (EdgeRuntime.waitUntil).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"];

const CANONICAL_CATEGORIES = [
  "Brzdové zařízení",
  "Filtry",
  "Motor",
  "Převodovka",
  "Podvozek",
  "Tlumiče a pružiny",
  "Elektroinstalace",
  "Chlazení",
  "Palivový systém",
  "Výfukový systém",
  "Karoserie",
  "Interiér",
  "Osvětlení",
  "Klimatizace",
  "Rozvody",
  "Zapalování",
  "Spojka",
  "Řízení",
  "Náplně a maziva",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function runScan(runId: string) {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    // Load all combinations brand/model/engine
    const { data: vehicles, error: vErr } = await sb
      .from("nextis_vehicles")
      .select("brand, model, engine")
      .in("brand", ALLOWED_BRANDS);
    if (vErr) throw vErr;

    // Unique combinations
    const combosSet = new Set<string>();
    const combos: { brand: string; model: string; engine: string | null }[] = [];
    for (const v of vehicles || []) {
      const key = `${v.brand}|${v.model}|${v.engine || ""}`;
      if (!combosSet.has(key)) {
        combosSet.add(key);
        combos.push({ brand: v.brand, model: v.model, engine: v.engine || null });
      }
    }

    const totalCombinations = combos.length * (CANONICAL_CATEGORIES.length + 1); // +1 = "ALL"
    await sb.from("catalog_diagnostic_runs").update({
      total_combinations: totalCombinations,
      status: "running",
      current_step: `Načteno ${combos.length} kombinací vozidel`,
    }).eq("id", runId);

    let processed = 0;
    let totalParts = 0;
    let totalIssues = 0;

    for (const combo of combos) {
      // Cancellation check
      const { data: runRow } = await sb
        .from("catalog_diagnostic_runs").select("status").eq("id", runId).maybeSingle();
      if (runRow?.status === "cancelled") {
        console.log("[catalog-diagnostic] cancelled by admin");
        return;
      }

      // Fetch all parts for this vehicle (single query, then group by category)
      let q = sb.from("parts_new")
        .select("oem_number, name, category, price_with_vat, price_without_vat, compatible_vehicles")
        .ilike("compatible_vehicles", `%${combo.brand}%`)
        .ilike("compatible_vehicles", `%${combo.model}%`);
      if (combo.engine) q = q.ilike("compatible_vehicles", `%${combo.engine}%`);
      const { data: parts, error: pErr } = await q.limit(2000);

      if (pErr) {
        console.error("[catalog-diagnostic] parts query error", pErr);
        await sb.from("catalog_diagnostic_runs").update({
          last_error: pErr.message,
          processed_combinations: processed + (CANONICAL_CATEGORIES.length + 1),
        }).eq("id", runId);
        processed += CANONICAL_CATEGORIES.length + 1;
        continue;
      }

      const allParts = parts || [];
      totalParts += allParts.length;

      // ALL row
      const allResult = analyze(allParts, null);
      totalIssues += allResult.issues.length;
      await sb.from("catalog_diagnostic_results").insert({
        run_id: runId,
        brand: combo.brand,
        model: combo.model,
        engine: combo.engine,
        category: null,
        ...allResult.metrics,
        issues: allResult.issues,
        sample_oems: allResult.samples,
      });
      processed++;

      // Per category
      for (const cat of CANONICAL_CATEGORIES) {
        const catParts = allParts.filter((p) => (p.category || "").trim() === cat);
        const r = analyze(catParts, cat);
        totalIssues += r.issues.length;
        await sb.from("catalog_diagnostic_results").insert({
          run_id: runId,
          brand: combo.brand,
          model: combo.model,
          engine: combo.engine,
          category: cat,
          ...r.metrics,
          issues: r.issues,
          sample_oems: r.samples,
        });
        processed++;
      }

      // Heartbeat update every combo
      await sb.from("catalog_diagnostic_runs").update({
        processed_combinations: processed,
        total_parts_found: totalParts,
        issues_found: totalIssues,
        current_step: `${combo.brand} ${combo.model} ${combo.engine || ""} (${processed}/${totalCombinations})`,
      }).eq("id", runId);
    }

    await sb.from("catalog_diagnostic_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      current_step: "Dokončeno",
      processed_combinations: processed,
      total_parts_found: totalParts,
      issues_found: totalIssues,
    }).eq("id", runId);

    console.log(`[catalog-diagnostic] run ${runId} completed: ${processed} combos, ${totalParts} parts, ${totalIssues} issues`);
  } catch (err) {
    console.error("[catalog-diagnostic] fatal", err);
    await sb.from("catalog_diagnostic_runs").update({
      status: "failed",
      last_error: String((err as Error)?.message || err),
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
  }
}

function analyze(parts: any[], category: string | null) {
  const issues: any[] = [];
  const oemMap = new Map<string, number>();
  let missingNames = 0, missingPrices = 0, zeroPrice = 0, uncategorized = 0;

  for (const p of parts) {
    const oem = (p.oem_number || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (oem) oemMap.set(oem, (oemMap.get(oem) || 0) + 1);
    if (!p.name || p.name.trim().length < 3) missingNames++;
    const price = Number(p.price_with_vat || 0);
    if (price === 0 || p.price_with_vat == null) zeroPrice++;
    if (p.price_with_vat == null) missingPrices++;
    if (!p.category || !p.category.trim()) uncategorized++;
  }

  const duplicates = [...oemMap.values()].filter((v) => v > 1).length;
  const samples = parts.slice(0, 5).map((p) => ({
    oem: p.oem_number, name: p.name, category: p.category, price: p.price_with_vat,
  }));

  if (parts.length === 0 && category) {
    issues.push({ severity: "info", code: "EMPTY_CATEGORY", message: `Žádné díly v kategorii ${category}` });
  }
  if (missingNames > 0) issues.push({ severity: "warn", code: "MISSING_NAMES", count: missingNames });
  if (zeroPrice > 0) issues.push({ severity: "warn", code: "ZERO_PRICE", count: zeroPrice });
  if (duplicates > 0) issues.push({ severity: "warn", code: "DUPLICATES", count: duplicates });
  if (uncategorized > 0 && !category) issues.push({ severity: "info", code: "UNCATEGORIZED", count: uncategorized });

  return {
    metrics: {
      parts_count: parts.length,
      oem_unique_count: oemMap.size,
      duplicates_count: duplicates,
      missing_names_count: missingNames,
      missing_prices_count: missingPrices,
      zero_price_count: zeroPrice,
      uncategorized_count: uncategorized,
    },
    issues,
    samples,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const action = body?.action;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    if (action === "start") {
      // Reject if already running
      const { data: active } = await sb
        .from("catalog_diagnostic_runs")
        .select("id")
        .in("status", ["pending", "running"])
        .maybeSingle();
      if (active?.id) {
        return json({ success: true, run_id: active.id, reused: true });
      }
      const { data: run, error } = await sb
        .from("catalog_diagnostic_runs")
        .insert({ status: "pending", started_by: body?.user_id || null, current_step: "Inicializace…" })
        .select("id")
        .single();
      if (error) throw error;
      // Fire-and-forget background scan
      // @ts-ignore EdgeRuntime is available in Supabase functions
      EdgeRuntime.waitUntil(runScan(run.id));
      return json({ success: true, run_id: run.id });
    }

    if (action === "status") {
      const runId = body?.run_id;
      if (!runId) return json({ success: false, error: "run_id required" }, 400);
      const { data: run } = await sb.from("catalog_diagnostic_runs").select("*").eq("id", runId).maybeSingle();
      const { data: results } = await sb
        .from("catalog_diagnostic_results")
        .select("*")
        .eq("run_id", runId)
        .order("checked_at", { ascending: false })
        .limit(500);
      return json({ success: true, run, results: results || [] });
    }

    if (action === "cancel") {
      const runId = body?.run_id;
      if (!runId) return json({ success: false, error: "run_id required" }, 400);
      await sb.from("catalog_diagnostic_runs").update({
        status: "cancelled",
        finished_at: new Date().toISOString(),
        current_step: "Zrušeno administrátorem",
      }).eq("id", runId);
      return json({ success: true });
    }

    if (action === "latest") {
      const { data: run } = await sb
        .from("catalog_diagnostic_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ success: true, run });
    }

    return json({ success: false, error: "Unknown action", action }, 400);
  } catch (err) {
    return json({ success: false, error: String((err as Error)?.message || err) }, 500);
  }
});
