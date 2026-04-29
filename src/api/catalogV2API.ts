import { supabase } from "@/integrations/supabase/client";

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
  is_oem: boolean;
  badge_label: "ORIGINÁL" | "NÁHRADA" | "NEZNÁMÝ";
  rank: number;
  technical_parameters?: Record<string, any> | null;
  compatible_vehicles?: string[] | null;
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

// Backwards-compat alias used by older components
export type CategoryNode = CatalogCategoryNode;

export type NextisVehicle = {
  id: string;
  brand: string;
  model: string;
  engine: string | null;
  year_from?: number | null;
  year_to?: number | null;
};

// Legacy global OEM search (used by GlobalOEMSearch component)
export async function globalOemSearch(query: string): Promise<CatalogPart[]> {
  const q = (query || "").trim();
  if (!q) return [];
  const { data } = await supabase
    .from("parts_new")
    .select("*")
    .or(`oem_number.ilike.%${q}%,name.ilike.%${q}%`)
    .limit(50);
  return (data || []).map(normalizeRow);
}

const normalizeOem = (s: string) => (s || "").toUpperCase().replace(/[\s\-._/]/g, "");

function normalizeRow(row: any): CatalogPart {
  const source = (row?.catalog_source || "mopar").toLowerCase();
  const isOem = ["mopar", "mopar_oem", "epc", "7zap", "epc-ai", "csv"].includes(source);
  return {
    id: String(row?.id || Math.random()),
    oem_number: String(row?.oem_number || ""),
    name: String(row?.name || row?.oem_number || "Díl"),
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

export async function fetchJmCategoryTree(opts: any) {
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", { body: { action: "getCategoryTree", payload: opts } });
    return data?.data || [];
  } catch { return []; }
}

export async function fetchJmForVehicle(opts: any) {
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", { body: { action: "searchByVehicle", payload: opts } });
    return { items: (data?.data?.items || []).map((it: any) => normalizeRow(it)), warning: data?.warning };
  } catch { return { items: [] }; }
}

export async function fetchJmByCodes(codes: string[]) {
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", { body: { action: "searchByCodes", payload: { codes } } });
    return (data?.data?.items || []).map((it: any) => normalizeRow(it));
  } catch { return []; }
}

export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]) {
  const map = new Map<string, CatalogPart>();
  (oem || []).forEach(p => map.set(normalizeOem(p.oem_number), p));
  (jm || []).forEach(p => {
    const key = normalizeOem(p.oem_number);
    if (!map.has(key)) map.set(key, p);
  });
  return Array.from(map.values()).sort((a, b) => a.rank - b.rank);
}

export async function listPartsForVehicle(opts: any) {
  const { data } = await supabase.from("parts_new_public").select("*")
    .ilike("compatible_vehicles", `%${opts.brand}%`).ilike("compatible_vehicles", `%${opts.model}%`).limit(200);
  const items = (data || []).map(normalizeRow);
  return { items, total: items.length };
}
