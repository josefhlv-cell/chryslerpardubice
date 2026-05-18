// Enrich OEM parts_new rows (jm_oem / mopar) with images, clean names and
// technical descriptions from the paired J+M item.
//
// RULES (per owner 2026-05-18):
//   - NEVER touches price.
//   - Always sets manufacturer = NULL on OEM rows (ORIGINÁL badge handles it).
//   - Cleans brand words (TRW, BOSCH, A.B.S., ...) from any name we keep.
//   - Never mentions "J+M" / "Nextis" / supplier anywhere.
//   - Appends position qualifiers (přední/zadní/levá/pravá/horní/dolní).
//   - Description = formatted technical_parameters (rozměry, parametry) — never
//     a raw aftermarket label.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface JmItem {
  oem_number?: string;
  image?: string;
  image_urls?: string[];
  category?: string;
  name?: string;
  description?: string;
  technical_parameters?: Record<string, string>;
  tecdoc_section?: { id?: number | string; label?: string };
  oe_numbers?: string[] | null;
  related_oem_number?: string;
  compatible_vehicles?: string[];
}

// Brand words and supplier mentions we strip from any name we keep.
const BRAND_BLOCKLIST = [
  "j\\+m", "jm autodily", "jm", "nextis",
  "mopar", "trw", "bosch", "a\\.b\\.s\\.", "abs", "starline", "ferodo",
  "brembo", "ate", "textar", "valeo", "sachs", "luk", "ngk", "denso",
  "mann", "mahle", "hengst", "knecht", "wix", "purflux", "blue\\s*print",
  "febi", "ruville", "bilstein", "monroe", "kyb", "lemf[öo]rder",
  "lemforder", "meyle", "swag", "triscan", "skf", "ina", "gates",
  "contitech", "dayco", "hella", "magneti\\s*marelli", "marelli",
  "lucas", "beru", "champion", "delphi", "filtron", "moog", "febest",
  "as[- ]?pl", "aspl", "raybestos", "cardone", "walker", "as pl",
  "standard motor products",
];

function stripBrand(input: string | null | undefined): string {
  if (!input) return "";
  let out = String(input);
  const re = new RegExp(`\\b(?:${BRAND_BLOCKLIST.join("|")})\\b`, "gi");
  out = out.replace(re, " ");
  // Drop trailing brand-style tokens like "(TRW)" leftovers
  out = out.replace(/\(\s*\)/g, " ");
  out = out.replace(/[–—-]\s*$/g, "");
  out = out.replace(/\s{2,}/g, " ").trim();
  // Title-case first char
  if (out.length > 0) out = out[0].toUpperCase() + out.slice(1);
  return out;
}

function extractPositions(...texts: (string | null | undefined)[]): string[] {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  const pos: string[] = [];
  if (/\b(p[řr]edn[ií]|front|vorne|vorderachse|vorder|na p[řr]edn[ií])\b/.test(t)) pos.push("přední");
  else if (/\b(zadn[ií]|rear|hinten|hinterachse|hinter|na zadn[ií])\b/.test(t)) pos.push("zadní");
  if (/\b(lev[áýé]|left|links|li\.)\b/.test(t)) pos.push("levá");
  else if (/\b(prav[áýé]|right|rechts|re\.)\b/.test(t)) pos.push("pravá");
  if (/\b(horn[ií]|upper|oben|above)\b/.test(t)) pos.push("horní");
  else if (/\b(doln[ií]|lower|unten|below)\b/.test(t)) pos.push("dolní");
  if (/\b(vnit[řr]n[ií]|inner|innen)\b/.test(t)) pos.push("vnitřní");
  else if (/\b(vn[ěe]j[šs][ií]|outer|aussen|außen)\b/.test(t)) pos.push("vnější");
  return pos;
}

function buildName(baseName: string | null | undefined, match: JmItem): string {
  // Prefer the gen-art / tecdoc label (clean, no brand) → fallback to existing name → match.name
  const candidates = [
    match.tecdoc_section?.label,
    match.category,
    baseName,
    match.name,
  ];
  let label = "";
  for (const c of candidates) {
    const cleaned = stripBrand(c);
    if (cleaned && cleaned.length >= 3) { label = cleaned; break; }
  }
  if (!label) label = stripBrand(baseName) || "Originální díl";

  const positions = extractPositions(match.name, match.description,
    JSON.stringify(match.technical_parameters || {}), baseName);
  // Don't duplicate position already present
  const lower = label.toLowerCase();
  const extra = positions.filter((p) => !lower.includes(p));
  return extra.length ? `${label} ${extra.join(" ")}`.replace(/\s{2,}/g, " ").trim() : label;
}

function buildDescription(match: JmItem): string | null {
  const params = match.technical_parameters || {};
  const lines: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (!v || String(v).trim() === "") continue;
    const key = stripBrand(k);
    const val = stripBrand(String(v));
    if (!key || !val) continue;
    lines.push(`${key}: ${val}`);
  }
  if (lines.length === 0) return null;
  return lines.join(" • ");
}

