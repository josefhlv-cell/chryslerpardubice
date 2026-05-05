// Foto-enrichment pro díly bez fotek.
// Strategie (v pořadí):
//   1) HEAD check 7zap/Mopar CDN patterny
//   2) imagin.studio (pro známé brand+model+category)
//   3) Firecrawl Google Images search jako poslední fallback
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY") || "";

const URL_PATTERNS = (oem: string) => {
  const clean = oem.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return [
    `https://img.7zap.com/img/big/${clean}.jpg`,
    `https://img.7zap.com/img/big/${clean}.png`,
    `https://img.7zap.com/img/medium/${clean}.jpg`,
    `https://www.moparoemparts.com/images/dyn-images/parts/${clean}.jpg`,
    `https://parts.olathedcjr.com/images/parts/${clean}.jpg`,
    `https://www.factorychryslerparts.com/images/parts/${clean}.jpg`,
  ];
};

async function tryUrl(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(4000) });
    if (!r.ok) return false;
    const ct = r.headers.get("content-type") || "";
    const len = Number(r.headers.get("content-length") || 0);
    return ct.startsWith("image/") && len > 1500;
  } catch { return false; }
}

async function googleImageFallback(oem: string, name: string): Promise<string | null> {
  if (!FIRECRAWL_KEY) return null;
  try {
    const query = `${oem} ${name} autodíl`;
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 5, sources: ["images"] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const images = data?.data?.images || data?.images || [];
    for (const img of images) {
      const u = img?.imageUrl || img?.url;
      if (u && typeof u === "string" && /^https?:\/\//.test(u)) {
        if (await tryUrl(u)) return u;
      }
    }
  } catch { /* ignore */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 300);
  const useGoogle = url.searchParams.get("google") === "1";

  const { data: parts, error } = await sb
    .from("parts_new")
    .select("id, oem_number, name, image_urls, last_enrich_attempt_at")
    .or("image_urls.is.null,image_urls.eq.{}")
    .order("last_enrich_attempt_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let scanned = 0, found = 0, errors = 0, googleHits = 0;
  const ids: string[] = [];

  for (const p of parts || []) {
    scanned++;
    ids.push(p.id as string);
    if (!p.oem_number) continue;

    let hit: string | null = null;
    for (const u of URL_PATTERNS(String(p.oem_number))) {
      if (await tryUrl(u)) { hit = u; break; }
    }
    if (!hit && useGoogle) {
      hit = await googleImageFallback(String(p.oem_number), String(p.name || ""));
      if (hit) googleHits++;
    }
    if (hit) {
      const { error: uerr } = await sb.from("parts_new").update({ image_urls: [hit] }).eq("id", p.id);
      if (uerr) errors++; else found++;
    }
  }

  if (ids.length) {
    await sb.from("parts_new").update({ last_enrich_attempt_at: new Date().toISOString() }).in("id", ids);
  }

  await sb.from("catalog_event_log").insert({
    source: "enrich-photos-fallback",
    event: "batch_done",
    level: "info",
    message: `Foto enrich: ${found}/${scanned} (google: ${googleHits})`,
    details: { scanned, found, errors, googleHits, useGoogle },
  });

  return new Response(JSON.stringify({ success: true, scanned, found, errors, googleHits, remaining_after: null }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
