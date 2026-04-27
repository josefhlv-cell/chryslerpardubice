/**
 * CATALOG V4 — Production-grade engine.
 * -----------------------------------------------------
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

// =============================================================
// HELPERS (Defenzivní programování)
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
  return 5;
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
    badge_label: r <= 2 ? "ORIGINÁL" : "NÁHRADA",
    rank: r,
  };
}

// =============================================================
// LOGIC (OPRAVENO)
// =============================================================

function partMatchesKeywords(part: CatalogPart, keywords: string[]): boolean {
  if (!keywords?.length) return true;

  const haystack = safeNormalize(`${part.name} ${part.category} ${part.description}`);
  const cat = safeNormalize(part.category);

  return keywords.some(kw => {
    const nKw = safeNormalize(kw);
    return cat.includes(nKw) || haystack.includes(nKw);
  });
}

function dedupeByOem(parts: CatalogPart[]): CatalogPart[] {
  const seen = new Set<string>();
  return parts.filter(p => {
    const key = normalizeOem(p.oem_number);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// =============================================================
// API EXPORTS
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

export async function listPartsForVehicle(opts: {
  brand: string;
  model: string;
  engine?: string | null;
  categoryKeywords?: string[];
  page?: number;
  pageSize?: number;
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
    parts = parts.filter(p => partMatchesKeywords(p, opts.categoryKeywords!));
  }

  parts = dedupeByOem(parts).sort((a, b) => a.rank - b.rank);
  const p = opts.page || 0;
  const s = opts.pageSize || 30;

  return {
    items: parts.slice(p * s, (p + 1) * s),
    total: parts.length
  };
}

export async function listParts(filter: {
  brand?: string;
  model?: string;
  engine?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: CatalogPart[]; total: number }> {
  const page = filter.page || 0;
  const pageSize = filter.pageSize || 30;

  if (filter.brand && filter.model) {
    return listPartsForVehicle({
      brand: filter.brand,
      model: filter.model,
      engine: filter.engine,
      categoryKeywords: filter.search ? [filter.search] : [],
      page,
      pageSize
    });
  }

  let q = supabase.from("parts_new_public").select("*", { count: "exact" });
  if (filter.search) {
    q = q.or(`oem_number.ilike.%${filter.search}%,name.ilike.%${filter.search}%`);
  }

  const { data, error, count } = await q.range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) return { items: [], total: 0 };

  return {
    items: (data || []).map(normalizeRow),
    total: count || 0
  };
}
