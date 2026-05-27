/**
 * Catalog Service V2 — čte přímo z `jm_category_tree_v2` + `jm_part_v2`.
 * 1:1 mirror J+M (Nextis): brand → model → engine → gen_art_name → díly.
 *
 * KITOEM injekce: pro každou kategorii dohledáme odpovídající záznamy
 * v `kitoem_parts` (match podle brand+model+engine+category ↔ gen_art_name)
 * a vložíme je na ZAČÁTEK seznamu jako ORIGINÁL ⭐.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CatalogPart } from "@/api/catalogV2API";
import type { CategoryGroup } from "./catalogService";
import { mapSectionToPath } from "./jmCategoryTaxonomy";

const stripDia = (s: string) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

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

type KitoemRow = {
  id: string;
  oem_number: string;
  name: string | null;
  description: string | null;
  category: string | null;
  image_urls: string[] | null;
  technical_params: Record<string, string> | null;
  price_with_vat: number | null;
  price_without_vat: number | null;
  jm_part_code: string | null;
};

function jmRowToCatalog(row: PartRow): CatalogPart {
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

function kitoemRowToCatalog(row: KitoemRow): CatalogPart {
  const price = Number(row.price_with_vat) || 0;
  return {
    id: `kitoem-${row.id}`,
    oem_number: row.oem_number,
    name: row.name || row.oem_number,
    manufacturer: "MOPAR / OEM",
    catalog_source: "mopar",
    price_without_vat: row.price_without_vat ?? null,
    price_with_vat: price || null,
    availability: price > 0 ? "in_stock" : "on_order",
    image_urls: Array.isArray(row.image_urls) && row.image_urls.length ? row.image_urls : null,
    category: row.category,
    description: row.description,
    is_oem: true,
    badge_label: "ORIGINÁL",
    rank: 1,
    final_price: price || null,
    markup_percent: 0,
    technical_parameters: row.technical_params || null,
    compatible_vehicles: null,
    related_oem_number: null,
    oe_numbers: null,
    stock: null,
    tecdoc_section: null,
  };
}

/** Načte plochý seznam kategorií + dílů pro daný vůz s KITOEM ORIGINÁL injekcí. */
export async function fetchAllPartsForEngineV2(opts: {
  brand: string;
  model: string;
  engine: string;
}): Promise<{ groups: CategoryGroup[]; totalParts: number; warning?: string; debug?: any } | null> {
  const { brand, model, engine } = opts;
  if (!brand || !model || !engine) return null;

  const [{ data: nodes, error: nodeErr }, { data: kitoem }] = await Promise.all([
    supabase
      .from("jm_category_tree_v2")
      .select("id, brand, model, engine, k_type, gen_art_id, gen_art_name, part_count")
      .eq("brand", brand)
      .eq("model", model)
      .eq("engine", engine)
      .order("gen_art_name", { ascending: true }),
    (supabase as any)
      .from("kitoem_parts")
      .select("id, oem_number, name, description, category, image_urls, technical_params, price_with_vat, price_without_vat, jm_part_code")
      .eq("brand", brand)
      .eq("model", model)
      .eq("engine", engine)
      .limit(5000),
  ]);

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

  // KITOEM podle kategorie (gen_art_name) — case insensitive normalizace.
  const norm = (s?: string | null) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const kitoemByCat = new Map<string, KitoemRow[]>();
  for (const k of ((kitoem || []) as KitoemRow[])) {
    const key = norm(k.category);
    if (!key) continue;
    const arr = kitoemByCat.get(key) || [];
    arr.push(k);
    kitoemByCat.set(key, arr);
  }

  let kitoemInjected = 0;
  const groups: CategoryGroup[] = rows.map((r) => {
    const jmItems = (byNode.get(r.id) || []).map(jmRowToCatalog);
    const matchingKitoem = kitoemByCat.get(norm(r.gen_art_name)) || [];
    // Deduplicate: pokud KITOEM OEM už je mezi J+M položkami, J+M položku
    // skryjeme — KITOEM (ORIGINÁL) má přednost.
    const kitoemOems = new Set(matchingKitoem.map((k) => k.oem_number.toUpperCase()));
    const filteredJm = jmItems.filter((j) => !kitoemOems.has(j.oem_number.toUpperCase()));
    const originals = matchingKitoem.map(kitoemRowToCatalog);
    kitoemInjected += originals.length;
    const items = [...originals, ...filteredJm];
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
    debug: { source: "jm_tree_v2+kitoem", nodes: rows.length, k_type: rows[0]?.k_type ?? null, kitoemInjected },
  };
}
