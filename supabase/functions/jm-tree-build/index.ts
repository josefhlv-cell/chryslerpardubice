// jm-tree-build: Generates a TecDoc/J+M-style 5-level catalog tree using Lovable AI.
// Tree levels:  Brand → Model (with code/years) → Engine → Category → Subcategory
// Persists into public.catalog_categories using parent_id self-reference.
// Idempotent: uses (parent_id, slug) unique key for upsert.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

// ---------- helpers ----------
function slugify(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function aiTreeForVehicle(args: {
  brand: string;
  model: string;
  engine: string | null;
  yearFrom: number | null;
  yearTo: number | null;
}) {
  const sys = `Jsi expert na náhradní díly amerických aut (Chrysler/Dodge/RAM/Lancia).
Vrať TecDoc/J+M kompatibilní strom kategorií pro DANÝ MOTOR.
- Hlavní kategorie: 12-18 reálných (Brzdové zařízení, Motor, Filtry, Chlazení, Odpružení, Řízení, Převodovka, Spojka, Elektroinstalace, Karoserie, Klimatizace, Palivový systém, Výfuk, Kola a pneumatiky, Interiér, Osvětlení, Kapaliny a oleje).
- Pod každou: 2-6 subkategorií (např. Brzdové zařízení → Brzdové destičky / Brzdové kotouče / Brzdové třmeny / Brzdové válce / ABS).
- Žádné položky bez relevance pro daný motor (např. nafta nemá benzínové vstřikovače).
- Názvy česky, formálně. Žádné duplicity.`;

  const usr = `Vozidlo: ${args.brand} ${args.model} ${args.engine ?? ""} ${
    args.yearFrom ? `(${args.yearFrom}-${args.yearTo ?? "?"})` : ""
  }
Vrať jen JSON tool call.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_tree",
          description: "Vrátí strom kategorií",
          parameters: {
            type: "object",
            properties: {
              categories: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    subcategories: { type: "array", items: { type: "string" } },
                  },
                  required: ["name", "subcategories"],
                },
              },
            },
            required: ["categories"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_tree" } },
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const args0 = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args0) throw new Error("No tool call returned");
  const parsed = JSON.parse(args0);
  return parsed.categories || [];
}

async function upsertNode(
  supabase: any,
  args: {
    parent_id: string | null;
    name: string;
    node_type: "brand" | "model" | "engine" | "category" | "subcategory";
    vehicle_brand?: string | null;
    vehicle_model?: string | null;
    vehicle_engine?: string | null;
    year_from?: number | null;
    year_to?: number | null;
    sort_order?: number;
  },
): Promise<string> {
  const slug = slugify(args.name);
  const row = {
    parent_id: args.parent_id,
    slug,
    name_cs: args.name,
    node_type: args.node_type,
    vehicle_brand: args.vehicle_brand ?? null,
    vehicle_model: args.vehicle_model ?? null,
    vehicle_engine: args.vehicle_engine ?? null,
    year_from: args.year_from ?? null,
    year_to: args.year_to ?? null,
    sort_order: args.sort_order ?? 0,
    source: "jm" as const,
  };

  // SELECT-then-INSERT to handle the (parent IS NULL) case which COALESCE index supports
  const parentClause = args.parent_id === null ? "is.null" : `eq.${args.parent_id}`;
  const { data: existing } = await supabase
    .from("catalog_categories")
    .select("id")
    .eq("slug", slug)
    .filter("parent_id", parentClause === "is.null" ? "is" : "eq", args.parent_id)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("catalog_categories").update(row).eq("id", existing.id);
    return existing.id;
  }
  const { data: inserted, error } = await supabase
    .from("catalog_categories")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return inserted.id;
}

async function processVehicle(supabase: any, vehicle: any, runId: string) {
  const brandId = await upsertNode(supabase, {
    parent_id: null,
    name: vehicle.brand,
    node_type: "brand",
    vehicle_brand: vehicle.brand,
  });

  const modelLabel = vehicle.year_from
    ? `${vehicle.model} (${vehicle.year_from}${vehicle.year_to ? `-${vehicle.year_to}` : "+"})`
    : vehicle.model;
  const modelId = await upsertNode(supabase, {
    parent_id: brandId,
    name: modelLabel,
    node_type: "model",
    vehicle_brand: vehicle.brand,
    vehicle_model: vehicle.model,
    year_from: vehicle.year_from,
    year_to: vehicle.year_to,
  });

  const engineLabel = vehicle.engine || "—";
  const engineId = await upsertNode(supabase, {
    parent_id: modelId,
    name: engineLabel,
    node_type: "engine",
    vehicle_brand: vehicle.brand,
    vehicle_model: vehicle.model,
    vehicle_engine: vehicle.engine,
    year_from: vehicle.year_from,
    year_to: vehicle.year_to,
  });

  const tree = await aiTreeForVehicle({
    brand: vehicle.brand,
    model: vehicle.model,
    engine: vehicle.engine,
    yearFrom: vehicle.year_from,
    yearTo: vehicle.year_to,
  });

  let created = 0;
  for (let i = 0; i < tree.length; i++) {
    const cat = tree[i];
    const catId = await upsertNode(supabase, {
      parent_id: engineId,
      name: cat.name,
      node_type: "category",
      vehicle_brand: vehicle.brand,
      vehicle_model: vehicle.model,
      vehicle_engine: vehicle.engine,
      sort_order: i,
    });
    created++;
    for (let j = 0; j < (cat.subcategories || []).length; j++) {
      await upsertNode(supabase, {
        parent_id: catId,
        name: cat.subcategories[j],
        node_type: "subcategory",
        vehicle_brand: vehicle.brand,
        vehicle_model: vehicle.model,
        vehicle_engine: vehicle.engine,
        sort_order: j,
      });
      created++;
    }
  }
  return created;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "start";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "status") {
      const runId = body.runId;
      const { data } = await supabase
        .from("jm_tree_sync_runs")
        .select("*")
        .eq("id", runId)
        .single();
      return new Response(JSON.stringify({ success: true, run: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Start a run
    const allowedBrands = ["Chrysler", "Dodge", "RAM", "Lancia"];
    const { data: vehicles } = await supabase
      .from("nextis_vehicles")
      .select("id, brand, model, engine, year_from, year_to")
      .in("brand", allowedBrands)
      .order("brand").order("model").order("engine");

    const list = vehicles || [];
    const { data: run } = await supabase
      .from("jm_tree_sync_runs")
      .insert({
        status: "running",
        scope: "all",
        vehicles_total: list.length,
        current_step: "Generuji strom (AI)…",
      })
      .select("*")
      .single();

    // background job
    const work = async () => {
      let done = 0;
      let created = 0;
      for (const v of list) {
        try {
          const c = await processVehicle(supabase, v, run.id);
          created += c;
        } catch (e) {
          console.error(`[jm-tree-build] vehicle ${v.brand} ${v.model}:`, e);
          await supabase
            .from("jm_tree_sync_runs")
            .update({ last_error: String(e).slice(0, 500) })
            .eq("id", run.id);
        }
        done++;
        if (done % 3 === 0 || done === list.length) {
          await supabase.from("jm_tree_sync_runs").update({
            vehicles_done: done,
            categories_created: created,
            current_step: `Vozidlo ${done}/${list.length}`,
          }).eq("id", run.id);
        }
      }
      await supabase.from("jm_tree_sync_runs").update({
        status: "done",
        vehicles_done: done,
        categories_created: created,
        current_step: "Hotovo",
        finished_at: new Date().toISOString(),
      }).eq("id", run.id);
    };

    // @ts-ignore EdgeRuntime is provided by Supabase
    EdgeRuntime.waitUntil(work());

    return new Response(
      JSON.stringify({ success: true, runId: run.id, total: list.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[jm-tree-build] error:", e);
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
