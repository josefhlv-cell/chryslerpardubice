  import { supabase } from "@/integrations/supabase/client";
  
  // --- KONFIGURACE ---
  export const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia", "Jeep"] as const;
  
  // --- TYPY (Důležité pro Catalog.tsx) ---
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
    is_oem: boolean;
    badge_label: "ORIGINÁL" | "NÁHRADA" | "NEZNÁMÝ";
    rank: number;
  };
  
  export type NextisVehicle = {
    id: string;
    brand: string;
    model: string;
    engine: string | null;
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
  
  // --- POMOCNÍCI ---
  const normalizeOem = (s: string) => (s || "").toUpperCase().replace(/[\s\-._/]/g, "");
  
  function normalizeRow(row: any): CatalogPart {
    const source = row?.catalog_source || "mopar";
    const isOem = ["mopar", "mopar_oem", "epc", "7zap"].includes(source.toLowerCase());
    return {
      id: String(row?.id || Math.random()),
      oem_number: String(row?.oem_number || ""),
      name: String(row?.name || row?.oem_number || "Bez názvu"),
      manufacturer: row?.manufacturer ?? null,
      catalog_source: source,
      price_without_vat: Number(row?.price_without_vat) || null,
      price_with_vat: Number(row?.price_with_vat) || null,
      availability: row?.availability ?? null,
      image_urls: Array.isArray(row?.image_urls) ? row.image_urls : null,
      category: row?.category ?? null,
      description: row?.description ?? null,
      is_oem: isOem,
      badge_label: isOem ? "ORIGINÁL" : "NÁHRADA",
      rank: isOem ? 1 : 5,
    };
  }
  
  // --- FUNKCE PRO VOZIDLA ---
  export async function fetchBrands() {
    const { data } = await supabase.from("nextis_vehicles").select("brand");
    const unique = [...new Set((data || []).map(r => r.brand))];
    return ALLOWED_BRANDS.filter(b => unique.includes(b));
  }
  
  export async function fetchModelsForBrand(brand: string) {
    const { data } = await supabase.from("nextis_vehicles").select("model").eq("brand", brand);
    return [...new Set((data || []).map(r => r.model))].sort();
  }
  
  export async function fetchEnginesForModel(brand: string, model: string) {
    const { data } = await supabase.from("nextis_vehicles").select("engine").eq("brand", brand).eq("model", model);
    return [...new Set((data || []).map(r => r.engine))].sort();
  }
  
  export async function fetchNextisVehicles(brand: string, model: string) {
    const { data } = await supabase.from("nextis_vehicles").select("*").eq("brand", brand).eq("model", model);
    return (data || []) as NextisVehicle[];
  }
  
  // --- FUNKCE PRO J+M (Zde byla nejčastěji chyba) ---
  export async function fetchJmCategoryTree(opts: any) {
    const { data } = await supabase.functions.invoke("jm-proxy", { body: { action: "getCategoryTree", payload: opts } });
    return data?.data || [];
  }
  
  export async function fetchJmForVehicle(opts: any) {
    const { data } = await supabase.functions.invoke("jm-proxy", { body: { action: "searchByVehicle", payload: opts } });
    return { items: (data?.data?.items || []).map((it: any) => normalizeRow(it)), warning: data?.warning };
  }
  
  export async function fetchJmByCodes(codes: string[]) {
    const { data } = await supabase.functions.invoke("jm-proxy", { body: { action: "searchByCodes", payload: { codes } } });
    return (data?.data?.items || []).map((it: any) => normalizeRow(it));
  }
  
  export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]) {
    const map = new Map();
    oem.forEach(p => map.set(normalizeOem(p.oem_number), p));
    jm.forEach(p => { if (!map.has(normalizeOem(p.oem_number))) map.set(normalizeOem(p.oem_number), p); });
    return Array.from(map.values()).sort((a: any, b: any) => a.rank - b.rank);
  }
  
  // --- HLAVNÍ VÝPIS ---
  export async function listPartsForVehicle(opts: any) {
    const { data } = await supabase.from("parts_new_public").select("*")
      .ilike("compatible_vehicles", `%${opts.brand}%`).ilike("compatible_vehicles", `%${opts.model}%`).limit(100);
    const items = (data || []).map(normalizeRow);
    return { items, total: items.length };
  }
  