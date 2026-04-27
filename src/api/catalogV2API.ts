import { supabase } from "@/integrations/supabase/client";

/**
 * CONFIG & TYPES
 */
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

export type NextisVehicle = {
  id: string;
  brand: string;
  model: string;
  engine: string | null;
  year_from?: number | null;
  year_to?: number | null;
};

// --- POMOCNÉ FUNKCE ---

const normalizeOem = (s: string) => 
  (s || "").toUpperCase().replace(/[\s\-._/]/g, "");

function normalizeRow(row: any): CatalogPart {
  const source = (row?.catalog_source || "mopar").toLowerCase();
  const isOem = ["mopar", "mopar_oem", "epc", "7zap", "epc-ai", "csv"].includes(source);
  
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

// --- API PRO VOZIDLA ---

export async function fetchBrands(): Promise<string[]> {
  const { data } = await supabase.from("nextis_vehicles").select("brand");
  const unique = [...new Set((data || []).map((r) => r.brand))];
  return ALLOWED_BRANDS.filter((b) => unique.includes(b));
}

export async function fetchModelsForBrand(brand: string): Promise<string[]> {
  const { data } = await supabase
    .from("nextis_vehicles")
    .select("model")
    .eq("brand", brand);
  return [...new Set((data || []).map((r) => r.model))].sort();
}

export async function fetchEnginesForModel(brand: string, model: string): Promise<string[]> {
  const { data } = await supabase
    .from("nextis_vehicles")
    .select("engine")
    .eq("brand", brand)
    .eq("model", model);
  return [...new Set((data || []).map((r) => r.engine))].sort();
}

export async function fetchNextisVehicles(brand: string, model: string): Promise<NextisVehicle[]> {
  const { data } = await supabase
    .from("nextis_vehicles")
    .select("*")
    .eq("brand", brand)
    .eq("model", model);
  return (data || []) as NextisVehicle[];
}

// --- J+M INTEGRACE ---

export async function fetchJmCategoryTree(opts: any): Promise<CatalogCategoryNode[]> {
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "getCategoryTree", payload: opts },
    });
    return data?.data || [];
  } catch {
    return [];
  }
}

export async function fetchJmForVehicle(opts: any): Promise<{ items: CatalogPart[]; warning?: string }> {
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "searchByVehicle", payload: opts },
    });
    return {
      items: (data?.data?.items || []).map((it: any) => normalizeRow(it)),
      warning: data?.warning,
    };
  } catch {
    return { items: [] };
  }
}

export async function fetchJmByCodes(codes: string[]): Promise<CatalogPart[]> {
  if (!codes?.length) return [];
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "searchByCodes", payload: { codes } },
    });
    return (data?.data?.items || []).map((it: any) => normalizeRow(it));
  } catch {
    return [];
  }
}

export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]): CatalogPart[] {
  const map = new Map<string, CatalogPart>();
  (oem || []).forEach((p) => map.set(normalizeOem(p.oem_number), p));
  (jm || []).forEach((p) => {
    const key = normalizeOem(p.oem_number);
    if (!map.has(key)) map.set(key, p);
  });
  return Array.from(map.values()).sort((a, b) => a.rank - b.rank);
}

// --- HLAVNÍ VÝPIS A VYHLEDÁVÁNÍ ---

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
  const { data } = await supabase
    .from("parts_new_public")
    .select("*")
    .ilike("compatible_vehicles", `%${opts.brand}%`)
    .ilike("compatible_vehicles", `%${opts.model}%`)
    .limit(1000);

  const allParts = (data || []).map(normalizeRow);

  let filtered = allParts;
  if (opts.categoryKeywords?.length) {
    const kws = opts.categoryKeywords.map((k) => k.toLowerCase());
    filtered = allParts.filter((p) => {
      const searchStr = `${p.name} ${p.category} ${p.description}`.toLowerCase();
      return kws.some((kw) => searchStr.includes(kw));
    });
  }

  const page = opts.page || 0;
  const size = opts.pageSize || 30;

  return {
    items: filtered.slice(page * size, (page + 1) * size),
    total: filtered.length,
  };
}

/** * Tato funkce doplňuje chybějící export pro obecné hledání, 
 * pokud není zvoleno konkrétní auto.
 */
export async function listParts(filter: any): Promise<{ items: CatalogPart[]; total: number }> {
  const page = filter.page || 0;
  const pageSize = filter.pageSize || 30;

  if (filter.brand && filter.model) {
    return listPartsForVehicle(filter);
  }

  let q = supabase.from("parts_new_public").select("*", { count: "exact" });
  if (filter.search) {
    q = q.or(`oem_number.ilike.%${filter.search}%,name.ilike.%${filter.search}%`);
  }

  const { data, error, count } = await q.range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) return { items: [], total: 0 };

  return {
    items: (data || []).map(normalizeRow),
    total: count || 0,
  };
}
