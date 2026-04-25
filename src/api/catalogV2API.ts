/**
 * CATALOG V3 — CLEAN PRODUCTION VERSION (LOVABLE READY)
 * -----------------------------------------------------
 * OEM-first autoservis katalog
 * Sources:
 * - OEM: mopar / EPC / 7zap / jm OEM feed
 * - Aftermarket: J+M (via supabase function)
 * - Pricing: CSV sync (vernostsevyplaci - NO API)
 */

import { supabase } from "@/integrations/supabase/client";

// ======================================================
// CONFIG
// ======================================================

const ALLOWED_SOURCES = ["mopar", "epc-ai", "7zap", "epc-link", "ai-epc", "jm"] as const;
export const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"] as const;

const PAGE = 1000;

// ======================================================
// TYPES
// ======================================================

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

// ======================================================
// HELPERS
// ======================================================

function rank(source?: string): number {
  const s = (source || "").toLowerCase();
  if (s === "mopar") return 1;
  if (["epc-ai", "7zap", "epc-link", "ai-epc"].includes(s)) return 2;
  if (s === "jm") return 5;
  return 9;
}

function badge(source?: string): CatalogPart["badge_label"] {
  const r = rank(source);
  if (r <= 2) return "ORIGINÁL";
  if (r === 5) return "NÁHRADA";
  return "NEZNÁMÝ";
}

function normalize(row: any): CatalogPart {
  const source = row.catalog_source || "mopar";

  const priceWithVat =
    row.price_with_vat != null ? Number(row.price_with_vat) : null;

  const priceWithoutVat =
    row.price_without_vat != null
      ? Number(row.price_without_vat)
      : priceWithVat
        ? Math.round(priceWithVat / 1.21 * 100) / 100
        : null;

  return {
    id: row.id,
    oem_number: row.oem_number,
    name: row.name,
    manufacturer: row.manufacturer,
    catalog_source: source,
    price_without_vat: priceWithoutVat,
    price_with_vat: priceWithVat,
    availability: row.availability,
    image_urls: row.image_urls,
    category: row.category,
    description: row.description,
    is_oem: rank(source) <= 2,
    badge_label: badge(source),
    rank: rank(source),
  };
}

// ======================================================
// LISTING CORE
// ======================================================

export async function listParts(filter: {
  brand?: string;
  model?: string;
  engine?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = filter.page ?? 0;
  const pageSize = filter.pageSize ?? 30;

  const from = page * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("parts_new_public")
    .select("*", { count: "exact" })
    .in("catalog_source", ALLOWED_SOURCES as unknown as string[]);

  if (filter.brand) q = q.ilike("compatible_vehicles", `%${filter.brand}%`);
  if (filter.model) q = q.ilike("compatible_vehicles", `%${filter.model}%`);
  if (filter.engine) q = q.ilike("compatible_vehicles", `%${filter.engine}%`);

  if (filter.search) {
    const t = filter.search.trim();
    q = q.or(`oem_number.ilike.%${t}%,name.ilike.%${t}%`);
  }

  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);

  const items = (data || []).map(normalize);

  // OEM FIRST
  items.sort((a, b) => a.rank - b.rank);

  return {
    items,
    total: count || 0,
  };
}

// ======================================================
// J+M API (via Supabase Function)
// ======================================================

type JmRaw = {
  oem_number?: string;
  name?: string;
  brand?: string;
  price_with_vat?: number;
  price_without_vat?: number;
  stock?: number;
  availability?: string;
};

function jmNormalize(it: JmRaw): CatalogPart {
  const pw = it.price_with_vat ?? null;

  return {
    id: `jm:${it.oem_number}`,
    oem_number: it.oem_number || "",
    name: it.name || it.oem_number || "—",
    manufacturer: it.brand || "J+M",
    catalog_source: "jm",
    price_without_vat: it.price_without_vat ?? (pw ? pw / 1.21 : null),
    price_with_vat: pw,
    availability: it.availability || (it.stock ? "in_stock" : "unknown"),
    image_urls: null,
    category: null,
    description: null,
    is_oem: false,
    badge_label: "NÁHRADA",
    rank: 5,
  };
}

export async function fetchJmByCode(code: string): Promise<CatalogPart[]> {
  const { data, error } = await supabase.functions.invoke("jm-proxy", {
    body: {
      action: "searchByCode",
      payload: { code },
    },
  });

  if (error || !data?.success) return [];

  return (data.data?.items || []).map(jmNormalize);
}

// ======================================================
// MERGE OEM + J+M
// ======================================================

export function mergeParts(oem: CatalogPart[], jm: CatalogPart[]) {
  const seen = new Set<string>();

  const filteredJm = jm.filter((p) => {
    const key = p.oem_number;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return [...oem, ...filteredJm].sort((a, b) => a.rank - b.rank);
}

// ======================================================
// VĚRNOSTSEVYPLACÍ (CSV SYNC - NO API)
// ======================================================
// ⚠️ tohle není API – jen placeholder pro import CSV dat

export async function syncPricesFromCsv(rows: any[]) {
  // rows = CSV parsed data
  const updates = rows.map((r) => ({
    oem_number: r.oem,
    price_with_vat: Number(r.price),
  }));

  for (const u of updates) {
    await supabase
      .from("parts_new_public")
      .update({ price_with_vat: u.price_with_vat })
      .eq("oem_number", u.oem_number);
  }

  return { updated: updates.length };
}

// ======================================================
// BRANDS
// ======================================================

export async function fetchBrands(): Promise<string[]> {
  const { data } = await supabase
    .from("nextis_vehicles")
    .select("brand")
    .in("brand", ALLOWED_BRANDS as any);

  const set = new Set((data || []).map((r: any) => r.brand));

  return ALLOWED_BRANDS.filter((b) => set.has(b));
}