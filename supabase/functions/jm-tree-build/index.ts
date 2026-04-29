// jm-tree-build: Generates a TecDoc/J+M-style 5-level catalog tree using Lovable AI.
// Tree levels:  Brand → Model (with code/years) → Engine → Category → Subcategory
// Persists into public.catalog_categories using parent_id self-reference.
// CHUNKED: each invocation processes CHUNK_SIZE vehicles, then self-invokes for the next chunk.
// This avoids Edge Function CPU time limits (~150s wall-clock, ~10s CPU).

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

const CHUNK_SIZE = 3; // vehicles per invocation — keep CPU usage low

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
- Pod každou: 2-6 subkategorií.
- Žádné položky bez relevance pro daný motor.
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

  let q = supabase.from("catalog_categories").select("id").eq("slug", slug);
  q = args.parent_id === null ? q.is("parent_id", null) : q.eq("parent_id", args.parent_id);
  const { data: existing } = await q.maybeSingle();

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

async function processVehicle(supabase: any, vehicle: any): Promise<number> {
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

async function selfInvoke(runId: string) {
  // Fire-and-forget POST to ourselves to process the next chunk
  fetch(`${SUPABASE_URL}/functions/v1/jm-tree-build`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
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
      const { data } = await supabase
        .from("jm_tree_sync_runs")
        .select("*")
        .eq("id", body.runId)
        .single();
      return new Response(JSON.stringify({ success: true, run: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- CHUNK: process next CHUNK_SIZE vehicles for an existing run ----------
    if (action === "chunk") {
      const runId = body.runId;
      const { data: run } = await supabase
        .from("jm_tree_sync_runs")
        .select("*")
        .eq("id", runId)
        .single();
      if (!run || run.status !== "running") {
        return new Response(JSON.stringify({ success: true, stopped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const allowedBrands = ["Chrysler", "Dodge", "RAM", "Lancia"];
      const { data: vehicles } = await supabase
        .from("nextis_vehicles")
        .select("id, brand, model, engine, year_from, year_to")
        .in("brand", allowedBrands)
        .order("brand").order("model").order("engine")
        .range(run.vehicles_done, run.vehicles_done + CHUNK_SIZE - 1);

      const list = vehicles || [];
      if (list.length === 0) {
        await supabase.from("jm_tree_sync_runs").update({
          status: "done",
          current_step: "Hotovo",
          finished_at: new Date().toISOString(),
        }).eq("id", runId);
        return new Response(JSON.stringify({ success: true, done: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Process this chunk in background, return immediately
      const work = async () => {
        let done = run.vehicles_done;
        let created = run.categories_created;
        for (const v of list) {
          try {
            created += await processVehicle(supabase, v);
          } catch (e) {
            console.error(`[chunk] vehicle ${v.brand} ${v.model}:`, e);
            await supabase
              .from("jm_tree_sync_runs")
              .update({ last_error: String(e).slice(0, 500) })
              .eq("id", runId);
          }
          done++;
          await supabase.from("jm_tree_sync_runs").update({
            vehicles_done: done,
            categories_created: created,
            current_step: `Vozidlo ${done}/${run.vehicles_total}`,
          }).eq("id", runId);
        }
        // Schedule next chunk
        if (done < run.vehicles_total) {
          await selfInvoke(runId);
        } else {
          await supabase.from("jm_tree_sync_runs").update({
            status: "done",
            current_step: "Hotovo",
            finished_at: new Date().toISOString(),
          }).eq("id", runId);
        }
      };
      // @ts-ignore
      EdgeRuntime.waitUntil(work());

      return new Response(JSON.stringify({ success: true, processing: list.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- START: create run, kick off first chunk ----------
    // Mark any stuck running run as failed first
    await supabase
      .from("jm_tree_sync_runs")
      .update({ status: "failed", last_error: "Superseded by new run", finished_at: new Date().toISOString() })
      .eq("status", "running");

    const allowedBrands = ["Chrysler", "Dodge", "RAM", "Lancia"];
    const { count } = await supabase
      .from("nextis_vehicles")
      .select("*", { count: "exact", head: true })
      .in("brand", allowedBrands);

    const total = count || 0;

    // If user wants to resume from existing tree, count existing categories
    const { count: existingCats } = await supabase
      .from("catalog_categories")
      .select("*", { count: "exact", head: true })
      .eq("source", "jm");

    const { data: run } = await supabase
      .from("jm_tree_sync_runs")
      .insert({
        status: "running",
        scope: "all",
        vehicles_total: total,
        vehicles_done: 0,
        categories_created: existingCats || 0,
        current_step: "Spouštím chunked sync…",
      })
      .select("*")
      .single();

    // kick off first chunk
    selfInvoke(run.id);

    return new Response(
      JSON.stringify({ success: true, runId: run.id, total }),
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
