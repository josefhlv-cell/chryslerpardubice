// Enrich kitoem_parts using part_crossref → parts_new (aftermarket equivalents).
// No AI, no external HTTP. Pure DB lookup that copies image_urls / description
// (and uses parts_new.category as fallback "technical_params").
//
// POST /kitoem-enrich-from-crossref?limit=2000
// Returns { scanned, candidates, withCrossref, updated, withImage, withDesc, withTech, errors }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const norm = (s: string) =>
  String(s || "").toUpperCase().replace(/[\s\-._/]/g, "");

function variants(raw: string): string[] {
  const v = new Set<string>();
  const o = norm(raw);
  if (!o) return [];
  v.add(o);
  const stripped = o.replace(/^0+/, "");
  if (stripped) v.add(stripped);
  if (stripped && !stripped.startsWith("K")) v.add("K" + stripped);
  if (o.startsWith("K")) v.add(o.replace(/^K/, ""));
  v.add(o.replace(/^00K/, "K"));
  return [...v].filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "2000"), 5000);

  // 1) Pull batch of kitoem rows missing any of image/desc/tech
  const { data: parts, error } = await sb
    .from("kitoem_parts")
    .select("id, oem_number, image_urls, description, technical_params")
    .or("image_urls.is.null,description.is.null,technical_params.is.null")
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const scanned = parts?.length || 0;
  if (!scanned) {
    return new Response(JSON.stringify({ success: true, scanned: 0, updated: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 2) Load ALL crossref rows once into a Map<normOem, partNumbers[]>
  const crossMap = new Map<string, string[]>();
  {
    let from = 0;
    const page = 1000;
    while (true) {
      const { data, error: e } = await sb
        .from("part_crossref")
        .select("oem_number, part_number")
        .range(from, from + page - 1);
      if (e || !data || data.length === 0) break;
      for (const r of data) {
        const k = norm(r.oem_number || "");
        const pn = String(r.part_number || "").trim();
        if (!k || !pn) continue;
        const arr = crossMap.get(k) || [];
        arr.push(pn);
        crossMap.set(k, arr);
      }
      if (data.length < page) break;
      from += page;
    }
  }

  // 3) For each kitoem row, look up crossref by any variant, then fetch parts_new by those part_numbers
  let updated = 0, withCrossref = 0, withImage = 0, withDesc = 0, withTech = 0;
  const errors: string[] = [];

  // Batch unique part_numbers we need to fetch from parts_new
  const allNeeded = new Set<string>();
  const perRowPNs: Record<string, string[]> = {};
  for (const p of parts) {
    const pns: string[] = [];
    for (const v of variants(p.oem_number)) {
      const arr = crossMap.get(v);
      if (arr) pns.push(...arr);
    }
    const uniq = [...new Set(pns.map((x) => x.trim()).filter(Boolean))];
    if (uniq.length) {
      perRowPNs[p.id] = uniq;
      withCrossref++;
      for (const x of uniq) allNeeded.add(norm(x));
    }
  }

  // 4) Fetch parts_new rows where normalize_oem(oem_number) in allNeeded — chunked
  const pnInfo = new Map<string, { image_urls: string[] | null; description: string | null; category: string | null; name: string | null }>();
  const needed = [...allNeeded];
  for (let i = 0; i < needed.length; i += 200) {
    const chunk = needed.slice(i, i + 200);
    // Build OR filter on raw oem_number variants (normalized client-side after fetch)
    // Use IN-style: oem_number.in.(...). Supabase requires comma-separated quoted list.
    const inList = chunk.map((c) => `"${c}"`).join(",");
    // Try direct match on oem_number first
    const { data, error: e } = await sb
      .from("parts_new")
      .select("oem_number, image_urls, description, category, name")
      .or(`oem_number.in.(${inList}),internal_code.in.(${inList})`);
    if (e) { errors.push(`parts_new fetch: ${e.message}`); continue; }
    for (const r of data || []) {
      const k = norm(r.oem_number || "");
      const ik = norm((r as any).internal_code || "");
      const has = (s: string) => s && !pnInfo.has(s);
      const info = {
        image_urls: Array.isArray(r.image_urls) && r.image_urls.length ? r.image_urls : null,
        description: r.description || null,
        category: r.category || null,
        name: r.name || null,
      };
      if (has(k)) pnInfo.set(k, info);
      if (has(ik)) pnInfo.set(ik, info);
    }
  }

  // 5) Apply updates row by row
  for (const p of parts) {
    const pns = perRowPNs[p.id];
    if (!pns) continue;
    const hasImg = Array.isArray(p.image_urls) && p.image_urls.length > 0;
    const hasDesc = !!p.description;
    const hasTech = !!p.technical_params;
    if (hasImg && hasDesc && hasTech) continue;

    let imgs: string[] | null = null;
    let desc: string | null = null;
    let tech: Record<string, string> | null = null;

    for (const pn of pns) {
      const info = pnInfo.get(norm(pn));
      if (!info) continue;
      if (!hasImg && !imgs && info.image_urls) imgs = info.image_urls.slice(0, 6);
      if (!hasDesc && !desc && info.description) desc = info.description.slice(0, 800);
      if (!hasTech && !tech && (info.category || info.name)) {
        tech = {};
        if (info.category) tech["Kategorie"] = info.category;
        if (info.name) tech["Alternativa"] = info.name;
      }
      if ((hasImg || imgs) && (hasDesc || desc) && (hasTech || tech)) break;
    }

    const patch: Record<string, unknown> = {};
    if (imgs) patch.image_urls = imgs;
    if (desc) patch.description = desc;
    if (tech) patch.technical_params = tech;
    if (!Object.keys(patch).length) continue;

    patch.updated_at = new Date().toISOString();
    const { error: ue } = await sb.from("kitoem_parts").update(patch).eq("id", p.id);
    if (ue) { errors.push(`${p.oem_number}: ${ue.message}`); continue; }
    updated++;
    if (patch.image_urls) withImage++;
    if (patch.description) withDesc++;
    if (patch.technical_params) withTech++;
  }

  await sb.from("catalog_event_log").insert({
    source: "kitoem-enrich-from-crossref",
    event: "batch_done",
    level: "info",
    message: `crossref enrich ${updated}/${scanned} (xref=${withCrossref} img=${withImage} desc=${withDesc} tech=${withTech})`,
    details: { scanned, withCrossref, updated, withImage, withDesc, withTech, errors: errors.slice(0, 10) },
  });

  return new Response(
    JSON.stringify({
      success: true, scanned, candidates: scanned, withCrossref,
      updated, withImage, withDesc, withTech, errors: errors.slice(0, 10),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
