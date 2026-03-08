/**
 * Parts API Layer
 * Handles all data fetching, caching, pagination and search logic
 * for the automotive parts catalog.
 */

import { supabase } from "@/integrations/supabase/client";

// ---- Types ----

export interface PartResult {
  id: string;
  name: string;
  oem_number: string;
  internal_code: string | null;
  price_without_vat: number;
  price_with_vat: number;
  category: string | null;
  family: string | null;
  segment: string | null;
  packaging: string | null;
  description: string | null;
  manufacturer: string | null;
  catalog_source: string;
  availability: string;
  compatible_vehicles: string | null;
  superseded_by: string | null;
  supersedes: string | null;
}

export interface SearchFilters {
  brand?: string;
  model?: string;
  year?: string;
  motor?: string;
  category?: string;
  subCategory?: string;
  manufacturer?: string;
  minPrice?: number;
  maxPrice?: number;
  availability?: string;
  partType?: string;
}

export interface SearchResult {
  results: PartResult[];
  totalCount: number;
}

export const PAGE_SIZE = 20;

// ---- Source priority ----

export const sourceLabel: Record<string, string> = {
  mopar: "Mopar OE",
  autokelly: "AutoKelly",
  intercars: "InterCars",
  csv: "Lokální katalog",
  epc: "EPC katalog",
};

export const sourcePriority: Record<string, number> = {
  mopar: 1,
  csv: 2,
  autokelly: 3,
  intercars: 4,
};

// ---- Catalog config ----

/** Enabled alternative catalog sources */
export const enabledSources = new Set(["mopar", "csv", "autokelly"]);

/** Blocked manufacturers per source (lowercase) */
export const blockedManufacturers: Record<string, Set<string>> = {
  autokelly: new Set(["starline"]),
};

/** Check if a part should be filtered out */
export const isPartBlocked = (part: PartResult): boolean => {
  if (!enabledSources.has(part.catalog_source)) return true;
  const blocked = blockedManufacturers[part.catalog_source];
  if (blocked && part.manufacturer && blocked.has(part.manufacturer.toLowerCase())) return true;
  return false;
};

// ---- Helpers ----

export const normalizeOem = (q: string) => q.replace(/[\s-]/g, "").toUpperCase();

/** Map raw DB row to PartResult */
export const mapToPartResult = (item: any, source: string): PartResult => ({
  id: item.id,
  name: item.name,
  oem_number: item.oem_code || item.oem_number,
  internal_code: item.internal_code || null,
  price_without_vat: item.price_without_vat ?? item.price ?? 0,
  price_with_vat: item.price_with_vat ?? Math.round((item.price ?? 0) * 1.21 * 100) / 100,
  category: item.category || null,
  family: item.family || item.brand || null,
  segment: item.segment || (item.available !== undefined ? (item.available ? "Skladem" : "Na objednávku") : null),
  packaging: item.packaging || null,
  description: item.description || null,
  manufacturer: item.manufacturer || (source === "mopar" ? "Mopar" : null),
  catalog_source: item.catalog_source || source,
  availability: item.availability || (item.available ? "available" : "unknown"),
  compatible_vehicles: item.compatible_vehicles || null,
  superseded_by: item.superseded_by || null,
  supersedes: item.supersedes || null,
});

/** Sort results by catalog source priority */
export const sortByPriority = (parts: PartResult[]) =>
  [...parts].sort((a, b) => (sourcePriority[a.catalog_source] || 99) - (sourcePriority[b.catalog_source] || 99));

/** Enrich parts with supersession data from DB */
export const enrichWithSupersessions = async (parts: PartResult[]) => {
  const oems = parts.map((p) => p.oem_number);
  if (oems.length === 0) return;
  const [byOld, byNew] = await Promise.all([
    supabase.from("part_supersessions").select("old_oem_number, new_oem_number").in("old_oem_number", oems),
    supabase.from("part_supersessions").select("old_oem_number, new_oem_number").in("new_oem_number", oems),
  ]);
  const supersededMap = new Map<string, string>();
  const supersedesMap = new Map<string, string>();
  byOld.data?.forEach((s) => supersededMap.set(s.old_oem_number, s.new_oem_number));
  byNew.data?.forEach((s) => supersedesMap.set(s.new_oem_number, s.old_oem_number));
  parts.forEach((p) => {
    if (!p.superseded_by) p.superseded_by = supersededMap.get(p.oem_number) || null;
    if (!p.supersedes) p.supersedes = supersedesMap.get(p.oem_number) || null;
  });
};

