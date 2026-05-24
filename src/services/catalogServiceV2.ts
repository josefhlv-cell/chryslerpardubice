/**
 * Catalog Service V2 — čte přímo z `jm_category_tree_v2` + `jm_part_v2`.
 * 1:1 mirror J+M (Nextis): brand → model → engine → gen_art_name → díly.
 * Plochá hierarchie kategorií (tak jako J+M shop). Žádný roll-up do
 * globálních "kbelíků" — to dělá starý `catalogService.ts`.
 *
 * Použito pouze pokud je zapnutý feature flag `use_jm_tree_v2`.
 * Pokud pro daný vůz/motor v tabulce nejsou žádné kategorie, vrací prázdný
 * výsledek — `Catalog.tsx` v tom případě může fallbacknout na starý strom.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CatalogPart } from "@/api/catalogV2API";
import type { CategoryGroup } from "./catalogService";

type TreeRow = {
  id: string;
  brand: string;
  model: string;
  engine: string;
  k_type: number;
  gen_art_id: number;
  gen_art_name: string;
  part_count: number;
};

type PartRow = {
  id: string;
  node_id: string;
  oem_number: string;
  name: string | null;
  manufacturer: string | null;
  price_with_vat: number | null;
  price_without_vat: number | null;
  stock: number | null;
  availability: string | null;
  image_url: string | null;
};

function partRowToCatalog(row: PartRow): CatalogPart {
  const price = Number(row.price_with_vat) || 0;
  const stock = Number(row.stock) || 0;
  return {
    id: `jmv2-${row.id}`,
    oem_number: row.oem_number,
    name: row.name || row.oem_number,
    manufacturer: row.manufacturer || null,
    catalog_source: "jm",
    price_without_vat: row.price_without_vat ?? null,
    price_with_vat: price || null,
    availability: stock > 0 ? "in_stock" : price > 0 ? row.availability || "on_order" : "on_order",
    image_urls: row.image_url ? [row.image_url] : null,
    category: null,
    description: null,
    is_oem: false,
    badge_label: "NÁHRADA",
    rank: 5,
    final_price: price || null,
    markup_percent: 0,
    technical_parameters: null,
    compatible_vehicles: null,
    related_oem_number: null,
    oe_numbers: null,
    stock,
    tecdoc_section: null,
  };
}

/** Načte plochý seznam kategorií + dílů pro daný vůz z v2 stromu. */
export async function fetchAllPartsForEngineV2(opts: {
  brand: string;
  model: string;
  engine: string;
}): Promise<{ groups: CategoryGroup[]; totalParts: number; warning?: string; debug?: any } | null> {
  const { brand, model, engine } = opts;
  if (!brand || !model || !engine) return null;

  const { data: nodes, error: nodeErr } = await supabase
    .from("jm_category_tree_v2")
    .select("id, brand, model, engine, k_type, gen_art_id, gen_art_name, part_count")
    .eq("brand", brand)
    .eq("model", model)
    .eq("engine", engine)
    .order("gen_art_name", { ascending: true });

  if (nodeErr) {
    console.warn("[catalogServiceV2] node load failed:", nodeErr.message);
    return null;
  }
  const rows = (nodes || []) as TreeRow[];
  if (rows.length === 0) return null;

  const nodeIds = rows.map((r) => r.id);
  const { data: parts, error: partsErr } = await supabase
    .from("jm_part_v2")
    .select("id, node_id, oem_number, name, manufacturer, price_with_vat, price_without_vat, stock, availability, image_url")
    .in("node_id", nodeIds);

  if (partsErr) {
    console.warn("[catalogServiceV2] parts load failed:", partsErr.message);
    return null;
  }

  const byNode = new Map<string, PartRow[]>();
  for (const p of (parts || []) as PartRow[]) {
    const arr = byNode.get(p.node_id) || [];
    arr.push(p);
    byNode.set(p.node_id, arr);
  }

  const groups: CategoryGroup[] = rows.map((r) => {
    const items = (byNode.get(r.id) || []).map(partRowToCatalog);
    return {
      id: `jmv2:${r.gen_art_id}`,
      label: r.gen_art_name,
      count: items.length,
      parts: items,
    };
  }).filter((g) => g.count > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "cs"));

  const totalParts = groups.reduce((s, g) => s + g.count, 0);
  return {
    groups,
    totalParts,
    debug: { source: "jm_tree_v2", nodes: rows.length, k_type: rows[0]?.k_type ?? null },
  };
}
