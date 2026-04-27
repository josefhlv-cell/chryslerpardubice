  /**
   * CATALOG V4 — Production-grade engine.
   * -----------------------------------------------------
   * Sjednocená verze s podporou pro J+M a Nextis vozidla.
   */
  
  import { supabase } from "@/integrations/supabase/client";
  
  // =============================================================
  // CONFIG & TYPES
  // =============================================================
  
  export const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia", "Jeep"] as const;
  const ALLOWED_OEM_SOURCES = ["mopar", "mopar_oem", "epc-ai", "7zap", "epc-link", "ai-epc", "csv"] as const;
  const PAGE_SIZE_MAX = 100;
  
  export type CatalogPart = {
    id: string;
    oem_number: string;
    name: string;
    manufacturer: string | null;
    catalog_source: string;
    price_without_vat: number | null;
    price_with_vat: number | null;
    availability: string | null;
    image_urls: string[] | null;
    category: string | null;
    description: string | null;
    compatible_vehicles?: string | null;
    technical_parameters?: Record<string, string> | null;
    related_oem_number?: string | null;
    searched_code?: string | null;
    is_oem: boolean;
    badge_label: "ORIGINÁL" | "NÁHRADA" | "NEZNÁMÝ";
    rank: number;
  };
  
  export type NextisVehicle = {
    id: string;
    brand: string;
    model: string;
    engine: string | null;
    year_from: number | null;
    year_to: number | null;
  };
  
  export type CatalogCategoryNode = {
    id: string;
    label: string;
    path: string[];
    keywords: string[];
    count: number;
    sectionId?: number | null;
    children: CatalogCategoryNode[];
  };
  
  // =============================================================
  // HELPERS
  // =============================================================
  
  const safeNormalize = (val: any): string => {
    if (!val) return "";
    return String(val)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  };
  
  const normalizeOem = (s: string): string =>
    (s || "").toUpperCase().replace(/[\s\-._/]/g, "");
  
  function rank(source?: string | null): number {
    const s = (source || "").toLowerCase();
    if (s === "mopar" || s === "mopar_oem") return 1;
    if (["epc-ai", "7zap", "epc-link", "ai-epc", "csv"].includes(s)) return 2;
    if (s === "jm") return 5;
    return 9;
  }
  
  function normalizeRow(row: any): CatalogPart {
    const source = row?.catalog_source || "mopar";
    const pWithVat = Number(row?.price_with_vat) || null;
    let pWithoutVat = Number(row?.price_without_vat) || null;
  
    if (!pWithoutVat && pWithVat) {
      pWithoutVat = Math.round((pWithVat / 1.21) * 100) / 100;
    }
  
    const r = rank(source);
  
    return {
      id: String(row?.id || Math.random()),
      oem_number: String(row?.oem_number || ""),
      name: String(row?.name || row?.oem_number || "Bez názvu"),
      manufacturer: row?.manufacturer ?? null,
      catalog_source: source,
      price_without_vat: pWithoutVat,
      price_with_vat: pWithVat,
      availability: row?.availability ?? null,
      image_urls: Array.isArray(row?.image_urls) ? row.image_urls : null,
      category: row?.category ?? null,
      description: row?.description ?? null,
      compatible_vehicles: row?.compatible_vehicles ?? null,
      technical_parameters: row?.technical_parameters ?? null,
      is_oem: r <= 2,
      badge_label: r <= 2 ? "ORIGINÁL" : (r === 5 ? "NÁHRADA" : "NEZNÁMÝ"),
      rank: r,
    };
  }
  
  // =============================================================
  // VEHICLE API
  // =============================================================
  
  export async function fetchBrands(): Promise<string[]> {
    const { data } = await supabase.from("nextis_vehicles").select("brand");
    const brands = new Set((data || []).map(r => r.brand).filter(Boolean));
    return ALLOWED_BRANDS.filter(b => brands.has(b));
  }
  
  export async function fetchModelsForBrand(brand: string): Promise<string[]> {
    const { data } = await supabase.from("nextis_vehicles").select("model").eq("brand", brand);
    return [...new Set((data || []).map(r => r.model))].sort();
  }
  
  export async function fetchEnginesForModel(brand: string, model: string): Promise<string[]> {
    const { data } = await supabase.from("nextis_vehicles").select("engine").eq("brand", brand).eq("model", model);
    return [...new Set((data || []).map(r => r.engine))].sort();
  }
  
  export async function fetchNextisVehicles(brand: string, model: string): Promise<NextisVehicle[]> {
    const { data } = await supabase.from("nextis_vehicles").select("*").eq("brand", brand).eq("model", model);
    return (data || []) as NextisVehicle[];
  }
  
  // =============================================================
  // J+M & CATEGORY API (Doplněno pro Catalog.tsx)
  // =============================================================
  
  export async function fetchJmCategoryTree(opts: {
    nextisVehicleId: string;
    brand: string;
    model: string;
    engine: string;
  }): Promise<CatalogCategoryNode[]> {
    try {
      const { data, error } = await supabase.functions.invoke("jm-proxy", {
        body: { action: "getCategoryTree", payload: opts },
      });
      if (error) throw error;
      return data?.data || [];
    } catch (err) {
      console.error("fetchJmCategoryTree error:", err);
      return [];
    }
  }
  
  export async function fetchJmForVehicle(opts: any): Promise<{ items: CatalogPart[]; warning?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke("jm-proxy", {
        body: { action: "searchByVehicle", payload: opts },
      });
      if (error) throw error;
      const items = (data?.data?.items || []).map((it: any) => ({
        ...normalizeRow(it),
        catalog_source: "jm",
        rank: 5
      }));
      return { items, warning: data?.warning };
    } catch (err: any) {
      return { items: [], warning: "J+M služba je dočasně nedostupná." };
    }
  }
  
  export async function fetchJmByCodes(codes: string[]): Promise<CatalogPart[]> {
    if (!codes.length) return [];
    try {
      const { data, error } = await supabase.functions.invoke("jm-proxy", {
        body: { action: "searchByCodes", payload: { codes } },
      });
      if (error) throw error;
      return (data?.data?.items || []).map((it: any) => ({
        ...normalizeRow(it),
        catalog_source: "jm",
        rank: 5
      }));
    } catch {
      return [];
    }
  }
  
  export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]): CatalogPart[] {
    const map = new Map<string, CatalogPart>();
    // OEM má přednost
    oem.forEach(p => map.set(normalizeOem(p.oem_number), p));
    // J+M doplní to, co chybí, nebo aktualizuje cenu u existujících OEM pokud je to stejný kód
    jm.forEach(p => {
      const key = normalizeOem(p.oem_number);
      if (!map.has(key)) {
        map.set(key, p);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.rank - b.rank);
  }
  
  // =============================================================
  // MAIN LISTING API
  // =============================================================
  
  export async function listPartsForVehicle(opts: {
    brand: string;
    model: string;
    engine?: string | null;
    categoryKeywords?: string[];
    page?: number;
    pageSize?: number;
    nextisVehicleId?: string;
    canonicalCategory?: string;
  }): Promise<{ items: CatalogPart[]; total: number }> {
    const { data, error } = await supabase
      .from("parts_new_public")
      .select("*")
      .ilike("compatible_vehicles", `%${opts.brand}%`)
      .ilike("compatible_vehicles", `%${opts.model}%`)
      .limit(1000);
  
    if (error) return { items: [], total: 0 };
  
    let parts = (data || []).map(normalizeRow);
  
    if (opts.categoryKeywords?.length) {
      const kw = opts.categoryKeywords.map(k => safeNormalize(k));
      parts = parts.filter(p => {
        const h = safeNormalize(`${p.name} ${p.category} ${p.description}`);
        return kw.some(k => h.includes(k));
      });
    }
  
    const p = opts.page || 0;
    const s = opts.pageSize || 30;
    return {
      items: parts.slice(p * s, (p + 1) * s),
      total: parts.length
    };
  }
  
  export async function listParts(filter: any): Promise<{ items: CatalogPart[]; total: number }> {
    if (filter.brand && filter.model) {
      return listPartsForVehicle(filter);
    }
    let q = supabase.from("parts_new_public").select("*", { count: "exact" });
    if (filter.search) {
      q = q.or(`oem_number.ilike.%${filter.search}%,name.ilike.%${filter.search}%`);
    }
    const page = filter.page || 0;
    const size = filter.pageSize || 30;
    const { data, error, count } = await q.range(page * size, (page + 1) * size - 1);
    if (error) return { items: [], total: 0 };
    return { items: (data || []).map(normalizeRow), total: count || 0 };
  }
  