// ---- Apply client-side filters ----

const applyFilters = (parts: PartResult[], filters: SearchFilters): PartResult[] => {
  let filtered = [...parts];
  if (filters.manufacturer) {
    filtered = filtered.filter((p) => p.manufacturer?.toLowerCase().includes(filters.manufacturer!.toLowerCase()));
  }
  if (filters.minPrice !== undefined) {
    filtered = filtered.filter((p) => p.price_with_vat >= filters.minPrice!);
  }
  if (filters.maxPrice !== undefined) {
    filtered = filtered.filter((p) => p.price_with_vat <= filters.maxPrice!);
  }
  if (filters.availability && filters.availability !== "all") {
    filtered = filtered.filter((p) => p.availability === filters.availability);
  }
  return filtered;
};

// ---- Search functions ----

/**
 * Search parts in local DB (parts_new + parts_catalog).
 * Falls back to external catalog-search edge function if nothing found.
 */
export async function searchParts(
  query: string,
  page: number,
  filters: SearchFilters = {}
): Promise<SearchResult> {
  const normalized = normalizeOem(query);
  const allResults: PartResult[] = [];

  // 1. Search local DB (parallel)
  const pnFilter = `oem_number.ilike.%${query}%,oem_number.ilike.%${normalized}%,name.ilike.%${query}%,internal_code.ilike.%${query}%`;
  const [pnRes, pcRes] = await Promise.all([
    supabase
      .from("parts_new")
      .select(
        "id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source",
        { count: "exact" }
      )
      .or(pnFilter)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .order("name"),
    supabase
      .from("parts_catalog")
      .select("id, name, oem_code, price, brand, category, available", { count: "exact" })
      .or(`oem_code.ilike.%${query}%,oem_code.ilike.%${normalized}%,name.ilike.%${query}%`)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .order("name"),
  ]);

  if (pnRes.data) allResults.push(...pnRes.data.map((p) => mapToPartResult(p, "mopar")));
  if (pcRes.data) {
    const existingOems = new Set(allResults.map((r) => normalizeOem(r.oem_number)));
    for (const item of pcRes.data) {
      if (!existingOems.has(normalizeOem(item.oem_code))) {
        allResults.push(mapToPartResult(item, "csv"));
      }
    }
  }

  if (allResults.length > 0) {
    await enrichWithSupersessions(allResults);
    const filtered = applyFilters(allResults, filters);
    return { results: sortByPriority(filtered), totalCount: (pnRes.count ?? 0) + (pcRes.count ?? 0) };
  }

  // 2. External catalog search
  const { data: extData, error: fnError } = await supabase.functions.invoke("catalog-search", {
    body: { oemCodes: [normalized] },
  });
  if (fnError) throw new Error(fnError.message || "Chyba při volání katalogu");

  const catalogResults = extData?.results || [];
  const partResults: PartResult[] = catalogResults
    .filter((r: any) => r.found)
    .map((r: any, i: number) => ({
      id: `catalog-${i}-${r.oem_number}`,
      name: r.name || `Díl ${r.oem_number}`,
      oem_number: r.oem_number,
      internal_code: r.search_code || null,
      price_without_vat: r.price_without_vat,
      price_with_vat: r.price_with_vat,
      category: r.category || null,
      family: r.family || null,
      segment: r.segment || null,
      packaging: r.packaging || null,
      description: r.description || null,
      manufacturer: r.manufacturer || "Mopar",
      catalog_source: r.catalog_source || "mopar",
      availability: r.availability || "available",
      compatible_vehicles: r.compatible_vehicles || null,
      superseded_by: r.superseded_by || null,
      supersedes: r.supersedes || null,
    }));

  // 3. Refresh from DB if catalog saved them
  if (partResults.length > 0) {
    const { data: freshData } = await supabase
      .from("parts_new")
      .select(
        "id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source"
      )
      .in("oem_number", partResults.map((p) => p.oem_number));
    if (freshData && freshData.length > 0) {
      const mapped = freshData.map((p) => mapToPartResult(p, "mopar"));
      await enrichWithSupersessions(mapped);
      const filtered = applyFilters(mapped, filters);
      return { results: sortByPriority(filtered), totalCount: mapped.length };
    }
  }

  const filtered = applyFilters(partResults, filters);
  return { results: sortByPriority(filtered), totalCount: filtered.length };
}

