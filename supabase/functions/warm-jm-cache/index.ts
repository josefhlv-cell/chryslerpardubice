// warm-jm-cache: iterate every nextis_vehicle (allowed brands) and call
// jm-proxy `partsForEngine` so the api_cache (jm_parts_for_engine) is filled.
// Self-invokes after each vehicle to stay under the 60s edge limit.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_ALLOWED = ["Chrysler", "Dodge", "RAM", "Lancia", "Cadillac"];
const PROGRESS_KEY = "warm_jm_progress";

async function getProgress(sb: any) {
  const { data } = await sb.from("api_cache").select("data")
    .eq("cache_type", "warm_jm").eq("cache_key", PROGRESS_KEY).maybeSingle();
  return data?.data || { offset: 0, total: 0, ok: 0, fail: 0, done: false, errors: [] as string[], started_at: null as string | null };
}
async function setProgress(sb: any, p: any) {
  await sb.from("api_cache").upsert({
    cache_type: "warm_jm", cache_key: PROGRESS_KEY, data: p, ttl_seconds: 86400 * 30,
  }, { onConflict: "cache_type,cache_key" });
}

async function callPartsForEngine(v: any): Promise<{ ok: boolean; count: number; err?: string; quotaExceeded?: boolean }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/jm-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({
        action: "partsForEngine",
        payload: { brand: v.brand, model: v.model, engine: v.engine || "", nextisVehicleId: v.id, year: v.year_from },
      }),
    });
    if (!r.ok) return { ok: false, count: 0, err: `HTTP ${r.status}` };
    const j = await r.json();
    if (!j?.success) return { ok: false, count: 0, err: j?.error || "no success" };
    const data = j.data || {};
    const items = data.items || [];
    // Detect upstream quota exhaustion (Nextis "Maximum calls per day exceeded")
    const warning = String(data.warning || "");
    const debug = data.debug || {};
    const failedSections: any[] = Array.isArray(debug.failedSections) ? debug.failedSections : [];
    const quotaHit = /denní limit|maximum calls per day|quota/i.test(warning)
      || debug.flow === "engineIdQuotaBlocked"
      || failedSections.some((s: any) => /maximum calls per day/i.test(String(s?.error || "")));
    return { ok: true, count: items.length, quotaExceeded: quotaHit };
  } catch (e) {
    return { ok: false, count: 0, err: String((e as Error).message).slice(0, 200) };
  }
}

function nextResetIso(): string {
  // Nextis daily quota resets at 00:00 UTC. Compute next reset.
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5, 0));
  return next.toISOString();
}

function selfInvoke() {
  fetch(`${SUPABASE_URL}/functions/v1/warm-jm-cache`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ action: "tick" }),
  }).catch((e) => console.error("[warm] self-invoke failed", e));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const body = await req.json().catch(() => ({}));
  const action = body.action || "start";

  if (action === "status") {
    const p = await getProgress(sb);
    return new Response(JSON.stringify({ success: true, progress: p }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (action === "start" || body.reset) {
    const brands = Array.isArray(body.brands) && body.brands.length > 0 ? body.brands : DEFAULT_ALLOWED;
    const { count } = await sb.from("nextis_vehicles")
      .select("*", { count: "exact", head: true }).in("brand", brands);
    const fresh = { offset: 0, total: count || 0, ok: 0, fail: 0, done: false, errors: [], started_at: new Date().toISOString(), brands };
    await setProgress(sb, fresh);
    selfInvoke();
    return new Response(JSON.stringify({ success: true, progress: fresh }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // tick: process up to 1 vehicle, then self-invoke
  const work = async () => {
    const p = await getProgress(sb);
    if (p.done) return;
    const brands = Array.isArray(p.brands) && p.brands.length > 0 ? p.brands : DEFAULT_ALLOWED;
    const { data: vehicles } = await sb.from("nextis_vehicles")
      .select("id, brand, model, engine, year_from")
      .in("brand", brands)
      .order("brand").order("model").order("engine")
      .range(p.offset, p.offset);
    const v = (vehicles || [])[0];
    if (!v) {
      await setProgress(sb, { ...p, done: true, finished_at: new Date().toISOString() });
      return;
    }
    const res = await callPartsForEngine(v);
    p.offset += 1;
    if (res.ok) p.ok += 1;
    else {
      p.fail += 1;
      p.errors = [...(p.errors || []), `${v.brand} ${v.model} ${v.engine || ""}: ${res.err}`].slice(-30);
    }
    if (p.offset >= p.total) p.done = true;
    await setProgress(sb, p);
    if (!p.done) selfInvoke();
  };
  // @ts-ignore
  EdgeRuntime.waitUntil(work());

  return new Response(JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
