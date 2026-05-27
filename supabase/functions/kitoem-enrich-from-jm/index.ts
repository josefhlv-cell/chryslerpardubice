// Enrich kitoem_parts (originals) with images, descriptions and technical_params
// pulled from J+M (Nextis) via jm-proxy. Never touches price.
//
// POST /kitoem-enrich-from-jm?limit=500&scope=missing
//   scope = missing  → only rows missing image OR description OR technical_params
//   scope = all      → re-scan everything (use sparingly)
//
// Returns { scanned, updated, withImage, withDesc, withTech, noMatch, errors }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface JmItem {
  oem_number?: string;
  brand?: string;
  image?: string;
  image_urls?: string[];
  category?: string;
  name?: string;
  description?: string;
  technical_parameters?: Record<string, string>;
  tecdoc_section?: { id?: number | string; label?: string };
  oe_numbers?: string[] | null;
  related_oem_number?: string;
}

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
  } catch { return null; }
}

const normOem = (s: string) =>
  String(s || "").toUpperCase().replace(/[\s\-._/]/g, "");

function oemVariants(raw: string): string[] {
  const v = new Set<string>();
  const o = String(raw).trim().toUpperCase();
  v.add(o);
  const stripped = o.replace(/^0+/, "");
  if (stripped) v.add(stripped);
  if (stripped && !stripped.startsWith("K")) v.add("K" + stripped);
  v.add(o.replace(/^00K/, "K"));
  if (o.startsWith("K")) v.add(o.replace(/^K/, ""));
  return Array.from(v).filter(Boolean);
}

function pickImages(it: JmItem): string[] | null {
  const arr: string[] = [];
  if (Array.isArray(it.image_urls)) for (const u of it.image_urls) if (u) arr.push(u);
  if (it.image && !arr.includes(it.image)) arr.unshift(it.image);
  return arr.length ? arr.slice(0, 6) : null;
}

function buildDescription(it: JmItem): string | null {
  const params = it.technical_parameters || {};
  const lines: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (!v || String(v).trim() === "") continue;
    lines.push(`${k}: ${v}`);
  }
  if (lines.length) return lines.join(" • ");
  if (it.description) return String(it.description).slice(0, 800);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "500"), 500);
  const scope = url.searchParams.get("scope") || "missing";

  let q = sb
    .from("kitoem_parts")
    .select("id, oem_number, image_urls, description, technical_params, brand")
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (scope !== "all") {
    q = q.or("image_urls.is.null,description.is.null,technical_params.is.null");
  }

  const { data: parts, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let scanned = 0, updated = 0, noMatch = 0;
  let withImage = 0, withDesc = 0, withTech = 0;
  const errors: string[] = [];

  for (const p of parts || []) {
    scanned++;
    if (!p.oem_number) continue;

    let items: JmItem[] = [];
    let usedVariant = p.oem_number;
    for (const variant of oemVariants(p.oem_number)) {
      const r = await callJm("searchByCode", { code: variant });
      if (r?.items?.length) { items = r.items; usedVariant = variant; break; }
    }
    if (!items.length) { noMatch++; continue; }

    const target = normOem(p.oem_number);
    const tVar = normOem(usedVariant);
    let match = items.find((it) => {
      const n = normOem(it.oem_number || "");
      if (n === target || n === tVar) return true;
      if (normOem(it.related_oem_number || "") === target) return true;
      if (Array.isArray(it.oe_numbers) && it.oe_numbers.some((c) => normOem(c) === target)) return true;
      return false;
    }) || items[0];

    // Try partDetail for images if needed
    const hasImg = Array.isArray(p.image_urls) && p.image_urls.length > 0;
    let imgs: string[] | null = hasImg ? null : pickImages(match);
    if (!hasImg && (!imgs || imgs.length === 0)) {
      const det = await callJm("partDetail", { code: match.oem_number || p.oem_number, brand: match.brand });
      if (det?.item) {
        const di = det.item as JmItem;
        imgs = pickImages(di);
        if (!match.technical_parameters && di.technical_parameters) {
          match = { ...match, technical_parameters: di.technical_parameters };
        }
        if (!match.description && di.description) match = { ...match, description: di.description };
      }
    }

    const patch: Record<string, unknown> = {};
    if (!hasImg && imgs && imgs.length) patch.image_urls = imgs;
    if (!p.description) {
      const d = buildDescription(match);
      if (d) patch.description = d;
    }
    if (!p.technical_params && match.technical_parameters && Object.keys(match.technical_parameters).length) {
      patch.technical_params = match.technical_parameters;
    }

    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { error: uerr } = await sb.from("kitoem_parts").update(patch).eq("id", p.id);
      if (uerr) errors.push(`${p.oem_number}: ${uerr.message}`);
      else {
        updated++;
        if (patch.image_urls) withImage++;
        if (patch.description) withDesc++;
        if (patch.technical_params) withTech++;
      }
    } else {
      // Still bump updated_at so we don't keep re-scanning the same row
      await sb.from("kitoem_parts").update({ updated_at: new Date().toISOString() }).eq("id", p.id);
    }
  }

  await sb.from("catalog_event_log").insert({
    source: "kitoem-enrich-from-jm",
    event: "batch_done",
    level: "info",
    message: `KITOEM enriched ${updated}/${scanned} (img=${withImage} desc=${withDesc} tech=${withTech} noMatch=${noMatch})`,
    details: { scanned, updated, withImage, withDesc, withTech, noMatch, errors: errors.slice(0, 10) },
  });

  return new Response(
    JSON.stringify({ success: true, scanned, updated, withImage, withDesc, withTech, noMatch, errors: errors.slice(0, 10) }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
