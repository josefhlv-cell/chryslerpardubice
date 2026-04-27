  import { supabase } from "@/integrations/supabase/client";
  
  // --- KONFIGURACE A TYPY ---
  export const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia", "Jeep"] as const;
  
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
  
  // --- POMOCNÉ FUNKCE ---
  const safeNormalize = (val: any): string => {
    if (!val) return "";
    return String(val).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  };
  
  const normalizeOem = (s: string): string => (s || "").toUpperCase().replace(/[\s\-._/]/g, "");
  
  function getRank(source?: string | null): number {
    const s = (source || "").toLowerCase();
    if (s.includes("mopar") || s.includes("oem")) return 1;
    if (s === "jm") return 5;
    return 2;
  }
  
  function normalizeRow(row: any): CatalogPart {
    const source = row?.catalog_source || "mopar";
    const pWithVat = Number(row?.price_with_vat) || null;
    let pWithoutVat = Number(row?.price_without_vat) || (pWithVat ? Math.round((pWithVat / 1.21) * 100) / 100 : null);
    const r = getRank(source);
  
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
      badge_label: r <= 2 ? "ORIGINÁL" : "NÁHRADA",
      rank: r,
    };
  }
  
  // --- API FUNKCE PRO VOZIDLA ---
  export async function fetchBrands(): Promise<string[]> {
    const { data } = await supabase.from("nextis_vehicles").select("brand");
    const uniqueBrands = [...new Set((data || []).map(r => r.brand))];
    return ALLOWED_BRANDS.filter(b => uniqueBrands.includes(b));
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
  
  // --- J+M INTEGRACE (NUTNÉ PRO Catalog.tsx) ---
  export async function fetchJmCategoryTree(opts: any): Promise<CatalogCategoryNode[]> {
    const { data, error } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "getCategoryTree", payload: opts }
    });
    return error ? [] : (data?.data || []);
  }
  
  export async function fetchJmForVehicle(opts: any): Promise<{ items: CatalogPart[]; warning?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke("jm-proxy", {
        body: { action: "searchByVehicle", payload: opts }
      });
      if (error) throw error;
      return { 
        items: (data?.data?.items || []).map((it: any) => ({ ...normalizeRow(it), catalog_source: "jm" })),
        warning: data?.warning 
      };
    } catch { return { items: [] }; }
  }
  
  export async function fetchJmByCodes(codes: string[]): Promise<CatalogPart[]> {
    if (!codes.length) return [];
    const { data, error } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "searchByCodes", payload: { codes } }
    });
    return error ? [] : (data?.data?.items || []).map((it: any) => ({ ...normalizeRow(it), catalog_source: "jm" }));
  }
  
  export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]): CatalogPart[] {
    const map = new Map<string, CatalogPart>();
    oem.forEach(p => map.set(normalizeOem(p.oem_number), p));
    jm.forEach(p => {
      const key = normalizeOem(p.oem_number);
      if (!map.has(key)) map.set(key, p);
    });
    return Array.from(map.values()).sort((a, b) => a.rank - b.rank);
  }
  
  // --- FILTROVÁNÍ DÍLŮ ---
  export async function listPartsForVehicle(opts: {
    brand: string; model: string; engine?: string | null; categoryKeywords?: string[]; page?: number; pageSize?: number;
  }): Promise<{ items: CatalogPart[]; total: number }> {
    const { data, error } = await supabase.from("parts_new_public").select("*")
      .ilike("compatible_vehicles", `%${opts.brand}%`).ilike("compatible_vehicles", `%${opts.model}%`).limit(1000);
  
    if (error) return { items: [], total: 0 };
    let parts = (data || []).map(normalizeRow);
  
    if (opts.categoryKeywords?.length) {
      const kw = opts.categoryKeywords.map(k => safeNormalize(k));
      parts = parts.filter(p => kw.some(k => safeNormalize(`${p.name} ${p.category}`).includes(k)));
    }
  
    const p = opts.page || 0;
    const s = opts.pageSize || 30;
    return { items: parts.slice(p * s, (p + 1) * s), total: parts.length };
  }
  