/**
 * Search by category (vehicle / EPC mode)
 */
export async function searchByCategory(
  searchTerm: string,
  page: number,
  filters: SearchFilters = {}
): Promise<SearchResult> {
  const allResults: PartResult[] = [];

  // Build parts_new query with vehicle filters
  let pnQuery = supabase
    .from("parts_new")
    .select(
      "id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source",
      { count: "exact" }
    );

  if (searchTerm) {
    pnQuery = pnQuery.or(`name.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`);
  }
  if (filters.brand) {
    pnQuery = pnQuery.or(`compatible_vehicles.ilike.%${filters.brand}%,family.ilike.%${filters.brand}%`);
  }

  pnQuery = pnQuery.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  // Build parts_catalog query with brand filter
  let pcQuery = supabase
    .from("parts_catalog")
    .select("id, name, oem_code, price, brand, category, available", { count: "exact" });

  if (searchTerm) {
    pcQuery = pcQuery.or(`name.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`);
  }
  if (filters.brand) {
    pcQuery = pcQuery.ilike("brand", `%${filters.brand}%`);
  }

  pcQuery = pcQuery.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  const [pnRes, pcRes] = await Promise.all([pnQuery, pcQuery]);

  if (pnRes.data) allResults.push(...pnRes.data.map((p) => mapToPartResult(p, "mopar")));
  if (pcRes.data) {
    const existingOems = new Set(allResults.map((r) => normalizeOem(r.oem_number)));
    for (const item of pcRes.data) {
      if (!existingOems.has(normalizeOem(item.oem_code))) allResults.push(mapToPartResult(item, "csv"));
    }
  }

  await enrichWithSupersessions(allResults);
  const filtered = applyFilters(allResults, filters);
  return { results: sortByPriority(filtered), totalCount: (pnRes.count ?? 0) + (pcRes.count ?? 0) };
}

// ---- EPC types ----

export interface EPCCategory {
  id: string;
  brand: string;
  model: string;
  engine: string | null;
  category: string;
  subcategory: string | null;
  year_from: number | null;
  year_to: number | null;
}

export interface EPCPart {
  id: string;
  oem_number: string | null;
  part_name: string | null;
  manufacturer: string | null;
  note: string | null;
  epc_category_id: string;
  part_id: string | null;
}

/**
 * Get available EPC categories for a vehicle
 */
export async function getEPCCategories(
  brand: string,
  model?: string,
  engine?: string,
  year?: number
): Promise<EPCCategory[]> {
  let query = supabase
    .from("epc_categories")
    .select("id, brand, model, engine, category, subcategory, year_from, year_to")
    .eq("brand", brand);

  if (model) query = query.eq("model", model);
  if (engine) query = query.eq("engine", engine);
  if (year) {
    query = query.or(`year_from.is.null,year_from.lte.${year}`);
    query = query.or(`year_to.is.null,year_to.gte.${year}`);
  }

  query = query.order("sort_order").order("category");

  const { data } = await query;
  return (data as EPCCategory[]) || [];
}

/**
 * Get unique category names from EPC categories
 */
export function getUniqueCategoryNames(categories: EPCCategory[]): string[] {
  return [...new Set(categories.map((c) => c.category))];
}

/**
 * Get EPC parts for given category IDs
 */
export async function getEPCParts(categoryIds: string[]): Promise<EPCPart[]> {
  if (categoryIds.length === 0) return [];
  
  const { data } = await supabase
    .from("epc_part_links")
    .select("id, oem_number, part_name, manufacturer, note, epc_category_id, part_id")
    .in("epc_category_id", categoryIds);

  return (data as EPCPart[]) || [];
}

/**
 * Search EPC categories then linked parts (legacy compatible)
 */
