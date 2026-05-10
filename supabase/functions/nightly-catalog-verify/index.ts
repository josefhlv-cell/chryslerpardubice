// Spouští se denně v 00:01 přes pg_cron.
// 1) Ověří engineId flow pro Chrysler 300C 5.7 HEMI (k_type 17958)
// 2) Spustí compat-matcher (match-all) pro propojení OEM <-> J+M

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callFn(name: string, body: unknown) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* keep text */ }
    return { ok: r.ok, status: r.status, ms: Date.now() - t0, body: json ?? text };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, body: String((e as Error).message) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const startedAt = new Date().toISOString();
  const log: any = { startedAt, steps: {} };

  // 1) Ověření engineId flow pro 300C 5.7 HEMI
  const verify = await callFn("jm-proxy", {
    action: "partsForEngine",
    payload: { engineID: 17958, brand: "Chrysler", model: "300C", engine: "5.7 HEMI" },
  });
  log.steps.verify_300c_hemi = {
    ok: verify.ok,
    status: verify.status,
    ms: verify.ms,
    sectionsScanned: verify.body?.debug?.sectionsScanned,
    sectionsHit: verify.body?.debug?.sectionsHit,
    totalRawHits: verify.body?.debug?.totalRawHits,
    flow: verify.body?.debug?.flow,
    k_type: verify.body?.debug?.k_type,
    categories: Array.isArray(verify.body?.categories) ? verify.body.categories.length : null,
  };

  // 2) Spuštění OEM ↔ J+M párování
  const matcher = await callFn("compat-matcher", { action: "match-all" });
  log.steps.compat_matcher = {
    ok: matcher.ok,
    status: matcher.status,
    ms: matcher.ms,
    summary: matcher.body?.summary ?? matcher.body?.result ?? null,
  };

  log.finishedAt = new Date().toISOString();

  // Uložit do api_cache jako audit log
  await supabase.from("api_cache").upsert({
    cache_key: `nightly_catalog_verify_${startedAt.slice(0, 10)}`,
    cache_value: log,
    ttl_seconds: 60 * 60 * 24 * 14,
    created_at: new Date().toISOString(),
  } as any);

  // Notifikace pro adminy
  const sectionsHit = log.steps.verify_300c_hemi.sectionsHit ?? 0;
  const status = sectionsHit >= 10 ? "✅" : "⚠️";
  const title = `${status} Noční ověření katalogu`;
  const message = `300C 5.7 HEMI: ${sectionsHit} sekcí (${log.steps.verify_300c_hemi.totalRawHits ?? 0} hitů). Matcher: ${matcher.ok ? "OK" : "FAIL"}`;

  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (admins?.length) {
    await supabase.from("notifications").insert(
      admins.map((a: any) => ({ user_id: a.user_id, title, message }))
    );
  }

  return new Response(JSON.stringify(log), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
