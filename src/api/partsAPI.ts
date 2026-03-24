/**
 * Parts API Layer
 * Handles all data fetching, caching, pagination and search logic
 * for the automotive parts catalog.
 */

import { supabase } from "@/integrations/supabase/client";
import { cacheGet, cacheSet } from "@/lib/epcCache";

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
  catalogSource?: string;
}

export interface SearchResult {
  results: PartResult[];
  totalCount: number;
}

export const PAGE_SIZE = 20;

// ---- Source priority ----

export const sourceLabel: Record<string, string> = {
  mopar: "Zdroj 1",
  "epc-ai": "Zdroj 1",
  makro: "Zdroj 2",
  sag: "Zdroj 3",
  autokelly: "Zdroj 4",
  intercars: "Zdroj 5",
  csv: "Zdroj 6",
  epc: "Zdroj 7",
  "7zap": "Zdroj 8",
  ai: "Zdroj 9",
};

export const sourcePriority: Record<string, number> = {
  mopar: 1,
  "epc-ai": 1,
  makro: 2,
  sag: 3,
  autokelly: 4,
  csv: 5,
  intercars: 6,
};

// ---- Catalog config ----

/** Alternative catalog sources (non-OEM) */
export const ALT_SOURCES = ["sag", "autokelly", "makro"];

/** Check if a source is an alternative (non-OEM) source */
export const isAltSource = (source: string) => ALT_SOURCES.includes(source);

/** Enabled alternative catalog sources */
export const enabledSources = new Set(["mopar", "epc-ai", "csv", "sag", "autokelly", "makro"]);