export async function searchEPC(
  brand: string,
  category: string,
  model?: string,
  subCategory?: string,
  page: number = 0
): Promise<SearchResult> {
  const allResults: PartResult[] = [];

  // Find matching EPC categories
  let epcQuery = supabase.from("epc_categories").select("id").eq("brand", brand).eq("category", category);
  if (model) epcQuery = epcQuery.eq("model", model);
  if (subCategory) epcQuery = epcQuery.eq("subcategory", subCategory);

  const { data: epcCats } = await epcQuery;
  if (epcCats && epcCats.length > 0) {
    const catIds = epcCats.map((c: any) => c.id);
    
    // Get parts from epc_part_links (with new direct columns)
    const { data: links } = await supabase
      .from("epc_part_links")
      .select("id, oem_number, part_name, manufacturer, note, part_id")
      .in("epc_category_id", catIds);

    if (links && links.length > 0) {
      // Parts that have direct data in epc_part_links
      const directParts = links.filter((l: any) => l.oem_number && l.part_name);
      for (const dp of directParts) {
        allResults.push({
          id: `epc-${dp.id}`,
          name: dp.part_name || "",
          oem_number: dp.oem_number || "",
          internal_code: null,
          price_without_vat: 0,
          price_with_vat: 0,
          category: category,
          family: brand,
          segment: null,
          packaging: null,
          description: dp.note || null,
          manufacturer: dp.manufacturer || null,
          catalog_source: "epc",
          availability: "unknown",
          compatible_vehicles: `${brand} ${model || ""}`.trim(),
          superseded_by: null,
          supersedes: null,
        });
      }

      // Parts that reference parts_new
      const linkedPartIds = links.filter((l: any) => l.part_id).map((l: any) => l.part_id);
      if (linkedPartIds.length > 0) {
        const uniqueIds = [...new Set(linkedPartIds)];
        const { data: epcParts } = await supabase
          .from("parts_new")
          .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source")
          .in("id", uniqueIds);
        if (epcParts) {
          const existingOems = new Set(allResults.map(r => normalizeOem(r.oem_number)));
          for (const p of epcParts) {
            if (!existingOems.has(normalizeOem(p.oem_number))) {
              allResults.push(mapToPartResult(p, "mopar"));
            }
          }
        }
      }
    }
  }

  // Fallback: text search if no EPC data
  if (allResults.length === 0 && subCategory) {
    return searchByCategory(subCategory, page);
  }

  await enrichWithSupersessions(allResults);
  return { results: sortByPriority(allResults), totalCount: allResults.length };
}

/**
 * Decode VIN via NHTSA public API
 */
export async function decodeVIN(vin: string) {
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${vin}?format=json`);
  const json = await res.json();
  const r = json.Results?.[0];
  if (!r) throw new Error("VIN nebyl rozpoznán");
  return {
    brand: r.Make || "",
    model: r.Model || "",
    year: r.ModelYear || "",
    engine: [r.DisplacementL ? `${r.DisplacementL}L` : "", r.FuelTypePrimary || ""].filter(Boolean).join(" "),
  };
}

/**
 * Get recommended similar parts based on category/family
 */
export async function getRecommendations(part: PartResult): Promise<PartResult[]> {
  if (!part.category && !part.family) return [];
  let query = supabase
    .from("parts_new")
    .select(
      "id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source"
    )
    .neq("id", part.id)
    .limit(6);

  if (part.category) query = query.eq("category", part.category);
  else if (part.family) query = query.eq("family", part.family);

  const { data } = await query;
  return (data || []).map((p) => mapToPartResult(p, "mopar"));
}

/**
 * Export parts list to CSV string
 */
export function exportToCSV(parts: PartResult[]): string {
  const headers = [
    "Číslo dílu",
    "Název",
    "Výrobce",
    "Kategorie",
    "Cena bez DPH",
    "Cena s DPH",
    "Dostupnost",
    "Zdroj",
    "Popis",
    "Kompatibilní vozidla",
  ];
  const rows = parts.map((p) =>
    [
      p.oem_number,
      `"${(p.name || "").replace(/"/g, '""')}"`,
      p.manufacturer || "",
      p.category || "",
      p.price_without_vat,
      p.price_with_vat,
      p.availability,
      sourceLabel[p.catalog_source] || p.catalog_source,
      `"${(p.description || "").replace(/"/g, '""')}"`,
      `"${(p.compatible_vehicles || "").replace(/"/g, '""')}"`,
    ].join(";")
  );
  return [headers.join(";"), ...rows].join("\n");
}

/**
 * Download CSV file in the browser
 */
export function downloadCSV(parts: PartResult[], filename = "dily-export.csv") {
  const csv = exportToCSV(parts);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
