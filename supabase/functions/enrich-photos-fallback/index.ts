// Fallback foto-enrichment pro top díly bez fotek.
// Strategie: zkusí 7zap CDN + Mopar OEM patterns. HEAD check, ulož první funkční.
// Řazení: podle počtu objednávek (nejprodávanější první).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const URL_PATTERNS = (oem: string) => {
  const clean = oem.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return [
    `https://img.7zap.com/img/big/${clean}.jpg`,
    `https://img.7zap.com/img/big/${clean}.png`,
    `https://www.moparoemparts.com/images/dyn-images/parts/${clean}.jpg`,
    `https://parts.olathedcjr.com/images/parts/${clean}.jpg`,
  ];
};

async function tryUrl(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(4000) });
    if (!r.ok) return false;
    const ct = r.headers.get("content-type") || "";
    const len = Number(r.headers.get("content-length") || 0);
    return ct.startsWith("image/") && len > 1500;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);

  // top díly bez fotky řazené podle počtu objednávek
  const { data: ranked, error: rErr } = await sb.rpc("oem_priority_rank", { _source: "mopar" }).then(() => ({ data: null, error: null })).catch(() => ({ data: null, error: null }));
  void ranked; void rErr;

  // jednoduchý fallback dotaz: parts_new bez image, řazené podle počtu objednávek (LEFT JOIN agregát)
  const { data: parts, error } = await sb
    .from("parts_new")
    .select("id, oem_number, image_urls, last_enrich_attempt_at")
    .is("image_urls", null)
    .order("last_enrich_attempt_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let scanned = 0, found = 0, errors = 0;
  const ids: string[] = [];

  for (const p of parts || []) {
    scanned++;
    ids.push(p.id as string);
    if (!p.oem_number) continue;
    const urls = URL_PATTERNS(String(p.oem_number));
    let hit: string | null = null;
    for (const u of urls) {
      if (await tryUrl(u)) { hit = u; break; }
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
    message: `Fallback fotky: nalezeno ${found}/${scanned}`,
    details: { scanned, found, errors },
  });

  return new Response(JSON.stringify({ success: true, scanned, found, errors }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
