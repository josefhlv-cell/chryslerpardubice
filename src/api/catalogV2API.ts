/**
 * Catalog v2 API — Unified OEM-first catalog
 *
 * Sources: Mopar (OEM, rank 1) + J+M / Nextis (alternatives, rank 5).
 * SAG / AutoKelly explicitly excluded from v2 UI.
 *
 * Tree: catalog_categories (brand → model → engine → category, plus is_global nodes).
 * Listing: parts_new filtered by catalog_source IN ('mopar','jm') with vehicle compatibility.
 */

import { supabase } from "@/integrations/supabase/client";

// ---- Types ----
export type CategoryNode = {
  id: string;
  parent_id: string | null;
  slug: string;
  name_cs: string;
  name_en: string | null;
  node_type: string; // 'brand' | 'model' | 'engine' | 'category' | 'subcategory' | 'global'
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_engine: string | null;
  is_global: boolean | null;
  sort_order: number | null;
  children?: CategoryNode[];
};

export type CatalogPart = {
  id: string;
  oem_number: string;
  name: string;
  manufacturer: string | null;
  catalog_source: string; // 'mopar' | 'jm' | ...
  price_without_vat: number;
  price_with_vat: number;
  availability: string | null;
  image_urls: string[] | null;
  category: string | null;
  description: string | null;
  is_oem: boolean;
  badge_label: "ORIGINÁL" | "NÁHRADA" | "NEZNÁMÝ";
  rank: number; // 1 = OEM top, 5 = J+M
};

// ---- Allowed sources for v2 UI ----
// OEM-equivalent (rank 1): mopar, epc-ai, 7zap, epc-link, ai-epc
// Alternative (rank 5): jm
const ALLOWED_SOURCES = ["mopar", "epc-ai", "7zap", "epc-link", "ai-epc", "jm"] as const;

// ---- Brand whitelist (Phase 1 scope) ----
export const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"] as const;

// ---- Tree fetch & assembly ----
export async function fetchCategoryTree(): Promise<CategoryNode[]> {
  const { data, error } = await supabase
    .from("catalog_categories")
    .select(
      "id, parent_id, slug, name_cs, name_en, node_type, vehicle_brand, vehicle_model, vehicle_engine, is_global, sort_order"
    )
    .order("sort_order", { ascending: true })
    .order("name_cs", { ascending: true });

  if (error) throw new Error(error.message);
  const flat = (data || []) as CategoryNode[];

  // Build adjacency tree
  const byId = new Map<string, CategoryNode>();
  flat.forEach((n) => byId.set(n.id, { ...n, children: [] }));
  const roots: CategoryNode[] = [];
  byId.forEach((node) => {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

// ---- OEM-first ranking ----
function rankFor(source: string | null | undefined): number {
  const s = (source || "").toLowerCase();
  if (s === "mopar" || s === "mopar_oem") return 1;
  if (s === "epc-ai" || s === "ai-epc" || s === "7zap" || s === "epc-link") return 2; // OEM-equivalent
  if (s === "jm") return 5;
  if (s === "csv") return 6;
  return 9;
}

function badgeFor(source: string | null | undefined): CatalogPart["badge_label"] {
  const r = rankFor(source);
  if (r <= 2) return "ORIGINÁL";
  if (r >= 5 && r <= 6) return "NÁHRADA";
  return "NEZNÁMÝ";
}

function badgeFor(source: string | null | undefined): CatalogPart["badge_label"] {
  const r = rankFor(source);
  if (r === 1) return "ORIGINÁL";
  if (r >= 5 && r <= 6) return "NÁHRADA";
  return "NEZNÁMÝ";
}

function normalize(row: any): CatalogPart {
  const source = row.catalog_source || "mopar";
  const rank = rankFor(source);
  return {
    id: row.id,
    oem_number: row.oem_number,
    name: row.name,
    manufacturer: row.manufacturer,
    catalog_source: source,
    price_without_vat: Number(row.price_without_vat) || 0,
    price_with_vat: Number(row.price_with_vat) || 0,
    availability: row.availability,
    image_urls: row.image_urls,
    category: row.category,
    description: row.description,
    is_oem: rank <= 2,
    badge_label: badgeFor(source),
    rank,
  };
}

// ---- Listing query ----
export type ListingFilter = {
  brand?: string;
  model?: string;
  engine?: string;
  category?: string;
  search?: string; // OEM or name fragment
  page?: number;
  pageSize?: number;
};

export async function listParts(filter: ListingFilter): Promise<{ items: CatalogPart[]; total: number }> {
  const page = filter.page ?? 0;
  const pageSize = filter.pageSize ?? 30;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("parts_new")
    .select(
      "id, oem_number, name, manufacturer, catalog_source, price_without_vat, price_with_vat, availability, image_urls, category, description, compatible_vehicles",
      { count: "exact" }
    )
    .in("catalog_source", ALLOWED_SOURCES as unknown as string[]);

  // Brand / model / engine match against compatible_vehicles text or category text
  if (filter.brand) {
    q = q.ilike("compatible_vehicles", `%${filter.brand}%`);
  }
  if (filter.model) {
    q = q.ilike("compatible_vehicles", `%${filter.model}%`);
  }
  if (filter.category) {
    q = q.ilike("category", `%${filter.category}%`);
  }
  if (filter.search) {
    const term = filter.search.trim();
    q = q.or(`oem_number.ilike.%${term}%,name.ilike.%${term}%`);
  }

  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);

  const items = (data || []).map(normalize);
  // OEM-first sort within page
  items.sort((a, b) => a.rank - b.rank);

  return { items, total: count || 0 };
}

// ---- Helpers ----
export function brandsOnly(roots: CategoryNode[]): CategoryNode[] {
  return roots.filter((n) => n.node_type === "brand" && ALLOWED_BRANDS.includes((n.vehicle_brand || n.name_cs) as any));
}

export function globalsOnly(roots: CategoryNode[]): CategoryNode[] {
  return roots.filter((n) => n.is_global || n.node_type === "global");
}
