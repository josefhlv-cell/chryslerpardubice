/**
 * CATALOG V4 — Production-grade engine (REVISED)
 * -----------------------------------------------------
 * Fixes:
 * - Strict regex-based keyword matching (\b boundaries).
 * - J+M technical parameters mapping to description.
 * - Removed aggressive fallbacks that caused "category bleeding".
 */

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
};

const normalize = (s: string): string =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function partMatchesKeywords(part: CatalogPart, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;
  const haystack = normalize(`${part.name} ${part.description || ""} ${part.category || ""}`);
  return keywords.some((kw) => {
    const nKw = normalize(kw);
    const regex = new RegExp(`(^|\\s|\\/|\\-)${nKw}`, "i");
    return regex.test(haystack);
  });
}

function jmNormalize(it: any): CatalogPart {
  const pw = Number(it.price_with_vat) || null;
  const techParams = it.technical_parameters 
    ? Object.entries(it.technical_parameters).map(([k, v]) => `${k}: ${v}`).join(" | ")
    : "";

  return {
    id: `jm:${it.oem_number}`,
    oem_number: String(it.oem_number || ""),
    name: String(it.name || "—"),
    manufacturer: it.manufacturer || it.brand || "J+M",
    catalog_source: "jm",
    price_without_vat: it.price_without_vat || (pw ? Math.round(pw / 1.21 * 100) / 100 : null),
    price_with_vat: pw,
    availability: it.availability || "Na dotaz",
    image_urls: Array.isArray(it.image_urls) ? it.image_urls : (it.image ? [it.image] : null),
    category: it.category || null,
    description: it.description || techParams || null,
    is_oem: false,
    badge_label: "NÁHRADA",
    rank: 5
  };
}

function normalizeRow(row: any): CatalogPart {
  return {
    id: String(row.id),
    oem_number: String(row.oem_number || ""),
    name: String(row.name || "—"),
    manufacturer: row.manufacturer || null,
    catalog_source: row.catalog_source || "mopar",
    price_without_vat: Number(row.price_without_vat) || null,
    price_with_vat: Number(row.price_with_vat) || null,
    availability: row.availability || null,
    image_urls: row.image_urls || null,
    category: row.category || null,
    description: row.description || null,
    is_oem: true,
    badge_label: "ORIGINÁL",
    rank: 1
  };
}

export async function fetchBrands() {
  const { data } = await supabase.from("nextis_vehicles").select("brand");
  return [...new Set((data || []).map(r => r.brand))].filter(b => ALLOWED_BRANDS.includes(b as any)).sort();
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
  return data || [];
}

export async function fetchJmCategoryTree(opts: any) {
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "getCategoryTree", payload: opts },
    });
    return data?.success ? data.data : [];
  } catch { return []; }
}

export async function listPartsForVehicle(opts: any) {
  const { data } = await supabase.from("parts_new_public").select("*")
    .ilike("compatible_vehicles", `%${opts.brand}%`)
    .ilike("compatible_vehicles", `%${opts.model}%`);
  const parts = (data || []).map(normalizeRow);
  const filtered = parts.filter(p => partMatchesKeywords(p, opts.categoryKeywords || []));
  return { items: filtered, total: filtered.length };
}

export async function fetchJmForVehicle(opts: any) {
  if (!opts.nextisVehicleId) return { items: [] };
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "searchByVehicle", payload: opts },
    });
    const items = (data?.data?.items || []).map(jmNormalize);
    const filtered = items.filter((p: any) => partMatchesKeywords(p, opts.categoryKeywords || []));
    return { items: filtered };
  } catch { return { items: [] }; }
}

export async function fetchJmByCodes(codes: string[]) {
  if (!codes.length) return [];
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "searchByCodes", payload: { codes } },
    });
    return (data?.data || []).map(jmNormalize);
  } catch { return []; }
}

export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]): CatalogPart[] {
  const oemKeys = new Set(oem.map(p => p.oem_number.replace(/[\s\-]/g, "").toUpperCase()));
  const filteredJm = jm.filter(p => !oemKeys.has(p.oem_number.replace(/[\s\-]/g, "").toUpperCase()));
  return [...oem, ...filteredJm].sort((a, b) => a.rank - b.rank);
}

