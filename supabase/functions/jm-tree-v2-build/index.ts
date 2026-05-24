// jm-tree-v2-build
// Builds the parallel J+M tree (1:1 mirror) in `jm_category_tree_v2` + `jm_part_v2`.
// Hierarchy: brand → model → engine (k_type) → gen_art_name (TecDoc category leaf).
// Does NOT touch catalog_categories / catalog_part_categories / prices / cart.
//
// Strategy: iterates `vehicle_engine_mappings` (vehicles with known TecDoc k_type),
// invokes the existing `jm-proxy:partsForEngine` action, then groups returned
// items by gen_art_id / gen_art_name and upserts them.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Mapping = {
  id: string;
  brand: string;
  model: string;
  engine: string;
  k_type: number;
};

type JmItem = {
  oem_number: string;
  name?: string;
  brand?: string;
  price_with_vat?: number;
  price_without_vat?: number;
  stock?: number;
  availability?: string;
  image?: string;
  gen_art_id?: number;
  gen_art_name?: string;
};

async function invokeJmProxy(payload: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/jm-proxy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json().catch(() => ({}));
    const scope: "single" | "all" = body.scope === "all" ? "all" : "single";
    const filterBrand = String(body.brand || "").trim();
    const filterModel = String(body.model || "").trim();
    const filterEngine = String(body.engine || "").trim();

    // Load mappings
    let q = supabase
      .from("vehicle_engine_mappings")
      .select("id, brand, model, engine, k_type")
      .not("k_type", "is", null);
    if (scope === "single") {
      if (filterBrand) q = q.eq("brand", filterBrand);
      if (filterModel) q = q.eq("model", filterModel);
      if (filterEngine) q = q.eq("engine", filterEngine);
    }
    const { data: mappings, error: mErr } = await q;
    if (mErr) throw mErr;
    if (!mappings || mappings.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "no mappings found", scope, filterBrand, filterModel, filterEngine }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const perVehicle: Array<Record<string, unknown>> = [];
    let totalNodes = 0;
    let totalParts = 0;

    for (const m of mappings as Mapping[]) {
      const t0 = Date.now();
      const proxyRes = await invokeJmProxy({
        action: "partsForEngine",
        payload: {
          brand: m.brand,
          model: m.model,
          engine: m.engine,
          engineID: m.k_type,
        },
      });

      if (!proxyRes.ok || !proxyRes.data?.success) {
        perVehicle.push({
          brand: m.brand, model: m.model, engine: m.engine, k_type: m.k_type,
          ok: false, error: proxyRes.data?.error || `HTTP ${proxyRes.status}`,
        });
        continue;
      }

      const items: JmItem[] = proxyRes.data?.data?.items || [];

      // Group items by gen_art_id (fallback to name when id missing)
      const groups = new Map<string, { id: number; name: string; items: JmItem[] }>();
      for (const it of items) {
        const gid = Number(it.gen_art_id || 0) || 0;
        const gname = String(it.gen_art_name || "").trim();
        if (!gname) continue; // skip items without a TecDoc category
        const key = `${gid}::${gname.toLowerCase()}`;
        if (!groups.has(key)) groups.set(key, { id: gid, name: gname, items: [] });
        groups.get(key)!.items.push(it);
      }

      // Wipe & rebuild nodes for this vehicle (clean slate per build)
      await supabase
        .from("jm_category_tree_v2")
        .delete()
        .eq("brand", m.brand)
        .eq("model", m.model)
        .eq("engine", m.engine);

      let vNodes = 0;
      let vParts = 0;
      for (const g of groups.values()) {
        const { data: nodeRow, error: nErr } = await supabase
          .from("jm_category_tree_v2")
          .insert({
            brand: m.brand,
            model: m.model,
            engine: m.engine,
            k_type: m.k_type,
            gen_art_id: g.id,
            gen_art_name: g.name,
            part_count: g.items.length,
            last_synced_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (nErr || !nodeRow) continue;
        vNodes++;

        // Insert parts in batches of 500
        const partRows = g.items.map((it) => ({
          node_id: nodeRow.id,
          oem_number: it.oem_number,
          name: it.name ?? null,
          manufacturer: it.brand ?? null,
          price_with_vat: it.price_with_vat ?? null,
          price_without_vat: it.price_without_vat ?? null,
          stock: it.stock ?? 0,
          availability: it.availability ?? null,
          image_url: it.image ?? null,
          raw: it as unknown,
        }));

        for (let i = 0; i < partRows.length; i += 500) {
          const chunk = partRows.slice(i, i + 500);
          const { error: pErr } = await supabase.from("jm_part_v2").upsert(chunk, {
            onConflict: "node_id,oem_number",
          });
          if (!pErr) vParts += chunk.length;
        }
      }

      totalNodes += vNodes;
      totalParts += vParts;
      perVehicle.push({
        brand: m.brand, model: m.model, engine: m.engine, k_type: m.k_type,
        ok: true,
        items_returned: items.length,
        groups: groups.size,
        nodes_created: vNodes,
        parts_inserted: vParts,
        ms: Date.now() - t0,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        scope,
        vehicles_processed: mappings.length,
        total_nodes: totalNodes,
        total_parts: totalParts,
        per_vehicle: perVehicle,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
