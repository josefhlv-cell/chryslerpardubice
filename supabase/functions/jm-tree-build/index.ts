// jm-tree-build (SAFE): deterministic TecDoc/J+M-like template + chunked inserts.
// No long AI calls here — this function must always finish and self-invoke reliably.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHUNK_SIZE = 12; // vehicles processed per invocation without AI/network waits

const DEFAULT_TREE = [
  { name: "Brzdové zařízení", subcategories: ["Brzdové destičky", "Brzdové kotouče", "Brzdové třmeny", "Brzdové hadice a trubky", "ABS senzory", "Parkovací brzda"] },
  { name: "Filtry", subcategories: ["Olejové filtry", "Vzduchové filtry", "Kabinové filtry", "Palivové filtry", "Filtry převodovky"] },
  { name: "Motor", subcategories: ["Těsnění motoru", "Rozvody", "Zapalování", "Sání motoru", "Mazání", "Uložení motoru", "Řemeny a kladky"] },
  { name: "Chlazení", subcategories: ["Chladiče", "Vodní čerpadla", "Termostaty", "Ventilátory chlazení", "Hadice chlazení", "Expanzní nádoby"] },
  { name: "Odpružení", subcategories: ["Tlumiče nárazů", "Pružiny", "Ramena náprav", "Silentbloky", "Stabilizátory", "Ložiska kol"] },
  { name: "Řízení", subcategories: ["Čepy řízení", "Tyče řízení", "Servořízení", "Hřeben řízení", "Volantové díly"] },
  { name: "Převodovka", subcategories: ["Automatická převodovka", "Manuální převodovka", "Diferenciál", "Poloosy", "Kardan", "Oleje převodovky"] },
  { name: "Spojka", subcategories: ["Spojkové sady", "Spojkový válec", "Spojkové ložisko", "Setrvačník"] },
  { name: "Elektroinstalace", subcategories: ["Alternátory", "Startéry", "Baterie", "Senzory", "Relé a pojistky", "Kabeláž"] },
  { name: "Karoserie", subcategories: ["Nárazníky", "Kapoty", "Blatníky", "Dveře", "Zrcátka", "Skla"] },
  { name: "Klimatizace", subcategories: ["Kompresory klimatizace", "Kondenzátory", "Výparníky", "Vysoušeče", "Hadice klimatizace", "Topení"] },
  { name: "Palivový systém", subcategories: ["Palivová čerpadla", "Vstřikovače", "Palivové nádrže", "Regulátory tlaku", "Palivové potrubí"] },
  { name: "Výfuk", subcategories: ["Tlumiče výfuku", "Katalyzátory", "Lambda sondy", "Výfukové potrubí", "DPF filtry"] },
  { name: "Osvětlení", subcategories: ["Světlomety", "Zadní světla", "Mlhovky", "Žárovky", "Směrovky"] },
  { name: "Interiér", subcategories: ["Sedadla", "Palubní deska", "Ovladače", "Bezpečnostní pásy", "Airbagy"] },
  { name: "Kapaliny a oleje", subcategories: ["Motorové oleje", "Převodové oleje", "Brzdové kapaliny", "Chladicí kapaliny", "Aditiva"] },
  { name: "Pneumatiky", subcategories: ["Pneumatiky", "Disky kol", "TPMS senzory", "Šrouby kol"] },
  { name: "Údržba", subcategories: ["Servisní sady", "Stěrače", "Čisticí prostředky", "Nářadí"] },
  { name: "Příslušenství", subcategories: ["Tažná zařízení", "Autokoberce", "Nosiče", "Doplňky"] },
  { name: "Ostatní", subcategories: ["Univerzální díly", "Spojovací materiál", "Nezařazené díly"] },
];

function slugify(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 80);
}