/** Blocked manufacturers per source (lowercase) */
export const blockedManufacturers: Record<string, Set<string>> = {
  sag: new Set(["starline"]),
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
export const mapToPartResult = (item: any, source: string): PartResult => {
  const catalogSource = item.catalog_source || source;
  const rawOem = item.oem_code || item.oem_number;
  const normalizedDisplayOem = typeof rawOem === "string"
    ? rawOem.replace(/^(SAG|AK)-/, "")
    : rawOem;

  return {
    id: item.id,
    name: item.name,
    oem_number: normalizedDisplayOem,
    internal_code: item.internal_code || null,
    price_without_vat: item.price_without_vat ?? item.price ?? 0,
    price_with_vat: item.price_with_vat ?? Math.round((item.price ?? 0) * 1.21 * 100) / 100,
    category: item.category || null,
    family: item.family || item.brand || null,
    segment: item.segment || (item.available !== undefined ? (item.available ? "Skladem" : "Na objednávku") : null),
    packaging: item.packaging || null,
    description: item.description || null,
    manufacturer: item.manufacturer || ((catalogSource === "mopar" || catalogSource === "epc-ai") ? "Mopar" : null),
    catalog_source: catalogSource,
    availability: item.availability || (item.available ? "available" : "unknown"),
    compatible_vehicles: item.compatible_vehicles || null,
    superseded_by: item.superseded_by || null,
    supersedes: item.supersedes || null,
  };
};

/** Sort results by catalog source priority, filtering blocked parts */
export const sortByPriority = (parts: PartResult[]) =>
  [...parts].filter(p => !isPartBlocked(p)).sort((a, b) => (sourcePriority[a.catalog_source] || 99) - (sourcePriority[b.catalog_source] || 99));

/** Enrich parts with supersession data from DB + fetch alternatives for superseded OEMs */
export const enrichWithSupersessions = async (parts: PartResult[]) => {
  const oems = [...new Set(parts.map((p) => normalizeOem(p.oem_number)).filter(Boolean))];
  if (oems.length === 0) return;
  console.log(`[enrichSupersessions] Processing ${oems.length} OEMs, ${parts.length} parts`);

  // Check cache for supersession mappings
  const cachedSupersessions = await cacheGet<{ superseded: [string, string][]; supersedes: [string, string][] }>('oem_crossref', `supersession_batch_${oems.sort().join(',').slice(0, 100)}`);

  let supersededMap: Map<string, string>;
  let supersedesMap: Map<string, string>;

  if (cachedSupersessions) {
    supersededMap = new Map(cachedSupersessions.superseded);
    supersedesMap = new Map(cachedSupersessions.supersedes);
  } else {
    const [byOld, byNew] = await Promise.all([
      supabase.from("part_supersessions").select("old_oem_number, new_oem_number").in("old_oem_number", oems),
      supabase.from("part_supersessions").select("old_oem_number, new_oem_number").in("new_oem_number", oems),
    ]);
    supersededMap = new Map<string, string>();
    supersedesMap = new Map<string, string>();
    byOld.data?.forEach((s) => supersededMap.set(s.old_oem_number, s.new_oem_number));
    byNew.data?.forEach((s) => supersedesMap.set(s.new_oem_number, s.old_oem_number));

    // Cache the mapping for 30 days
    if (supersededMap.size > 0 || supersedesMap.size > 0) {
      cacheSet('oem_crossref', `supersession_batch_${oems.sort().join(',').slice(0, 100)}`, {
        superseded: [...supersededMap.entries()],
        supersedes: [...supersedesMap.entries()],
      });
    }
  }

  parts.forEach((p) => {
    const norm = normalizeOem(p.oem_number);
    if (!p.superseded_by) p.superseded_by = supersededMap.get(norm) || null;
    if (!p.supersedes) p.supersedes = supersedesMap.get(norm) || null;
  });

  // Collect superseded OEM numbers that aren't already in results — fetch their alternatives too
  const extraOems: string[] = [];
  for (const [, newOem] of supersededMap) {
    if (!oems.includes(newOem)) extraOems.push(newOem);
  }
  for (const [, oldOem] of supersedesMap) {
    if (!oems.includes(oldOem)) extraOems.push(oldOem);
  }

  if (extraOems.length > 0) {
    const sagKeys = extraOems.map(o => `SAG-${o}`);
    const akKeys = extraOems.map(o => `AK-${o}`);
    const { data: altParts } = await supabase
      .from("parts_new")
      .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source")
      .in("oem_number", [...extraOems, ...sagKeys, ...akKeys])
      .gt("price_with_vat", 0);

    if (altParts) {
      const existingIds = new Set(parts.map(p => p.id));
      for (const p of altParts) {
        const mapped = mapToPartResult(p, p.catalog_source || "mopar");
        if (!existingIds.has(mapped.id) && !isPartBlocked(mapped)) {
          parts.push(mapped);
          existingIds.add(mapped.id);
        }
      }
    }
  }
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
  if (filters.catalogSource && filters.catalogSource !== "all") {
    filtered = filtered.filter((p) => p.catalog_source === filters.catalogSource);
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

  // 1. Search local DB (parallel) — includes SAG/AK prefix lookup
  const pnFilter = `oem_number.ilike.%${query}%,oem_number.ilike.%${normalized}%,name.ilike.%${query}%,internal_code.ilike.%${query}%`;
  const sagAkOems = [`SAG-${normalized}`, `AK-${normalized}`];
  const [pnRes, pcRes, altRes] = await Promise.all([
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
    // Explicit SAG/AK lookup by prefixed OEM
    supabase
      .from("parts_new")
      .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source")
      .in("oem_number", sagAkOems)
      .gt("price_with_vat", 0),
  ]);

  if (pnRes.data) allResults.push(...pnRes.data.map((p) => mapToPartResult(p, p.catalog_source || "mopar")));
  
  // Merge SAG/AK alternatives found by prefix
  const existingIds = new Set(allResults.map(r => r.id));
  if (altRes.data) {
    for (const p of altRes.data) {
      const mapped = mapToPartResult(p, p.catalog_source || "sag");
      if (!existingIds.has(mapped.id) && !isPartBlocked(mapped)) {
        allResults.push(mapped);
        existingIds.add(mapped.id);
      }
    }
  }
  
  if (pcRes.data) {
    const existingOems = new Set(allResults.map((r) => `${r.catalog_source}:${normalizeOem(r.oem_number)}`));
    for (const item of pcRes.data) {
      if (!existingOems.has(`csv:${normalizeOem(item.oem_code)}`)) {
        allResults.push(mapToPartResult(item, "csv"));
      }
    }
  }

  if (allResults.length > 0) {
    await enrichWithSupersessions(allResults);
    const filtered = applyFilters(allResults, filters);
    return { results: sortByPriority(filtered), totalCount: (pnRes.count ?? 0) + (pcRes.count ?? 0) + (altRes.data?.length ?? 0) };
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

  // 3. Refresh from DB — fetch both clean OEM and SAG-prefixed entries
  if (partResults.length > 0) {
    const cleanOems = [...new Set(partResults.map((p) => p.oem_number))];
    const sagOems = cleanOems.map(o => `SAG-${o}`);
    const akOems = cleanOems.map(o => `AK-${o}`);
    const allOemsToQuery = [...cleanOems, ...sagOems, ...akOems];

    const { data: freshData } = await supabase
      .from("parts_new")
      .select(
        "id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source"
      )
      .in("oem_number", allOemsToQuery);

    const dbResults: PartResult[] = [];
    if (freshData && freshData.length > 0) {
      // Filter out invalid SAG entries (zero price, garbage names)
      const validFresh = freshData.filter(p => {
        if ((p.catalog_source === 'sag' || p.catalog_source === 'autokelly') && p.price_with_vat <= 0) return false;
        return true;
      });
      dbResults.push(...validFresh.map((p) => mapToPartResult(p, p.catalog_source || "mopar")));
    }

    // Also merge alternative results from edge function that may not be in DB yet
    const altFromEdge = partResults.filter(p => (p.catalog_source === 'sag' || p.catalog_source === 'autokelly') && p.price_with_vat > 0);
    for (const alt of altFromEdge) {
      const alreadyInDb = dbResults.some(d =>
        d.catalog_source === alt.catalog_source && normalizeOem(d.oem_number) === normalizeOem(alt.oem_number) && d.name === alt.name
      );
      if (!alreadyInDb) dbResults.push(alt);
    }

    if (dbResults.length > 0) {
      await enrichWithSupersessions(dbResults);
      const filtered = applyFilters(dbResults, filters);
      return { results: sortByPriority(filtered), totalCount: dbResults.length };
    }
  }

  const filtered = applyFilters(partResults, filters);
  return { results: sortByPriority(filtered), totalCount: filtered.length };
}

/**
 * Search by category (vehicle / EPC mode)
 * sourceFilter: "oem" = only originals, "alternatives" = SAG/AutoKelly only, "all" = everything
 */
export async function searchByCategory(
  searchTerm: string,
  page: number,
  filters: SearchFilters = {},
  sourceFilter: "all" | "oem" | "alternatives" = "all"
): Promise<SearchResult> {
  const allResults: PartResult[] = [];

  // ---- Step 1: Always get OEM parts first (to collect OEM numbers for alt lookup) ----
  let pnQuery = supabase
    .from("parts_new")
    .select(
      "id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source",
      { count: "exact" }
    );

  // For OEM mode: exclude sag/autokelly. For alternatives: we still need OEM numbers as base.
  if (sourceFilter === "oem") {
    pnQuery = pnQuery.not("catalog_source", "in", '("sag","autokelly")');
  }

  if (searchTerm) {
    pnQuery = pnQuery.or(`name.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`);
  }
  if (filters.brand) {
    pnQuery = pnQuery.or(`compatible_vehicles.ilike.%${filters.brand}%,family.ilike.%${filters.brand}%`);
  }

  pnQuery = pnQuery.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  // parts_catalog (CSV) — only for OEM mode
  let pcQuery = sourceFilter !== "alternatives"
    ? supabase
        .from("parts_catalog")
        .select("id, name, oem_code, price, brand, category, available", { count: "exact" })
    : null;

  if (pcQuery) {
    if (searchTerm) pcQuery = pcQuery.or(`name.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`);
    if (filters.brand) pcQuery = pcQuery.ilike("brand", `%${filters.brand}%`);
    pcQuery = pcQuery.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  }

  const [pnRes, pcRes] = await Promise.all([
    pnQuery,
    pcQuery || Promise.resolve({ data: null, count: 0 }),
  ]);

  // Collect OEM results (needed as reference OEM numbers even in alternatives mode)
  const oemResults: PartResult[] = [];
  if (pnRes.data) {
    for (const p of pnRes.data) {
      const mapped = mapToPartResult(p, p.catalog_source || "mopar");
      if (sourceFilter !== "alternatives" || !isAltSource(mapped.catalog_source)) {
        oemResults.push(mapped);
      }
      // Always add to allResults if in OEM or all mode
      if (sourceFilter !== "alternatives") {
        allResults.push(mapped);
      }
    }
  }
  if (pcRes && (pcRes as any).data) {
    const existingOems = new Set(allResults.map((r) => normalizeOem(r.oem_number)));
    for (const item of (pcRes as any).data) {
      if (!existingOems.has(normalizeOem(item.oem_code))) {
        const mapped = mapToPartResult(item, "csv");
        oemResults.push(mapped);
        if (sourceFilter !== "alternatives") allResults.push(mapped);
      }
    }
  }

  // ---- Step 2: For alternatives or all mode — find SAG/AK parts ----
  if (sourceFilter === "alternatives" || sourceFilter === "all") {
    // Collect base OEM numbers from the OEM results found above
    // Also directly query parts_new for sag/autokelly entries matching vehicle filters
    const altQueries: PromiseLike<any>[] = [];

    // Direct query: find SAG/AK parts that match the vehicle/category filters
    let altDirectQuery = supabase
      .from("parts_new")
      .select(
        "id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source"
      )
      .in("catalog_source", ALT_SOURCES);

    if (filters.brand) {
      altDirectQuery = altDirectQuery.or(`compatible_vehicles.ilike.%${filters.brand}%,family.ilike.%${filters.brand}%`);
    }
    if (searchTerm) {
      altDirectQuery = altDirectQuery.or(`name.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`);
    }
    altDirectQuery = altDirectQuery.limit(100);
    altQueries.push(altDirectQuery.then(res => res));

    // Also look up by OEM-number prefix match
    const baseOems = [...new Set([
      ...oemResults.map(r => normalizeOem(r.oem_number)),
      ...((pnRes.data || []) as any[])
        .filter((p: any) => !isAltSource(p.catalog_source))
        .map((p: any) => normalizeOem(p.oem_number))
    ].filter(Boolean))];

    // Also include superseded OEM numbers for alternative lookup
    let expandedOems = [...baseOems];
    if (baseOems.length > 0) {
      const batch20 = baseOems.slice(0, 20);
      const [{ data: supersededBy }, { data: supersedesData }] = await Promise.all([
        supabase.from("part_supersessions").select("old_oem_number, new_oem_number").in("old_oem_number", batch20),
        supabase.from("part_supersessions").select("old_oem_number, new_oem_number").in("new_oem_number", batch20),
      ]);
      const extraOems: string[] = [];
      supersededBy?.forEach(s => { if (!expandedOems.includes(s.new_oem_number)) extraOems.push(s.new_oem_number); });
      supersedesData?.forEach(s => { if (!expandedOems.includes(s.old_oem_number)) extraOems.push(s.old_oem_number); });
      expandedOems = [...new Set([...expandedOems, ...extraOems])];
    }

    if (expandedOems.length > 0) {
      const batch = expandedOems.slice(0, 30);
      const sagOems = batch.map(o => `SAG-${o}`);
      const akOems = batch.map(o => `AK-${o}`);
      altQueries.push(
        supabase
          .from("parts_new")
          .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source")
          .in("oem_number", [...sagOems, ...akOems])
          .gt("price_with_vat", 0)
          .then(res => res)
      );
    }

    const altResults = await Promise.all(altQueries);
    const existingIds = new Set(allResults.map(r => r.id));

    for (const res of altResults) {
      if (res.data) {
        for (const p of res.data) {
          if (isAltSource(p.catalog_source)) {
            const mapped = mapToPartResult(p, p.catalog_source);
            if (!existingIds.has(mapped.id)) {
              // Extra dedup by catalog_source + normalized OEM + manufacturer
              const dedupKey = `${mapped.catalog_source}:${normalizeOem(mapped.oem_number)}:${(mapped.manufacturer || '').toLowerCase()}`;
              const isDup = allResults.some(r => 
                `${r.catalog_source}:${normalizeOem(r.oem_number)}:${(r.manufacturer || '').toLowerCase()}` === dedupKey
              );
              if (!isDup) {
                allResults.push(mapped);
                existingIds.add(mapped.id);
              }
            }
          }
        }
      }
    }

    // ---- Step 3: If still few alternatives, trigger external catalog-search only for precise drill-down ----
    const altCount = allResults.filter(r => isAltSource(r.catalog_source)).length;
    const isPreciseAlternativePath = Boolean(filters.brand) || Boolean(searchTerm && filters.brand);
    if (altCount < 3 && isPreciseAlternativePath && expandedOems.length > 0) {
      const uncachedBatch = expandedOems.slice(0, 5);
      try {
        const { data: extData } = await supabase.functions.invoke("catalog-search", {
          body: { oemCodes: uncachedBatch },
        });

        // After edge function caches results, re-fetch from DB
        if (extData?.results) {
          const sagOems2 = uncachedBatch.map(o => `SAG-${o}`);
          const akOems2 = uncachedBatch.map(o => `AK-${o}`);
          const { data: freshAlts } = await supabase
            .from("parts_new")
            .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source")
            .in("oem_number", [...sagOems2, ...akOems2])
            .gt("price_with_vat", 0);

          if (freshAlts) {
            for (const p of freshAlts) {
              const mapped = mapToPartResult(p, p.catalog_source || "sag");
              if (!existingIds.has(mapped.id)) {
                const dedupKey = `${mapped.catalog_source}:${normalizeOem(mapped.oem_number)}:${(mapped.manufacturer || '').toLowerCase()}`;
                const isDup = allResults.some(r =>
                  `${r.catalog_source}:${normalizeOem(r.oem_number)}:${(r.manufacturer || '').toLowerCase()}` === dedupKey
                );
                if (!isDup) {
                  allResults.push(mapped);
                  existingIds.add(mapped.id);
                }
              }
            }
          }
        }
      } catch {
        // Non-critical: external search failed
      }
    }

  } else {
    // OEM mode: still fire background enrichment for future alt searches
    const localOems = [...new Set(allResults.map(r => normalizeOem(r.oem_number)).filter(Boolean))];
    if (localOems.length > 0) {
      const batch = localOems.slice(0, 10);
      supabase.functions.invoke("catalog-search", {
        body: { oemCodes: batch },
      }).catch(() => {});
    }
  }

  await enrichWithSupersessions(allResults);

  // Final source filter (safety net)
  let sourceFiltered = allResults;
  if (sourceFilter === "oem") {
    sourceFiltered = allResults.filter(p => !isAltSource(p.catalog_source));
  } else if (sourceFilter === "alternatives") {
    sourceFiltered = allResults.filter(p => isAltSource(p.catalog_source));
  }

  const filtered = applyFilters(sourceFiltered, filters);
  return { results: sortByPriority(filtered), totalCount: sourceFiltered.length };
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
  const queries: PromiseLike<any>[] = [];

  // 1. Same category/family
  if (part.category || part.family) {
    let q = supabase
      .from("parts_new")
      .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source")
      .neq("id", part.id)
      .gt("price_with_vat", 0)
      .limit(4);
    if (part.category) q = q.eq("category", part.category);
    else if (part.family) q = q.eq("family", part.family);
    queries.push(q.then(r => r));
  }

  // 2. Supersession-related alternatives
  const norm = normalizeOem(part.oem_number);
  const sagKey = `SAG-${norm}`;
  const akKey = `AK-${norm}`;
  queries.push(
    supabase
      .from("parts_new")
      .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source")
      .in("oem_number", [sagKey, akKey])
      .gt("price_with_vat", 0)
      .limit(4)
      .then(r => r)
  );

  const results = await Promise.all(queries);
  const seen = new Set<string>([part.id]);
  const combined: PartResult[] = [];

  for (const res of results) {
    if (res.data) {
      for (const p of res.data) {
        if (!seen.has(p.id)) {
          combined.push(mapToPartResult(p, p.catalog_source || "mopar"));
          seen.add(p.id);
        }
      }
    }
  }

  return combined.filter(p => !isPartBlocked(p)).slice(0, 6);
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
 * Enriches EPC parts with prices from parts_new DB and triggers
 * catalog-search for OEM numbers without cached prices.
 * Returns priceMap + alternativesMap (SAG alternatives per OEM).
 */
export interface AlternativePart {
  name: string;
  price_without_vat: number;
  price_with_vat: number;
  availability: string;
  manufacturer: string;
  catalog_source: string;
}

export interface EnrichedPriceResult {
  priceMap: Map<string, { price_without_vat: number; price_with_vat: number; availability: string; name?: string }>;
  alternativesMap: Map<string, AlternativePart[]>;
}

export async function enrichEPCPrices(
  oemNumbers: string[]
): Promise<EnrichedPriceResult> {
  const priceMap = new Map<string, { price_without_vat: number; price_with_vat: number; availability: string; name?: string }>();
  const alternativesMap = new Map<string, AlternativePart[]>();
  if (oemNumbers.length === 0) return { priceMap, alternativesMap };

  const unique = [...new Set(oemNumbers.map(normalizeOem))].filter(Boolean);

  // 1. Check DB cache first (Mopar originals)
  const { data: cached } = await supabase
    .from("parts_new")
    .select("oem_number, name, price_without_vat, price_with_vat, availability, last_price_update, catalog_source")
    .in("oem_number", unique);

  // Also check for SAG + AutoKelly alternatives already in DB
  const sagKeys = unique.map(oem => `SAG-${oem}`);
  const akKeys = unique.map(oem => `AK-${oem}`);
  const { data: altCached } = await supabase
    .from("parts_new")
    .select("oem_number, name, price_without_vat, price_with_vat, availability, manufacturer, catalog_source")
    .in("oem_number", [...sagKeys, ...akKeys])
    .gt("price_with_vat", 0);

  // Populate from SAG/AK cache — filter out invalid entries
  if (altCached) {
    for (const s of altCached) {
      const originalOem = s.oem_number.replace(/^(SAG|AK)-/, '');
      if (!alternativesMap.has(originalOem)) alternativesMap.set(originalOem, []);
      // Avoid duplicates
      const existing = alternativesMap.get(originalOem)!;
      const dedupKey = `${s.catalog_source}:${s.name}`;
      if (!existing.some(e => `${e.catalog_source}:${e.name}` === dedupKey)) {
        existing.push({
          name: s.name,
          price_without_vat: s.price_without_vat,
          price_with_vat: s.price_with_vat,
          availability: s.availability || 'unknown',
          manufacturer: s.manufacturer || (s.catalog_source === 'autokelly' ? 'AutoKelly' : 'SAG'),
          catalog_source: s.catalog_source || 'sag',
        });
      }
    }
  }

  const needsFetch: string[] = [];
  for (const oem of unique) {
    const hit = cached?.find(c => c.oem_number === oem);
    if (hit && hit.price_with_vat > 0) {
      priceMap.set(oem, {
        price_without_vat: hit.price_without_vat,
        price_with_vat: hit.price_with_vat,
        availability: hit.availability || "unknown",
        name: hit.name,
      });
    } else {
      needsFetch.push(oem);
    }
  }

  // 2. Fetch missing prices from external catalog (batches of 10)
  if (needsFetch.length > 0) {
    const batches = [];
    for (let i = 0; i < needsFetch.length; i += 10) {
      batches.push(needsFetch.slice(i, i + 10));
    }

    for (const batch of batches) {
      try {
        const { data } = await supabase.functions.invoke("catalog-search", {
          body: { oemCodes: batch },
        });
        if (data?.results) {
          for (const r of data.results) {
            if (!r.found || r.price_with_vat <= 0) continue;

            if (r.catalog_source === 'sag' || r.catalog_source === 'autokelly') {
              // SAG or AutoKelly alternative
              if (!alternativesMap.has(r.oem_number)) alternativesMap.set(r.oem_number, []);
              const existing = alternativesMap.get(r.oem_number)!;
              if (!existing.some(e => e.catalog_source === r.catalog_source && e.name === r.name)) {
                existing.push({
                  name: r.name,
                  price_without_vat: r.price_without_vat,
                  price_with_vat: r.price_with_vat,
                  availability: r.availability || 'available',
                  manufacturer: r.manufacturer || (r.catalog_source === 'autokelly' ? 'AutoKelly' : 'SAG'),
                  catalog_source: r.catalog_source,
                });
              }
            } else {
              // Original (Mopar)
              priceMap.set(r.oem_number, {
                price_without_vat: r.price_without_vat,
                price_with_vat: r.price_with_vat,
                availability: r.availability || "available",
                name: r.name,
              });
            }
          }
        }
      } catch (e) {
        console.error("Price enrichment batch error:", e);
      }
    }
  }

  return { priceMap, alternativesMap };
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

// ---- VIN AI Decode ----

export interface VINDecodeResult {
  basic: {
    vin: string; brand: string; model: string; year: string; trim: string;
    body_class: string; doors: string; drive_type: string;
    engine_displacement: string; engine_cylinders: string; engine_model: string;
    fuel_type: string; transmission: string; plant_country: string; plant_city: string;
    airbags: string;
  };
  enriched: {
    equipment_highlights?: string[];
    engine_specs?: Record<string, any>;
    transmission_specs?: Record<string, any>;
    service_intervals?: Array<{ service_name: string; interval_km: number; interval_months: number; recommended_oem?: string }>;
    common_issues?: string[];
    tire_size?: string;
    brake_info?: Record<string, any>;
  } | null;
}

export async function decodeVINEnriched(vin: string): Promise<VINDecodeResult> {
  const cacheId = normalizeOem(vin);

  // Check localStorage cache (7-day TTL)
  const cached = await cacheGet<VINDecodeResult>('vin_decode', cacheId);
  if (cached) return cached;

  const { data, error } = await supabase.functions.invoke("vin-decode-ai", {
    body: { vin },
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || "VIN decode failed");

  const result = data as VINDecodeResult;
  cacheSet('vin_decode', cacheId, result);
  return result;
}

// ---- OEM Cross-references ----

export interface CrossRefResult {
  oem_number: string;
  part_name?: string;
  superseded_by?: string | null;
  supersedes?: string | null;
  alternatives?: Array<{ manufacturer: string; part_number: string; note?: string }>;
}

export async function getOEMCrossReferences(oemNumber: string, partName?: string): Promise<CrossRefResult | null> {
  const cacheId = normalizeOem(oemNumber);

  // 0. Check localStorage cache (30-day TTL)
  const memoryCached = await cacheGet<CrossRefResult>('oem_crossref', cacheId);
  if (memoryCached) return memoryCached;

  // 1. Check local DB cache first
  const { data: cached } = await supabase
    .from("part_crossref")
    .select("manufacturer, part_number, note")
    .eq("oem_number", cacheId);

  if (cached && cached.length > 0) {
    const result: CrossRefResult = {
      oem_number: oemNumber,
      part_name: partName,
      alternatives: cached.map(c => ({ manufacturer: c.manufacturer, part_number: c.part_number, note: c.note || undefined })),
    };
    cacheSet('oem_crossref', cacheId, result);
    return result;
  }

  // 2. Call backend AI crossref
  const { data, error } = await supabase.functions.invoke("oem-crossref", {
    body: { oem_number: oemNumber, part_name: partName, action: "generate" },
  });
  if (error || !data?.success) return null;

  // 3. Save alternatives to part_crossref for caching
  const result = data as CrossRefResult;
  if (result.alternatives && result.alternatives.length > 0) {
    const rows = result.alternatives.map(alt => ({
      oem_number: cacheId,
      manufacturer: alt.manufacturer,
      part_number: alt.part_number,
      note: alt.note || null,
      source: 'ai',
    }));
    supabase.from("part_crossref").insert(rows).then(() => {});
  }

  cacheSet('oem_crossref', cacheId, result);
  return result;
}

// ---- EPC Diagram ----

export async function getEPCDiagram(
  vehicle: string,
  category: string,
  parts: Array<{ oem_number?: string; part_name?: string }>,
  subcategory?: string
): Promise<string | null> {
  const cacheId = `${vehicle}_${category}_${subcategory || ''}`.replace(/\s+/g, '_');

  // 0. Check localStorage cache (permanent)
  const memoryCached = await cacheGet<string>('diagram', cacheId);
  if (memoryCached) return memoryCached;

  // 1. Check epc_diagrams table
  const [brand, ...modelParts] = vehicle.split(" ");
  const model = modelParts.join(" ");

  const { data: cached } = await supabase
    .from("epc_diagrams" as any)
    .select("svg_content")
    .eq("brand", brand)
    .eq("model", model)
    .eq("category", category)
    .eq("subcategory", subcategory || '')
    .maybeSingle();

  if ((cached as any)?.svg_content) {
    cacheSet('diagram', cacheId, (cached as any).svg_content);
    return (cached as any).svg_content;
  }

  // 2. Generate via AI (edge function also saves to epc_diagrams)
  try {
    const { data, error } = await supabase.functions.invoke("epc-diagram", {
      body: { vehicle, category, subcategory, parts },
    });
    if (error) {
      // Check if error body contains credit exhaustion message
      const errText = typeof error === 'string' ? error : (error?.message || '');
      if (errText.includes('kredity') || errText.includes('402') || errText.includes('503')) {
        console.warn('EPC diagram AI credits exhausted');
      }
      return null;
    }
    if (!data?.success) return null;

    const svg = data.svg || null;
    if (svg) cacheSet('diagram', cacheId, svg);
    return svg;
  } catch (e) {
    console.warn('EPC diagram generation failed:', e);
    return null;
  }
}

// ---- 7zap Scraping ----

export async function scrape7zap(brand: string, model: string, year?: string) {
  if (!brand || !model) return null;
  const { data, error } = await supabase.functions.invoke("scrape-7zap", {
    body: { brand, model, year, action: "scrape-catalog" },
  });
  if (error) throw new Error(error.message);
  return data;
}

/** Generate AI catalog for a brand/model via scrape-7zap edge function */
export async function generateAICatalog(brand: string, model: string, year?: number) {
  if (!brand || !model) return null;
  const { data, error } = await supabase.functions.invoke("scrape-7zap", {
    body: { brand, model, year, action: "generate-catalog" },
  });
  if (error) throw new Error(error.message);
  return data;
}

/** Generate EPC categories only (fast, no timeout) */
export interface EPCGenerateResult {
  success: boolean;
  vehicle: string;
  scraped: boolean;
  cached?: boolean;
  stats: { categories: number; parts: number; queued?: number };
  categories_list: string[];
  error?: string;
}

export async function generateEPCCatalog(
  brand: string, model: string, year?: number, engine?: string
): Promise<EPCGenerateResult> {
  const { data, error } = await supabase.functions.invoke("epc-generate", {
    body: { brand, model, year, engine },
  });
  if (error) {
    // Prefer the actual error message from the response body over the generic SDK message
    const detail = data?.error || error.message;
    throw new Error(detail);
  }
  if (!data?.success) throw new Error(data?.error || "EPC generation failed");
  return data as EPCGenerateResult;
}

/** Generate parts for a specific category (batch, on-demand) */
export interface BatchGenerateResult {
  success: boolean;
  cached?: boolean;
  parts_count: number;
  category: string;
  diagram_queued?: boolean;
}

export async function generatePartsBatch(
  brand: string,
  model: string,
  category: string,
  subcategory?: string,
  engine?: string,
  year?: number,
  queueId?: string
): Promise<BatchGenerateResult> {
  const { data, error } = await supabase.functions.invoke("epc-generate-batch", {
    body: { brand, model, category, subcategory, engine, year, queue_id: queueId },
  });
  if (error) {
    const detail = data?.error || error.message;
    throw new Error(detail);
  }
  if (!data?.success) throw new Error(data?.error || "Batch generation failed");
  return data as BatchGenerateResult;
}

/** Check queue status for a vehicle's part generation */
export async function getQueueStatus(brand: string, model: string): Promise<{
  total: number;
  pending: number;
  processing: number;
  done: number;
  failed: number;
}> {
  const { data } = await supabase
    .from("epc_generation_queue")
    .select("status")
    .eq("brand", brand)
    .eq("model", model);

  const items = data || [];
  return {
    total: items.length,
    pending: items.filter((i: any) => i.status === 'pending').length,
    processing: items.filter((i: any) => i.status === 'processing').length,
    done: items.filter((i: any) => i.status === 'done').length,
    failed: items.filter((i: any) => i.status === 'failed').length,
  };
}

/** Map 7zap URLs for a brand */
export async function map7zapBrand(brand: string, model?: string) {
  const { data, error } = await supabase.functions.invoke("scrape-7zap", {
    body: { brand, model, action: "map" },
  });
  if (error) throw new Error(error.message);
  return data;
}

/** Decode VIN and auto-set catalog filters, optionally save to user_vehicles */
export async function decodeAndSetupVehicle(vin: string, userId?: string) {
  const result = await decodeVINEnriched(vin);
  
  if (userId && result.basic.brand && result.basic.model) {
    const { data: existing } = await supabase
      .from("user_vehicles")
      .select("id")
      .eq("user_id", userId)
      .eq("vin", vin)
      .maybeSingle();

    if (!existing) {
      await supabase.from("user_vehicles").insert({
        user_id: userId,
        brand: result.basic.brand,
        model: result.basic.model,
        year: result.basic.year ? parseInt(result.basic.year) : null,
        engine: [result.basic.engine_displacement, result.basic.engine_cylinders ? `${result.basic.engine_cylinders}V` : ''].filter(Boolean).join(' '),
        vin,
      });
    }
  }

  return result;
}

/**
 * Auto-expand EPC catalog for a vehicle if categories are missing.
 * Now only generates categories (fast). Parts are generated lazily.
 */
export async function autoExpandCatalog(
  brand: string,
  model: string,
  year?: number,
  engine?: string,
  onProgress?: (msg: string) => void
): Promise<{ expanded: boolean; stats?: { categories: number; parts: number } }> {
  const existingCats = await getEPCCategories(brand, model, engine, year);
  if (existingCats.length > 0) {
    return { expanded: false };
  }

  onProgress?.("Katalog pro toto vozidlo chybí – generuji kategorie...");

  try {
    const result = await generateEPCCatalog(brand, model, year, engine);
    return {
      expanded: true,
      stats: { categories: result.stats.categories, parts: 0 },
    };
  } catch (e) {
    console.error("Auto-expand failed:", e);
    try {
      onProgress?.("AI generátor selhal – zkouším externí katalog...");
      await scrape7zap(brand, model, year?.toString());
      const newCats = await getEPCCategories(brand, model, engine, year);
      return { expanded: newCats.length > 0, stats: { categories: newCats.length, parts: 0 } };
    } catch {
      return { expanded: false };
    }
  }
}

