// jm-classify-parts: AI classification of existing parts_new rows into the new
// J+M-style category tree (catalog_categories) via catalog_part_categories.
// Idempotent — only classifies parts that don't yet have a primary mapping.
// Async polling pattern: spawns background work, client polls jm_tree_sync_runs.

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

const BATCH_SIZE = 25;
const MAX_PARTS_PER_RUN = 500; // safety cap per invocation

async function classifyBatch(
  parts: Array<{ id: string; name: string; oem_number: string; category: string | null }>,
  categoryList: Array<{ id: string; path: string }>,
): Promise<Record<string, string | null>> {
  const sys = `Jsi katalogizační expert. Pro každý díl vyber NEJLEPŠÍ category_id z dodaného seznamu (subcategory > category > nic).
Vrať jen ty, kde jsi si JISTÝ. Pokud díl nepatří nikam, vrať null.`;

  const catText = categoryList
    .slice(0, 200)
    .map((c) => `${c.id} = ${c.path}`)
    .join("\n");

  const partsText = parts
    .map((p) => `${p.id} | OEM: ${p.oem_number} | ${p.name}${p.category ? ` | původní kategorie: ${p.category}` : ""}`)
    .join("\n");

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
        {
          role: "user",
          content: `KATEGORIE:\n${catText}\n\nDÍLY:\n${partsText}\n\nVrať tool call.`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "classify",
          parameters: {
            type: "object",
            properties: {
              mappings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    part_id: { type: "string" },
                    category_id: { type: "string" },
                  },
                  required: ["part_id", "category_id"],
                },
              },
            },
            required: ["mappings"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "classify" } },
    }),
  });

  if (!res.ok) {
    if (res.status === 429 || res.status === 402) {
      throw new Error(`AI rate limit (${res.status})`);
    }
    throw new Error(`AI ${res.status}`);
  }
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return {};
  const parsed = JSON.parse(args);
  const out: Record<string, string | null> = {};
  for (const m of parsed.mappings || []) out[m.part_id] = m.category_id;
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "start";
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

    // Build category lookup table (subcategory + category nodes only)
    const { data: cats } = await supabase
      .from("catalog_categories")
      .select("id, name_cs, parent_id, node_type, vehicle_brand, vehicle_model")
      .in("node_type", ["category", "subcategory"]);

    if (!cats || cats.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Strom kategorií je prázdný — spusť nejdřív jm-tree-build" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build human-readable path
    const byId = new Map(cats.map((c: any) => [c.id, c]));
    const catList = cats.map((c: any) => {
      const parts = [c.name_cs];
      let cur = c;
      while (cur.parent_id && byId.has(cur.parent_id)) {
        cur = byId.get(cur.parent_id);
        parts.unshift(cur.name_cs);
      }
      return { id: c.id, path: parts.join(" → ") };
    });

    // Get parts that don't have a primary catalog_part_category yet
    const { data: alreadyMapped } = await supabase
      .from("catalog_part_categories")
      .select("part_id")
      .eq("is_primary", true);
    const mappedSet = new Set((alreadyMapped || []).map((r: any) => r.part_id));

    const { data: parts } = await supabase
      .from("parts_new")
      .select("id, name, oem_number, category")
      .limit(MAX_PARTS_PER_RUN * 2);

    const toClassify = (parts || []).filter((p: any) => !mappedSet.has(p.id)).slice(0, MAX_PARTS_PER_RUN);

    const { data: run } = await supabase
      .from("jm_tree_sync_runs")
      .insert({
        status: "running",
        scope: "classify",
        vehicles_total: toClassify.length,
        current_step: "AI klasifikace dílů…",
      })
      .select("*")
      .single();

    const work = async () => {
      let classified = 0;
      let failed = 0;
      for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
        const batch = toClassify.slice(i, i + BATCH_SIZE);
        try {
          const mappings = await classifyBatch(batch as any, catList);
          const inserts = Object.entries(mappings)
            .filter(([_, catId]) => !!catId)
            .map(([partId, catId]) => ({
              part_id: partId,
              category_id: catId as string,
              is_primary: true,
            }));
          if (inserts.length > 0) {
            const { error } = await supabase
              .from("catalog_part_categories")
              .upsert(inserts, { onConflict: "part_id,category_id" });
            if (!error) classified += inserts.length;
          }
        } catch (e) {
          console.error(`[classify] batch ${i} failed:`, e);
          failed += batch.length;
          await supabase
            .from("jm_tree_sync_runs")
            .update({ last_error: String(e).slice(0, 500) })
            .eq("id", run.id);
          // back off on rate limit
          if (String(e).includes("rate limit")) await new Promise((r) => setTimeout(r, 5000));
        }
        await supabase.from("jm_tree_sync_runs").update({
          vehicles_done: Math.min(i + BATCH_SIZE, toClassify.length),
          parts_classified: classified,
          current_step: `${classified} klasifikováno (${failed} chyb)`,
        }).eq("id", run.id);
      }
      await supabase.from("jm_tree_sync_runs").update({
        status: "done",
        finished_at: new Date().toISOString(),
        current_step: `Hotovo — ${classified} dílů zařazeno`,
      }).eq("id", run.id);
    };

    // @ts-ignore
    EdgeRuntime.waitUntil(work());

    return new Response(
      JSON.stringify({ success: true, runId: run.id, total: toClassify.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[jm-classify-parts] error:", e);
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