function pickImages(match: JmItem): string[] | null {
  const arr: string[] = [];
  if (Array.isArray(match.image_urls)) for (const u of match.image_urls) if (u) arr.push(u);
  if (match.image && !arr.includes(match.image)) arr.unshift(match.image);
  return arr.length ? arr.slice(0, 6) : null;
}

async function callJmProxy(action: string, payload: unknown): Promise<{ items: JmItem[] } | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/jm-proxy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.success) return null;
    return j.data as { items: JmItem[] };
  } catch (_e) { return null; }
}

const normalizeOem = (s: string) =>
  String(s || "").toUpperCase().replace(/[\s\-._/]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  const scope = url.searchParams.get("scope") || "missing";
  // Only enrich OEM-side rows; we never overwrite J+M aftermarket rows here.
  const sourceFilter = ["jm_oem", "mopar", "mopar_oem", "csv", "epc-link"];

  let q = sb
    .from("parts_new")
    .select("id, oem_number, image_urls, description, name, manufacturer, catalog_source")
    .in("catalog_source", sourceFilter)
    .order("last_enrich_attempt_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (scope !== "all") {
    q = q.or("image_urls.is.null,description.is.null,manufacturer.not.is.null");
  }

  const { data: parts, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let updated = 0, scanned = 0, noMatch = 0;
  const errors: string[] = [];
  const attemptedIds: string[] = [];

  // Build OEM variants for fallback lookups (same hierarchy as price-sync):
  //   1) original
  //   2) stripLeadingZeros
  //   3) K + stripLeadingZeros (Mopar prefix)
  //   4) original.replace(/^00K/, 'K')
  //   5) original.replace(/^K/, '')  (in case J+M index without K)
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

  for (const p of parts || []) {
    scanned++;
    attemptedIds.push(p.id as string);
    if (!p.oem_number) continue;

    // Try every variant until we get items back.
    let items: JmItem[] = [];
    let usedVariant = p.oem_number;
    for (const variant of oemVariants(p.oem_number)) {
      const r = await callJmProxy("searchByCode", { code: variant });
      if (r?.items?.length) { items = r.items; usedVariant = variant; break; }
    }
    if (!items.length) { noMatch++; continue; }

    const target = normalizeOem(p.oem_number);
    const targetVariant = normalizeOem(usedVariant);
    const match = items.find((it) => {
      const norm = normalizeOem(it.oem_number || "");
      if (norm === target || norm === targetVariant) return true;
      if (normalizeOem(it.related_oem_number || "") === target) return true;
      if (Array.isArray(it.oe_numbers) && it.oe_numbers.some((c) => normalizeOem(c) === target)) return true;
      return false;
    }) || items[0];

    const patch: Record<string, unknown> = {};

    // Image — always take from J+M if we don't have one. searchByCode does NOT
    // return images (Nextis API limitation), so fall back to partDetail which
    // scrapes eshop.jmautodily.cz for the gallery.
    const hasImg = Array.isArray(p.image_urls) && p.image_urls.length > 0;
    if (!hasImg) {
      let imgs = pickImages(match);
      if (!imgs || imgs.length === 0) {
        const det = await fetch(`${SUPABASE_URL}/functions/v1/jm-proxy`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "partDetail", payload: { code: match.oem_number || p.oem_number, brand: match.brand } }),
        }).then((r) => r.ok ? r.json() : null).catch(() => null);
        const detItem = det?.data?.item as JmItem | undefined;
        if (detItem) imgs = pickImages(detItem);
      }
      if (imgs && imgs.length) patch.image_urls = imgs;
    }

    // Name — always rebuild (strip brand, add position). Only write if it changes.
    const cleanName = buildName(p.name, match);
    if (cleanName && cleanName !== p.name) patch.name = cleanName;

    // Description — replace if empty or contains a brand word
    const hasBrandInDesc = p.description && /(\b(?:trw|bosch|a\.b\.s\.|abs|starline|ferodo|brembo|ate|textar|valeo|j\+m|nextis|mopar)\b)/i.test(p.description);
    if (!p.description || hasBrandInDesc) {
      const desc = buildDescription(match);
      if (desc) patch.description = desc;
    }

    // Manufacturer — OEM rows must never carry an aftermarket brand
    if (p.manufacturer !== null) patch.manufacturer = null;

    if (Object.keys(patch).length > 0) {
      const { error: uerr } = await sb.from("parts_new").update(patch).eq("id", p.id);
      if (uerr) errors.push(`${p.oem_number}: ${uerr.message}`);
      else updated++;
    }
  }

  if (attemptedIds.length) {
    await sb.from("parts_new")
      .update({ last_enrich_attempt_at: new Date().toISOString() })
      .in("id", attemptedIds);
  }

  await sb.from("catalog_event_log").insert({
    source: "enrich-from-jm",
    event: "batch_done",
    level: "info",
    message: `OEM enriched ${updated}/${scanned} (noMatch=${noMatch})`,
    details: { updated, scanned, noMatch, errors: errors.slice(0, 10) },
  });

  return new Response(
    JSON.stringify({ success: true, scanned, updated, noMatch, errors: errors.slice(0, 10) }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
