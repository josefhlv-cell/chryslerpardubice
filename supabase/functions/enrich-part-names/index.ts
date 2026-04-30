// enrich-part-names: pulls real part names from J+M for generic "Mopar XXX — Cat" rows.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 200, 500);

    const { data: bad } = await supabase
      .from("parts_new")
      .select("id, oem_number, name, category")
      .like("name", "Mopar %—%")
      .limit(limit);
    if (!bad?.length) return json({ success: true, updated: 0, remaining: 0 });

    let updated = 0; let failed = 0;
    for (const p of bad) {
      try {
        const { data: jm } = await supabase.functions.invoke("jm-proxy", {
          body: { action: "searchByCode", payload: { code: p.oem_number } },
        });
        const items = jm?.data?.items || [];
        // Pick the first item with a meaningful name and matching OEM
        const norm = (s: string) => (s || "").toUpperCase().replace(/[\s\-._/]/g, "");
        const target = norm(p.oem_number);
        const match = items.find((it: any) => norm(it.oem_number) === target) || items[0];
        if (match?.name && match.name.length > 4) {
          const newName = match.name;
          const newManuf = match.brand || null;
          await supabase.from("parts_new").update({
            name: newName,
            manufacturer: newManuf || undefined,
            updated_at: new Date().toISOString(),
          }).eq("id", p.id);
          updated++;
        } else {
          // Fallback: improve generic name to "Náhradní díl Mopar XXX (kategorie)"
          const better = `${p.category || "Díl"} Mopar — ${p.oem_number}`;
          await supabase.from("parts_new").update({ name: better }).eq("id", p.id);
          failed++;
        }
      } catch (_e) { failed++; }
    }

    const { count } = await supabase.from("parts_new").select("id", { head: true, count: "exact" }).like("name", "Mopar %—%");
    return json({ success: true, updated, failed, remaining: count ?? 0 });
  } catch (e) {
    return json({ success: false, error: String(e) }, 500);
  }
});

function json(o: any, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
