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
  nextisVehicleId?: string; // drill-down by exact Nextis vehicle
  unmappedOnly?: boolean;   // "Universal / unmapped" section
  search?: string;          // OEM or name fragment
  page?: number;
  pageSize?: number;
};

export async function listParts(filter: ListingFilter): Promise<{ items: CatalogPart[]; total: number }> {
  const page = filter.page ?? 0;
  const pageSize = filter.pageSize ?? 30;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  // Vehicle drill-down via compatibility bridge
  let restrictPartIds: string[] | null = null;
  if (filter.nextisVehicleId) {
    const { data: links } = await supabase
      .from("catalog_vehicle_compatibility")
      .select("part_id, is_oem")
      .eq("nextis_vehicle_id", filter.nextisVehicleId);
    restrictPartIds = (links || []).map((l: any) => l.part_id);
    if (restrictPartIds.length === 0) return { items: [], total: 0 };
  } else if (filter.unmappedOnly) {
    // Parts WITHOUT any nextis_vehicle_id link
    const { data: linked } = await supabase
      .from("catalog_vehicle_compatibility")
      .select("part_id")
      .not("nextis_vehicle_id", "is", null)
      .limit(50000);
    const linkedSet = new Set((linked || []).map((l: any) => l.part_id));
    const { data: allParts } = await supabase
      .from("parts_new")
      .select("id")
      .in("catalog_source", ALLOWED_SOURCES as unknown as string[])
      .limit(50000);
    restrictPartIds = (allParts || []).map((p: any) => p.id).filter((id: string) => !linkedSet.has(id));
    if (restrictPartIds.length === 0) return { items: [], total: 0 };
  }

  let q = supabase
    .from("parts_new")
    .select(
      "id, oem_number, name, manufacturer, catalog_source, price_without_vat, price_with_vat, availability, image_urls, category, description, compatible_vehicles",
      { count: "exact" }
    )
    .in("catalog_source", ALLOWED_SOURCES as unknown as string[]);

  if (restrictPartIds) {
    // chunk to avoid URL size limits
    const slice = restrictPartIds.slice(0, 1000);
    q = q.in("id", slice);
  }

  // Fallback text filters when no vehicle selected
  if (!filter.nextisVehicleId) {
    if (filter.brand) q = q.ilike("compatible_vehicles", `%${filter.brand}%`);
    if (filter.model) q = q.ilike("compatible_vehicles", `%${filter.model}%`);
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
  // OEM-first sort within page (rank 1 = Mopar at top)
  items.sort((a, b) => a.rank - b.rank);

  return { items, total: count || 0 };
}

// ---- Nextis vehicle helpers ----
export type NextisVehicle = {
  id: string;
  brand: string;
  model: string;
  engine: string | null;
  year_from: number | null;
  year_to: number | null;
};

export async function fetchNextisVehicles(brand?: string, model?: string): Promise<NextisVehicle[]> {
  let q = supabase.from("nextis_vehicles").select("id, brand, model, engine, year_from, year_to");
  if (brand) q = q.ilike("brand", brand);
  if (model) q = q.ilike("model", model);
  const { data, error } = await q.order("model").order("engine");
  if (error) throw new Error(error.message);
  return (data || []) as NextisVehicle[];
}

// ---- Helpers ----
export function brandsOnly(roots: CategoryNode[]): CategoryNode[] {
  return roots.filter((n) => n.node_type === "brand" && ALLOWED_BRANDS.includes((n.vehicle_brand || n.name_cs) as any));
}

export function globalsOnly(roots: CategoryNode[]): CategoryNode[] {
  return roots.filter((n) => n.is_global || n.node_type === "global");
}

// ============================================================
// Dynamic drill-down derived from parts_new.compatible_vehicles
// (works even when nextis_vehicles / catalog_categories are empty)
// ============================================================

const PAGE = 1000;

async function fetchAllCompatible(filters: { brand?: string; model?: string; engine?: string }): Promise<string[]> {
  let q = supabase
    .from("parts_new")
    .select("compatible_vehicles", { count: "exact" })
    .in("catalog_source", ALLOWED_SOURCES as unknown as string[])
    .not("compatible_vehicles", "is", null);

  if (filters.brand) q = q.ilike("compatible_vehicles", `%${filters.brand}%`);
  if (filters.model) q = q.ilike("compatible_vehicles", `%${filters.model}%`);
  if (filters.engine) q = q.ilike("compatible_vehicles", `%${filters.engine}%`);

  const all: string[] = [];
  let from = 0;
  for (let i = 0; i < 30; i++) {
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const r of data) if (r.compatible_vehicles) all.push(r.compatible_vehicles as string);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// Heuristic engine token extractor: "3.6L V6", "5.7L HEMI", "2.0 CRD" ...
const ENGINE_RE = /(\d\.\d+\s*L?(?:\s*(?:V\d|HEMI|CRD|TDI|MultiAir|MultiJet|Turbo|Diesel|Hybrid))?)/i;

function extractEngine(s: string, brand: string, model: string): string | null {
  const after = s.replace(new RegExp(`^${brand}\\s+${model}`, "i"), "").trim();
  if (!after) return null;
  const m = after.match(ENGINE_RE);
  return m ? m[1].toUpperCase().replace(/\s+/g, " ").trim() : null;
}

export async function fetchBrands(): Promise<string[]> {
  return ALLOWED_BRANDS.slice() as string[];
}

export async function fetchModelsForBrand(brand: string): Promise<string[]> {
  const rows = await fetchAllCompatible({ brand });
  const set = new Set<string>();
  const re = new RegExp(`^${brand}\\s+([A-Za-z0-9-]+(?:\\s+[A-Za-z0-9-]+)?)`, "i");
  for (const s of rows) {
    const m = s.match(re);
    if (m) {
      // Drop trailing engine token from model if present
      const candidate = m[1].replace(ENGINE_RE, "").trim();
      if (candidate) set.add(candidate);
    }
  }
  return Array.from(set).sort();
}

export async function fetchEnginesForModel(brand: string, model: string): Promise<string[]> {
  const rows = await fetchAllCompatible({ brand, model });
  const set = new Set<string>();
  for (const s of rows) {
    const eng = extractEngine(s, brand, model);
    if (eng) set.add(eng);
  }
  // Always include "Vše" implicitly via UI
  return Array.from(set).sort();
}

// Normalize free-text categories ("Brzdy", "Brzdový systém", "Brakes" → "Brzdy")
const CATEGORY_NORMALIZATION: Array<{ match: RegExp; canonical: string; icon?: string }> = [
  { match: /brzd|brake/i, canonical: "Brzdy" },
  { match: /motor|engine/i, canonical: "Motor" },
  { match: /chla[dz]|cool/i, canonical: "Chlazení" },
  { match: /odpruž|suspen|tlumi/i, canonical: "Odpružení" },
  { match: /klimat|topen|a\/c|heat/i, canonical: "Klimatizace" },
  { match: /elektr/i, canonical: "Elektroinstalace" },
  { match: /filtr|filter/i, canonical: "Filtry" },
  { match: /palivo|fuel/i, canonical: "Palivový systém" },
  { match: /převod|transmission|gearbox/i, canonical: "Převodovka" },
  { match: /výfuk|exhaust/i, canonical: "Výfuk" },
  { match: /karos|body/i, canonical: "Karoserie" },
  { match: /interi/i, canonical: "Interiér" },
  { match: /kapalin|olej|oil|fluid|maziv/i, canonical: "Kapaliny a oleje" },
  { match: /pneu|kol[ao]|tire|wheel/i, canonical: "Kola a pneumatiky" },
  { match: /řízen|steer/i, canonical: "Řízení" },
];

export function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return "Ostatní";
  for (const r of CATEGORY_NORMALIZATION) if (r.match.test(raw)) return r.canonical;
  return raw.split("(")[0].trim();
}

export type CategoryTile = { canonical: string; count: number; rawSamples: string[] };

export async function fetchCategoriesForVehicle(brand: string, model: string, engine?: string): Promise<CategoryTile[]> {
  // Pull category column for matching parts
  let q = supabase
    .from("parts_new")
    .select("category, compatible_vehicles")
    .in("catalog_source", ALLOWED_SOURCES as unknown as string[])
    .ilike("compatible_vehicles", `%${brand}%`)
    .ilike("compatible_vehicles", `%${model}%`)
    .not("category", "is", null);
  if (engine) q = q.ilike("compatible_vehicles", `%${engine}%`);

  const all: { category: string | null; compatible_vehicles: string | null }[] = [];
  let from = 0;
  for (let i = 0; i < 30; i++) {
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as any));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const map = new Map<string, CategoryTile>();
  for (const r of all) {
    const canon = normalizeCategory(r.category);
    const t = map.get(canon) || { canonical: canon, count: 0, rawSamples: [] };
    t.count++;
    if (r.category && t.rawSamples.length < 5 && !t.rawSamples.includes(r.category)) t.rawSamples.push(r.category);
    map.set(canon, t);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// Listing parts by free-form vehicle text + canonical category
export async function listPartsForVehicle(opts: {
  brand: string;
  model: string;
  engine?: string;
  canonicalCategory?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: CatalogPart[]; total: number }> {
  const page = opts.page ?? 0;
  const pageSize = opts.pageSize ?? 30;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("parts_new")
    .select(
      "id, oem_number, name, manufacturer, catalog_source, price_without_vat, price_with_vat, availability, image_urls, category, description, compatible_vehicles",
      { count: "exact" }
    )
    .in("catalog_source", ALLOWED_SOURCES as unknown as string[])
    .ilike("compatible_vehicles", `%${opts.brand}%`)
    .ilike("compatible_vehicles", `%${opts.model}%`);

  if (opts.engine) q = q.ilike("compatible_vehicles", `%${opts.engine}%`);
  if (opts.search) {
    const t = opts.search.trim();
    q = q.or(`oem_number.ilike.%${t}%,name.ilike.%${t}%`);
  }

  // For canonical category, fetch wider then filter client-side (precise match)
  if (opts.canonicalCategory) {
    // Use a wider page to allow client filter
    const { data, error, count } = await q.range(0, 999);
    if (error) throw new Error(error.message);
    const filtered = (data || []).filter((r: any) => normalizeCategory(r.category) === opts.canonicalCategory);
    const slice = filtered.slice(from, to + 1);
    const items = slice.map(normalize).sort((a, b) => a.rank - b.rank);
    return { items, total: filtered.length };
  }

  q = q.range(from, to);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  const items = (data || []).map(normalize).sort((a, b) => a.rank - b.rank);
  return { items, total: count || 0 };
}

// ============================================================
// LIVE J+M (Nextis) overlay — calls jm-proxy and converts the
// response into CatalogPart so it can be merged into the listing.
// ============================================================

type JmRawItem = {
  oem_number?: string;
  brand?: string;
  name?: string;
  price_without_vat?: number;
  price_with_vat?: number;
  stock?: number;
  availability?: string;
  image?: string;
  category?: string;
};

function jmToCatalogPart(it: JmRawItem): CatalogPart {
  const price_without_vat = Number(it.price_without_vat) || 0;
  const price_with_vat =
    Number(it.price_with_vat) || Math.round(price_without_vat * 1.21 * 100) / 100;
  return {
    id: `jm:${it.oem_number || crypto.randomUUID()}`,
    oem_number: String(it.oem_number || "").trim(),
    name: String(it.name || "").trim() || it.oem_number || "—",
    manufacturer: it.brand || "J+M",
    catalog_source: "jm",
    price_without_vat,
    price_with_vat,
    availability: it.availability || (Number(it.stock) > 0 ? "in_stock" : "on_order"),
    image_urls: it.image ? [it.image] : null,
    category: it.category || null,
    description: null,
    is_oem: false,
    badge_label: "NÁHRADA",
    rank: 5,
  };
}

/** Live search of J+M offer for a specific vehicle. Returns [] on any failure. */
export async function fetchJmForVehicle(opts: {
  brand: string;
  model: string;
  year?: number;
}): Promise<CatalogPart[]> {
  try {
    const { data, error } = await supabase.functions.invoke("jm-proxy", {
      body: {
        action: "searchByVehicle",
        payload: { brand: opts.brand, model: opts.model, year: opts.year },
      },
    });
    if (error || !data?.success) return [];
    const items: JmRawItem[] = data.data?.items || [];
    return items.map(jmToCatalogPart).filter((p) => p.oem_number);
  } catch {
    return [];
  }
}

/** Live search of J+M by OEM / item code. */
export async function fetchJmByCode(code: string): Promise<CatalogPart[]> {
  return fetchJmByCodes([code]);
}

/** Live J+M stock/price lookup for visible OEM codes. Throws on failure for visibility. */
export async function fetchJmByCodes(codes: string[]): Promise<CatalogPart[]> {
  const uniqueCodes = [...new Set(codes.map((c) => c.trim()).filter(Boolean))].slice(0, 50);
  if (uniqueCodes.length === 0) return [];

  const { data, error } = await supabase.functions.invoke("jm-proxy", {
    body: { action: "priceAndStock", payload: { codes: uniqueCodes } },
  });
  if (error) {
    console.error("[fetchJmByCodes] invoke error:", error);
    throw new Error(`J+M API: ${error.message || "invoke failed"}`);
  }
  if (!data?.success) {
    console.error("[fetchJmByCodes] API error:", data);
    throw new Error(`J+M API: ${data?.error || "request failed"}`);
  }
  const items: JmRawItem[] = data.data?.items || [];
  console.log(`[fetchJmByCodes] received ${items.length} items, enrichedInDb=${data.data?.enrichedInDb}`);
  return items.map(jmToCatalogPart).filter((p) => p.oem_number);
}

/** Merge OEM (Mopar/EPC) listing with live J+M results. Mopar always on top; J+M shown as NÁHRADA below. */
export function mergeWithJm(base: CatalogPart[], jm: CatalogPart[]): CatalogPart[] {
  // Dedup J+M by oem+manufacturer (avoid duplicate aftermarket lines)
  const seenJm = new Set<string>();
  const visibleJm = jm.filter((p) => {
    const key = `${p.oem_number}:${p.manufacturer || ""}`.toUpperCase().replace(/[^A-Z0-9:]/g, "");
    if (seenJm.has(key)) return false;
    seenJm.add(key);
    // Show J+M with any positive price OR explicit availability
    return p.price_with_vat > 0 || p.availability === "in_stock" || p.availability === "on_order";
  });
  return [...base, ...visibleJm].sort((a, b) => a.rank - b.rank);
}

// ============================================================
// Phase 5: GLOBAL OEM SEARCH
// Hybrid: parallel local parts_new lookup + live J+M searchByCode.
// OEM (rank 1) always pinned to top; J+M alternatives below with NÁHRADA badge.
// ============================================================
function normalizeOem(s: string): string {
  return (s || "").toUpperCase().replace(/[\s\-._/]/g, "");
}

export async function globalOemSearch(query: string): Promise<{
  oem: CatalogPart[];
  jm: CatalogPart[];
  merged: CatalogPart[];
}> {
  const q = query.trim();
  if (!q) return { oem: [], jm: [], merged: [] };
  const norm = normalizeOem(q);

  const [localRes, jmRes] = await Promise.allSettled([
    supabase
      .from("parts_new")
      .select(
        "id, oem_number, name, manufacturer, catalog_source, price_without_vat, price_with_vat, availability, image_urls, category, description"
      )
      .in("catalog_source", ALLOWED_SOURCES as unknown as string[])
      .or(`oem_number.ilike.%${q}%,name.ilike.%${q}%`)
      .limit(40),
    supabase.functions.invoke("jm-proxy", {
      body: { action: "searchByCode", payload: { code: q } },
    }),
  ]);

  const oem: CatalogPart[] =
    localRes.status === "fulfilled" && localRes.value.data
      ? (localRes.value.data as any[]).map(normalize).sort((a, b) => a.rank - b.rank)
      : [];

  const jmRaw =
    jmRes.status === "fulfilled" && (jmRes.value as any)?.data?.success
      ? ((jmRes.value as any).data.data?.items || [])
      : [];
  const jm: CatalogPart[] = (jmRaw as JmRawItem[])
    .map(jmToCatalogPart)
    .filter((p) => p.oem_number);

  // Dedup: hide J+M lines whose normalized OEM already exists as local OEM with same price
  const localOems = new Set(oem.map((p) => normalizeOem(p.oem_number)));
  const jmFiltered = jm.filter((p) => !localOems.has(normalizeOem(p.oem_number)) || p.price_with_vat > 0);

  return { oem, jm: jmFiltered, merged: [...oem, ...jmFiltered].sort((a, b) => a.rank - b.rank) };
}
