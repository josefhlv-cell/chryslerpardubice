// Backfill technical_parameters into jm_part_v2.raw via jm-proxy.partDetail,
// then propagate to kitoem_parts.technical_params by matching OEM numbers
// in jm_part_v2.raw->oe_numbers.
//
// POST /jm-tech-params-backfill?limit=100&offset=0&propagate=1
//   limit     — how many J+M rows to refetch this call (default 100, max 200)
//   offset    — pagination offset across J+M rows that have oe_numbers
//   propagate — when "1", also push technical_params into kitoem_parts after fetch
//
// Returns counts so the caller can iterate until done.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const normOem = (s: string) =>
  String(s || "").toUpperCase().replace(/[\s\-._/]/g, "");

async function callJm(action: string, payload: unknown): Promise<any> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/jm-proxy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, payload }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.success) return null;
    return j.data;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 200);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const propagate = url.searchParams.get("propagate") !== "0";
  const onlyMissing = url.searchParams.get("onlyMissing") !== "0";

  // Pull J+M rows that have oe_numbers in raw. Optionally skip those that
  // already have non-empty technical_parameters.
  let q = sb
    .from("jm_part_v2")
    .select("id, oem_number, name, raw")
    .not("raw->oe_numbers", "is", null)
    .order("oem_number", { ascending: true })
    .range(offset, offset + limit - 1);

  const { data: rows, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let scanned = 0, fetched = 0, withParams = 0, noParams = 0, skipped = 0;
  const errors: string[] = [];
  // Collect OEM keys whose technical_parameters changed, for downstream propagation.
  const refreshedOems: Array<{ id: string; oem: string; oe_numbers: string[]; params: Record<string, string> }> = [];

  for (const r of rows || []) {
    scanned++;
    const raw = (r.raw || {}) as Record<string, any>;
    const existing = raw.technical_parameters;
    const hasExisting =
      existing &&
      typeof existing === "object" &&
      Object.keys(existing).length > 0;

    if (onlyMissing && hasExisting) {
      skipped++;
      continue;
    }
    if (!r.oem_number) continue;

    const det = await callJm("partDetail", {
      code: r.oem_number,
      brand: raw.brand,
    });
    fetched++;
    const item = det?.item;
    const params = item?.technical_parameters;
    if (!params || typeof params !== "object" || Object.keys(params).length === 0) {
      noParams++;
      continue;
    }
    withParams++;

    const newRaw = { ...raw, technical_parameters: params };
    if (item?.image_urls && !raw.image_urls) newRaw.image_urls = item.image_urls;
    if (item?.description && !raw.description) newRaw.description = item.description;

    const { error: uerr } = await sb
      .from("jm_part_v2")
      .update({ raw: newRaw })
      .eq("id", r.id);
    if (uerr) {
      errors.push(`${r.oem_number}: ${uerr.message}`);
      continue;
    }

    const oeArr = Array.isArray(raw.oe_numbers)
      ? raw.oe_numbers.filter((x: unknown) => typeof x === "string")
      : [];
    refreshedOems.push({
      id: r.id,
      oem: r.oem_number,
      oe_numbers: oeArr,
      params,
    });
  }

  // Propagate technical_params to kitoem_parts by OEM match.
  let kitoemUpdated = 0;
  if (propagate && refreshedOems.length) {
    // Build target OEM list (normalized for matching). We match the unique
    // OE numbers that the freshly fetched J+M parts cross-reference.
    const targetSet = new Set<string>();
    const oemToParams = new Map<string, Record<string, string>>();
    for (const r of refreshedOems) {
      for (const oe of r.oe_numbers) {
        const n = normOem(oe);
        if (!n) continue;
        targetSet.add(n);
        if (!oemToParams.has(n)) oemToParams.set(n, r.params);
      }
      const own = normOem(r.oem);
      if (own) {
        targetSet.add(own);
        if (!oemToParams.has(own)) oemToParams.set(own, r.params);
      }
    }

    // Pull candidate kitoem rows that match any of these OEMs and lack params.
    // We fetch in batches of 200 to keep .in() reasonable.
    const targets = Array.from(targetSet);
    for (let i = 0; i < targets.length; i += 200) {
      const chunk = targets.slice(i, i + 200);
      const { data: kits } = await sb
        .from("kitoem_parts")
        .select("id, oem_number, technical_params")
        .is("technical_params", null)
        .in("oem_number", chunk);
      for (const k of kits || []) {
        const norm = normOem(k.oem_number);
        const params = oemToParams.get(norm);
        if (!params) continue;
        const { error: uerr } = await sb
          .from("kitoem_parts")
          .update({ technical_params: params, updated_at: new Date().toISOString() })
          .eq("id", k.id);
        if (uerr) errors.push(`kitoem ${k.oem_number}: ${uerr.message}`);
        else kitoemUpdated++;
      }
    }
  }

  await sb.from("catalog_event_log").insert({
    source: "jm-tech-params-backfill",
    event: "batch_done",
    level: "info",
    message: `JM detail fetched=${fetched} withParams=${withParams} → kitoem updated=${kitoemUpdated}`,
    details: {
      scanned, fetched, withParams, noParams, skipped,
      kitoemUpdated, offset, limit,
      errors: errors.slice(0, 10),
    },
  });

  return new Response(
    JSON.stringify({
      success: true,
      scanned, fetched, withParams, noParams, skipped,
      kitoemUpdated, offset, limit,
      nextOffset: offset + (rows?.length || 0),
      done: (rows?.length || 0) < limit,
      errors: errors.slice(0, 10),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
