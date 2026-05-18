// Compatibility Matcher — auto-link OEM parts to Nextis vehicles
// Strategy: exact OEM → supersession → crossref → fuzzy normalized match
// Fuzzy matches above threshold go to compatibility_match_queue for admin review.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function normalize(oem: string | null | undefined): string {
  return (oem || "").toUpperCase().replace(/[\s\-._/]/g, "");
}

const FUZZY_THRESHOLD = 85;
const AUTO_LINK_THRESHOLD = 95;

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  // Levenshtein distance ratio
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const dist = dp[m][n];
  const maxLen = Math.max(m, n);
  return Math.round((1 - dist / maxLen) * 100);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const action = body.action || "match-all";
    // Hard cap to prevent CPU limit (WORKER_RESOURCE_LIMIT). Heavy work runs in background.
    const limit = Math.min(body.limit || 25, 100);

    if (action === "match-part") {
      const { data: part } = await supabase
        .from("parts_new")
        .select("id, oem_number, catalog_source")
        .eq("id", body.part_id)
        .maybeSingle();
      if (part?.catalog_source === "jm_oem") {
        const result = await matchJmOemPart(supabase, part.id, part.oem_number);
        return json(result);
      }
      const result = await matchSinglePart(supabase, body.part_id);
      return json(result);
    }

    if (action === "match-jm-oem") {
      // Dedicated branch: jm_oem parts only — derives compat via jm-proxy.searchByCode
      const onlyMissing: boolean = body.onlyMissing !== false;
      let q = supabase
        .from("parts_new")
        .select("id, oem_number")
        .eq("catalog_source", "jm_oem")
        .limit(limit);
      const { data: parts, error } = await q;
      if (error) throw error;
      let scope = parts || [];
      if (onlyMissing && scope.length) {
        const ids = scope.map((p: any) => p.id);
        const { data: already } = await supabase
          .from("catalog_vehicle_compatibility")
          .select("part_id")
          .in("part_id", ids);
        const have = new Set((already || []).map((r: any) => r.part_id));
        scope = scope.filter((p: any) => !have.has(p.id));
      }
      const bgScope = scope.slice(0, limit);
      const work = (async () => {
        for (const p of bgScope) {
          try { await matchJmOemPart(supabase, p.id, p.oem_number); } catch (_) { /* swallow */ }
        }
      })();
      // @ts-ignore
      if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
        // @ts-ignore
        (EdgeRuntime as any).waitUntil(work);
      }
      return json({ ok: true, background: true, queued: bgScope.length, candidates: parts?.length || 0 });
    }

    if (action === "match-all") {
      // Optional scope filters
      const brand: string | undefined = body.brand;
      const model: string | undefined = body.model;
      const engine: string | undefined = body.engine;
      const category: string | undefined = body.category;
      const onlyMissing: boolean = body.onlyMissing !== false; // default true

      let q = supabase
        .from("parts_new")
        .select("id, oem_number, catalog_source, category, compatible_vehicles")
        .in("catalog_source", ["mopar", "mopar_oem", "csv", "epc-ai", "7zap", "epc-link", "ai-epc", "jm_oem"])
        .limit(limit);

      if (category) q = q.ilike("category", `%${category}%`);
      if (brand) q = q.ilike("compatible_vehicles", `%${brand}%`);
      if (model) q = q.ilike("compatible_vehicles", `%${model}%`);
      if (engine) q = q.ilike("compatible_vehicles", `%${engine}%`);

      const { data: parts, error } = await q;
      if (error) throw error;

      // If onlyMissing, drop parts already with at least one compatibility row
      let scope = parts || [];
      if (onlyMissing && scope.length) {
        const ids = scope.map((p: any) => p.id);
        const { data: already } = await supabase
          .from("catalog_vehicle_compatibility")
          .select("part_id")
          .in("part_id", ids);
        const have = new Set((already || []).map((r: any) => r.part_id));
        scope = scope.filter((p: any) => !have.has(p.id));
      }

      // Run heavy work in background to avoid CPU limit (WORKER_RESOURCE_LIMIT)
      const bgScope = scope.slice(0, limit);
      const work = (async () => {
        for (const p of bgScope) {
          try { await matchSinglePart(supabase, p.id); } catch (_) { /* swallow */ }
        }
      })();
      // @ts-ignore EdgeRuntime available in Supabase edge functions
      if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
        // @ts-ignore
        (EdgeRuntime as any).waitUntil(work);
      }
      return json({
        ok: true,
        background: true,
        scope: { brand, model, engine, category, onlyMissing },
        candidates: parts?.length || 0,
        queued_for_processing: bgScope.length,
        message: "Matching běží na pozadí. Výsledky se objeví v catalog_vehicle_compatibility během několika minut.",
      });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    const err = e as { message?: string };
    return json({ error: String(err?.message || e) }, 500);
  }

  function json(b: unknown, status = 200) {
    return new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function matchSinglePart(supabase: any, partId: string) {
  const result = { exact: 0, supersession: 0, crossref: 0, fuzzy: 0, queued: 0 };
  const { data: part } = await supabase
    .from("parts_new")
    .select("id, oem_number, catalog_source, compatible_vehicles")
    .eq("id", partId)
    .maybeSingle();
  if (!part) return result;

  const isOem = ["mopar", "mopar_oem", "csv", "epc-ai", "7zap", "epc-link"].includes(
    (part.catalog_source || "").toLowerCase()
  );

  const targetOems = new Set<string>([normalize(part.oem_number)]);

  // Pull supersessions
  const { data: superRows } = await supabase
    .from("part_supersessions")
    .select("old_oem_number, new_oem_number")
    .or(`old_oem_number.eq.${part.oem_number},new_oem_number.eq.${part.oem_number}`);
  for (const s of superRows || []) {
    targetOems.add(normalize(s.old_oem_number));
    targetOems.add(normalize(s.new_oem_number));
  }

  // Pull crossrefs
  const { data: crossRows } = await supabase
    .from("part_crossref")
    .select("oem_number, part_number, manufacturer")
    .eq("oem_number", part.oem_number);
  for (const c of crossRows || []) targetOems.add(normalize(c.part_number));

  // Find Nextis vehicles whose parts (in parts_new with catalog_source=jm and compatible_vehicles) reference these OEMs
  // Strategy: scan jm parts that share normalized OEM and inherit their compatibility links.
  const oemArr = Array.from(targetOems).filter(Boolean);
  if (oemArr.length === 0) return result;

  // 1) Exact match on parts_new(jm) by oem_number
  const { data: jmParts } = await supabase
    .from("parts_new")
    .select("id, oem_number, compatible_vehicles")
    .eq("catalog_source", "jm")
    .in("oem_number", [part.oem_number]);

  // Linked vehicles from jm part compat rows
  const jmIds = (jmParts || []).map((p: any) => p.id);
  if (jmIds.length > 0) {
    const { data: jmCompat } = await supabase
      .from("catalog_vehicle_compatibility")
      .select("nextis_vehicle_id")
      .in("part_id", jmIds)
      .not("nextis_vehicle_id", "is", null);

    const vehicleIds = Array.from(new Set((jmCompat || []).map((c: any) => c.nextis_vehicle_id))).filter(Boolean);
    for (const vid of vehicleIds) {
      const { error } = await supabase
        .from("catalog_vehicle_compatibility")
        .upsert(
          {
            part_id: part.id,
            nextis_vehicle_id: vid,
            brand: "auto",
            model: "auto",
            is_oem: isOem,
            match_method: "exact",
            match_confidence: 100,
            source: "manual",
          },
          { onConflict: "part_id,nextis_vehicle_id" }
        );
      if (!error) result.exact++;
    }
  }

  // 2) Fuzzy match — sample of jm parts, normalized comparison
  const targetSample = oemArr[0];
  const { data: candidates } = await supabase
    .from("parts_new")
    .select("id, oem_number")
    .eq("catalog_source", "jm")
    .ilike("oem_number", `%${targetSample.slice(0, 4)}%`)
    .limit(50);

  for (const cand of candidates || []) {
    const sim = similarity(normalize(cand.oem_number), targetSample);
    if (sim < FUZZY_THRESHOLD) continue;

    const { data: candCompat } = await supabase
      .from("catalog_vehicle_compatibility")
      .select("nextis_vehicle_id")
      .eq("part_id", cand.id)
      .not("nextis_vehicle_id", "is", null);

    for (const cc of candCompat || []) {
      if (sim >= AUTO_LINK_THRESHOLD) {
        await supabase.from("catalog_vehicle_compatibility").upsert(
          {
            part_id: part.id,
            nextis_vehicle_id: cc.nextis_vehicle_id,
            brand: "auto",
            model: "auto",
            is_oem: isOem,
            match_method: "fuzzy",
            match_confidence: sim,
            source: "manual",
          },
          { onConflict: "part_id,nextis_vehicle_id" }
        );
        result.fuzzy++;
      } else {
        await supabase.from("compatibility_match_queue").insert({
          part_id: part.id,
          nextis_vehicle_id: cc.nextis_vehicle_id,
          oem_number: part.oem_number,
          matched_oem: cand.oem_number,
          match_method: "fuzzy",
          match_confidence: sim,
        });
        result.queued++;
      }
    }
  }

  return result;
}

// ============= jm_oem branch =============
// For OEM parts: call jm-proxy.searchByCode to discover which J+M parts
// reference this OEM, parse vehicle brand prefixes from their oe_numbers,
// then upsert compat rows against every nextis_vehicles row of that brand.
// This makes OEMs visible in the catalog tree at brand level (model/engine
// filters in catalogV2API.listPartsForVehicle still apply via ilike).
const ALLOWED_BRAND_PREFIXES: Record<string, string> = {
  CHRYSLER: "Chrysler",
  DODGE: "Dodge",
  RAM: "RAM",
  LANCIA: "Lancia",
};

async function matchJmOemPart(supabase: any, partId: string, oem: string) {
  if (!oem) return { ok: false, reason: "no oem" };
  // Call jm-proxy.searchByCode
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/jm-proxy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "searchByCode", payload: { code: oem } }),
  }).catch(() => null);
  if (!resp || !resp.ok) return { ok: false, reason: "jm-proxy failed" };
  const json = await resp.json().catch(() => null);
  const items: any[] = json?.data?.items || [];
  if (items.length === 0) return { ok: false, reason: "no jm items" };

  // Collect brand prefixes from oe_numbers and from compatible_vehicles
  const brands = new Set<string>();
  for (const it of items) {
    for (const oeRaw of it.oe_numbers || []) {
      const m = String(oeRaw).match(/^([A-Z]+)\s*:/);
      if (m && ALLOWED_BRAND_PREFIXES[m[1]]) brands.add(ALLOWED_BRAND_PREFIXES[m[1]]);
    }
    for (const cv of it.compatible_vehicles || []) {
      const s = String(cv).toLowerCase();
      for (const [pfx, canon] of Object.entries(ALLOWED_BRAND_PREFIXES)) {
        if (s.includes(pfx.toLowerCase()) || s.includes(canon.toLowerCase())) brands.add(canon);
      }
    }
  }
  if (brands.size === 0) return { ok: false, reason: "no us brand" };

  // For each brand, fetch nextis_vehicles and upsert compat rows
  let inserted = 0;
  for (const b of brands) {
    const { data: vehicles } = await supabase
      .from("nextis_vehicles")
      .select("id, brand, model, engine, year_from, year_to")
      .eq("brand", b)
      .limit(500);
    for (const v of vehicles || []) {
      const { error } = await supabase
        .from("catalog_vehicle_compatibility")
        .upsert(
          {
            part_id: partId,
            nextis_vehicle_id: v.id,
            brand: v.brand,
            model: v.model,
            engine: v.engine,
            year_from: v.year_from,
            year_to: v.year_to,
            is_oem: true,
            match_method: "jm_searchByCode",
            match_confidence: 80,
            source: "manual",
          },
          { onConflict: "part_id,nextis_vehicle_id" }
        );
      if (!error) inserted++;
    }
  }
  return { ok: true, brands: [...brands], inserted };
}