// Bulk-insert nodes for ONE vehicle's tree. Uses cached parent lookups + a single bulk insert per level.
async function buildVehicleTree(supabase: any, v: any, tree: any[]): Promise<number> {
  // Helper: get-or-create a single node, returns id
  async function getOrCreate(parentId: string | null, name: string, nodeType: string, extra: any = {}, sortOrder = 0): Promise<string> {
    const slug = slugify(name);
    let q = supabase.from("catalog_categories").select("id").eq("slug", slug);
    q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) return existing.id;
    const { data: ins, error } = await supabase.from("catalog_categories").insert({
      parent_id: parentId, slug, name_cs: name, node_type: nodeType,
      vehicle_brand: v.brand,
      vehicle_model: extra.model ?? null,
      vehicle_engine: extra.engine ?? null,
      year_from: extra.year_from ?? null,
      year_to: extra.year_to ?? null,
      sort_order: sortOrder, source: "jm",
    }).select("id").single();
    if (error) throw error;
    return ins.id;
  }

  // Brand → Model → Engine (3 sequential, but cheap)
  const brandId = await getOrCreate(null, v.brand, "brand");
  const modelLabel = v.year_from ? `${v.model} (${v.year_from}${v.year_to ? `-${v.year_to}` : "+"})` : v.model;
  const modelId = await getOrCreate(brandId, modelLabel, "model", { model: v.model, year_from: v.year_from, year_to: v.year_to });
  const engineLabel = v.engine || "—";
  const engineId = await getOrCreate(modelId, engineLabel, "engine", { model: v.model, engine: v.engine, year_from: v.year_from, year_to: v.year_to });

  // Pre-fetch all existing children of engine in ONE query
  const { data: existingCats } = await supabase
    .from("catalog_categories").select("id, slug").eq("parent_id", engineId);
  const existingCatMap = new Map((existingCats || []).map((c: any) => [c.slug, c.id]));

  // Build category rows to insert (skip those already existing)
  const catsToInsert: any[] = [];
  const catSlugToTreeIdx: string[] = [];
  for (let i = 0; i < tree.length; i++) {
    const slug = slugify(tree[i].name);
    if (!existingCatMap.has(slug) && !catSlugToTreeIdx.includes(slug)) {
      catsToInsert.push({
        parent_id: engineId, slug, name_cs: tree[i].name, node_type: "category",
        vehicle_brand: v.brand, vehicle_model: v.model, vehicle_engine: v.engine,
        sort_order: i, source: "jm",
      });
      catSlugToTreeIdx.push(slug);
    }
  }

  let created = 0;
  if (catsToInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("catalog_categories").insert(catsToInsert).select("id, slug");
    if (error) throw error;
    for (const r of inserted || []) existingCatMap.set(r.slug, r.id);
    created += (inserted || []).length;
  }

  // Pre-fetch existing subcats for all category parents at once
  const allCatIds = Array.from(existingCatMap.values());
  const { data: existingSubs } = await supabase
    .from("catalog_categories").select("id, slug, parent_id").in("parent_id", allCatIds);
  const existingSubKeys = new Set((existingSubs || []).map((s: any) => `${s.parent_id}|${s.slug}`));

  const subsToInsert: any[] = [];
  for (const cat of tree) {
    const catId = existingCatMap.get(slugify(cat.name));
    if (!catId) continue;
    for (let j = 0; j < (cat.subcategories || []).length; j++) {
      const subName = cat.subcategories[j];
      const subSlug = slugify(subName);
      const key = `${catId}|${subSlug}`;
      if (existingSubKeys.has(key)) continue;
      existingSubKeys.add(key);
      subsToInsert.push({
        parent_id: catId, slug: subSlug, name_cs: subName, node_type: "subcategory",
        vehicle_brand: v.brand, vehicle_model: v.model, vehicle_engine: v.engine,
        sort_order: j, source: "jm",
      });
    }
  }
  if (subsToInsert.length > 0) {
    const { error } = await supabase.from("catalog_categories").insert(subsToInsert);
    if (error) throw error;
    created += subsToInsert.length;
  }
  return created;
}

async function processVehicle(supabase: any, v: any): Promise<number> {
  return buildVehicleTree(supabase, v, DEFAULT_TREE);
}

function selfInvoke(runId: string) {
  fetch(`${SUPABASE_URL}/functions/v1/jm-tree-build`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ action: "chunk", runId }),
  }).catch((e) => console.error("[self-invoke] failed:", e));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "start";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "status") {
      const { data } = await supabase.from("jm_tree_sync_runs").select("*").eq("id", body.runId).single();
      return new Response(JSON.stringify({ success: true, run: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "chunk") {
      const runId = body.runId;
      const { data: run } = await supabase.from("jm_tree_sync_runs").select("*").eq("id", runId).single();
      if (!run || run.status !== "running") {
        return new Response(JSON.stringify({ success: true, stopped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const allowedBrands = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"];
      const { data: vehicles } = await supabase.from("nextis_vehicles")
        .select("id, brand, model, engine, year_from, year_to")
        .in("brand", allowedBrands)
        .order("brand").order("model").order("engine")
        .range(run.vehicles_done, run.vehicles_done + CHUNK_SIZE - 1);

      const list = vehicles || [];
      if (list.length === 0) {
        await supabase.from("jm_tree_sync_runs").update({
          status: "done", current_step: "Hotovo", finished_at: new Date().toISOString(),
        }).eq("id", runId);
        return new Response(JSON.stringify({ success: true, done: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const work = async () => {
        // Keep database writes bounded and deterministic; no AI calls, no rate limits.
        const results = await Promise.allSettled(list.map((v) => processVehicle(supabase, v)));
        let createdInChunk = 0;
        const errors: string[] = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.status === "fulfilled") createdInChunk += r.value;
          else errors.push(`${list[i].brand} ${list[i].model}: ${String(r.reason).slice(0, 100)}`);
        }
        const newDone = run.vehicles_done + list.length;
        const newCreated = run.categories_created + createdInChunk;
        await supabase.from("jm_tree_sync_runs").update({
          vehicles_done: newDone,
          categories_created: newCreated,
          current_step: `Vozidlo ${newDone}/${run.vehicles_total} — bezpečné dávkování`,
          last_error: errors.length > 0 ? errors.join(" | ").slice(0, 500) : run.last_error,
        }).eq("id", runId);

        if (newDone < run.vehicles_total) {
          selfInvoke(runId);
        } else {
          await supabase.from("jm_tree_sync_runs").update({
            status: "done", current_step: "Hotovo", finished_at: new Date().toISOString(),
          }).eq("id", runId);
        }
      };
      // @ts-ignore
      EdgeRuntime.waitUntil(work());

      return new Response(JSON.stringify({ success: true, processing: list.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // START
    await supabase.from("jm_tree_sync_runs")
      .update({ status: "failed", last_error: "Superseded", finished_at: new Date().toISOString() })
      .eq("status", "running");

    const allowedBrands = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"];
    const { count } = await supabase.from("nextis_vehicles")
      .select("*", { count: "exact", head: true }).in("brand", allowedBrands);
    const total = count || 0;

    const { count: existingCats } = await supabase.from("catalog_categories")
      .select("*", { count: "exact", head: true }).eq("source", "jm");

    const { data: run } = await supabase.from("jm_tree_sync_runs").insert({
      status: "running", scope: "all",
      vehicles_total: total, vehicles_done: 0,
      categories_created: existingCats || 0,
      current_step: "Spouštím bezpečné dávkování bez AI čekání…",
    }).select("*").single();

    selfInvoke(run.id);

    return new Response(JSON.stringify({ success: true, runId: run.id, total }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[jm-tree-build] error:", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
