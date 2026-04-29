// jm-classify-parts (SAFE): deterministic category mapping into the J+M tree.
// Idempotent — only creates missing primary mappings and never changes prices.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAGE_SIZE = 1000;

const CATEGORY_TO_GLOBAL: Record<string, string> = {
  "Brzdové zařízení": "Brzdový systém",
  "Chlazení": "Chlazení",
  "Elektroinstalace": "Elektroinstalace",
  "Filtry": "Filtry",
  "Interiér": "Interiér",
  "Karoserie": "Karoserie",
  "Klimatizace": "Klimatizace",
  "Motor": "Motor",
  "Odpružení": "Odpružení",
  "Osvětlení": "Osvětlení",
  "Palivový systém": "Palivový systém",
  "Převodovka": "Převodovka",
  "Řízení": "Řízení",
  "Údržba": "Údržba",
  "Výfuk": "Výfuk",
  "Kapaliny a oleje": "Náplně a kapaliny",
  "Pneumatiky": "Pneumatiky a disky",
  "Příslušenství": "Příslušenství a nářadí",
  "Ostatní": "Ostatní",
};

const NAME_RULES: Array<{ global: string; keywords: string[] }> = [
  { global: "Brzdový systém", keywords: ["brzd", "brake", "brems", "desti", "kotou", "třmen", "trmen", "abs", "válec", "valec"] },
  { global: "Filtry", keywords: ["filtr", "filter"] },
  { global: "Chlazení", keywords: ["chlad", "chladi", "kuehl", "cool", "termostat", "vodní čerpad", "vodni cerpad", "wass"] },
  { global: "Elektroinstalace", keywords: ["altern", "start", "bater", "svíčk", "svick", "kabel", "svazek", "senzor", "sensor", "relé", "rele", "licht", "anlass"] },
  { global: "Výfuk", keywords: ["výfuk", "vyfuk", "exhaust", "katalyz", "lambda", "dpf"] },
  { global: "Převodovka", keywords: ["převod", "prevod", "spojk", "clutch", "getriebe", "kardan", "diferenc", "poloos"] },
  { global: "Odpružení", keywords: ["tlumi", "pruž", "pruz", "rameno", "silent", "stabil", "ložisk", "lozisk", "feder"] },
  { global: "Řízení", keywords: ["řízení", "rizeni", "servo", "volant", "tyč řízení", "tyc rizeni", "lenk"] },
  { global: "Osvětlení", keywords: ["svět", "svet", "lamp", "žárov", "zarov", "mlhov", "osvět", "osvet"] },
  { global: "Klimatizace", keywords: ["klimat", "kompresor", "kondenz", "výpar", "vypar", "topení", "topeni", "a/c"] },
  { global: "Palivový systém", keywords: ["paliv", "fuel", "vstřik", "vstrik", "injekt", "nádrž", "nadrz"] },
  { global: "Karoserie", keywords: ["karoser", "náraz", "naraz", "kapot", "dveř", "dver", "blatn", "zrc", "sklo", "maska"] },
  { global: "Interiér", keywords: ["sedadl", "interi", "palub", "airbag", "pás", "pas", "opěr", "oper"] },
  { global: "Náplně a kapaliny", keywords: ["olej", "kapalin", "fluid", "maziv", "aditiv"] },
  { global: "Pneumatiky a disky", keywords: ["pneu", "disk", "kolo", "tpms"] },
  { global: "Příslušenství a nářadí", keywords: ["příslu", "prislu", "nosič", "nosic", "tažn", "tazn", "nářad", "narad"] },
];

function normalizeText(value: string) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function inferGlobalName(part: any): string {
  const categoryTarget = CATEGORY_TO_GLOBAL[part.category || ""];
  const hay = normalizeText(`${part.name || ""} ${part.category || ""} ${part.oem_number || ""}`);
  for (const rule of NAME_RULES) {
    if (rule.keywords.some((kw) => hay.includes(normalizeText(kw)))) return rule.global;
  }
  return categoryTarget || "Ostatní";
}

async function fetchAllParts(supabase: any) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("parts_new")
      .select("id, oem_number, name, category")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "start";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "status") {
      const { data } = await supabase.from("jm_tree_sync_runs").select("*").eq("id", body.runId).single();
      return new Response(JSON.stringify({ success: true, run: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("jm_tree_sync_runs")
      .update({ status: "failed", last_error: "Superseded by safe deterministic classify", finished_at: new Date().toISOString() })
      .eq("status", "running")
      .eq("scope", "classify");

    const parts = await fetchAllParts(supabase);
    const toClassify = parts;

    const { data: globals, error: globalsError } = await supabase
      .from("catalog_categories")
      .select("id, name_cs")
      .eq("node_type", "global");
    if (globalsError) throw globalsError;
    const globalByName = new Map((globals || []).map((g: any) => [g.name_cs, g.id]));
    const fallbackId = globalByName.get("Ostatní") || globalByName.values().next().value;

    const { data: run, error: runError } = await supabase.from("jm_tree_sync_runs").insert({
      status: "running",
      scope: "classify",
      vehicles_total: parts.length,
      vehicles_done: 0,
      current_step: "Bezpečné pravidlové přemapování všech dílů…",
    }).select("*").single();
    if (runError) throw runError;

    const inserts = toClassify
      .map((p: any) => ({
        part_id: p.id,
        category_id: globalByName.get(inferGlobalName(p)) || fallbackId,
        is_primary: true,
      }))
      .filter((r: any) => !!r.category_id);

    let inserted = 0;
    for (let i = 0; i < inserts.length; i += PAGE_SIZE) {
      const batch = inserts.slice(i, i + PAGE_SIZE);
      const ids = batch.map((r: any) => r.part_id);
      const { error: deleteError } = await supabase.from("catalog_part_categories").delete().in("part_id", ids);
      if (deleteError) throw deleteError;
      const { error } = await supabase.from("catalog_part_categories").upsert(batch, { onConflict: "part_id,category_id" });
      if (error) throw error;
      inserted += batch.length;
      await supabase.from("jm_tree_sync_runs").update({
        vehicles_done: Math.min(parts.length, inserted),
        parts_classified: inserted,
        current_step: `${inserted}/${parts.length} dílů přemapováno`,
      }).eq("id", run.id);
    }

    const totalMapped = inserted;
    await supabase.from("jm_tree_sync_runs").update({
      status: "done",
      vehicles_done: parts.length,
      parts_classified: totalMapped,
      current_step: `Hotovo — ${totalMapped}/${parts.length} dílů zařazeno`,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);

    return new Response(JSON.stringify({ success: true, runId: run.id, total: parts.length, mapped: totalMapped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[jm-classify-parts] error:", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
