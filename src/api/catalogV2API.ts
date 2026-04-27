/**
 * CATALOG V4 — Production-grade engine.
 * -----------------------------------------------------
 * Sources:
 * • OEM (rank 1): mopar / epc / 7zap (parts_new_public)
 * • Aftermarket (rank 5): J+M via jm-proxy edge function
 * • Pricing: CSV-only (vernostsevyplaci) — never an API
 *
 * Vehicle filtering: nextis_vehicles is the single source of truth
 * for Brand → Model → Engine. compatible_vehicles is only used as a
 * downstream text fallback when joining parts to vehicles.
 */

import { supabase } from "@/integrations/supabase/client";

// =============================================================
// CONFIG
// =============================================================

export const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia", "Jeep"] as const;

const ALLOWED_OEM_SOURCES = ["mopar", "mopar_oem", "epc-ai", "7zap", "epc-link", "ai-epc", "csv"] as const;

const PAGE_SIZE_MAX = 100;
const VEHICLE_LIST_LIMIT = 500;

// =============================================================
// TYPES
// =============================================================

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
  external_id?: string | null;
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
// CATEGORY TREE (CS)
// =============================================================

type SeedCategory = {
  id: string;
  label: string;
  keywords: string[];
  sectionId?: number;
  children?: SeedCategory[];
};

const DEFAULT_CATEGORY_TREE: SeedCategory[] = [
  {
    id: "brakes",
    label: "Brzdové zařízení",
    keywords: ["brake", "brzd", "bremsbelag", "bremsscheibe", "bremssattel", "bremsschlauch"],
    sectionId: 100,
    children: [
      { id: "brake-pads",     label: "Brzdové destičky", sectionId: 402, keywords: ["brake pad", "pads", "destic", "brzdov\u00e1 desti", "brzdove desti", "p\u0159edn\u00ed brzd", "predni brzd", "zadn\u00ed brzd", "zadni brzd", "bremsbelag"] },
      { id: "brake-discs",    label: "Brzdové kotouče",  sectionId: 82,  keywords: ["brake disc", "rotor", "kotou\u010d", "kotouc", "brzdov\u00fd kotou", "brzdovy kotou", "bremsscheibe"] },
      { id: "brake-hoses",    label: "Brzdové hadice",   sectionId: 95,  keywords: ["brake hose", "brzdov\u00e1 hadice", "hadice brzd", "bremsschlauch"] },
      { id: "brake-calipers", label: "Brzdové třmeny",   sectionId: 472, keywords: ["caliper", "tr\u017emen", "trmen", "bremssattel"] },
    ],
  },
  {
    id: "engine",
    label: "Motor",
    keywords: ["engine", "motor", "zahnriemen", "wasserpumpe", "zuendkerze", "nockenwelle", "kurbelwelle", "kolben"],
    children: [
      { id: "engine-oil",  label: "Motorový olej",      sectionId: 7595, keywords: ["engine oil", "motorov\u00fd olej", "motorovy olej", "oelfilter"] },
      { id: "spark-plugs", label: "Zapalovací svíčky",  sectionId: 18,   keywords: ["spark plug", "zapalovac\u00ed sv\u00ed\u010dka", "zapalovaci svicka", "zuendkerze"] },
      { id: "timing-belt", label: "Rozvodový řemen",    sectionId: 213,  keywords: ["timing belt", "rozvodov\u00fd \u0159emen", "rozvodovy remen", "zahnriemen"] },
      { id: "water-pump",  label: "Vodní čerpadlo",     sectionId: 50,   keywords: ["water pump", "vodn\u00ed \u010derpadlo", "vodni cerpadlo", "wasserpumpe"] },
    ],
  },
  {
    id: "filters",
    label: "Filtry",
    keywords: ["filter", "filtr", "oelfilter", "luftfilter", "kraftstoffilter"],
    children: [
      { id: "oil-filter",   label: "Olejový filtr",   sectionId: 22,  keywords: ["oil filter", "olejov\u00fd filtr", "olejovy filtr", "oelfilter"] },
      { id: "air-filter",   label: "Vzduchový filtr", sectionId: 26,  keywords: ["air filter", "vzduchov\u00fd filtr", "vzduchovy filtr", "luftfilter"] },
      { id: "cabin-filter", label: "Kabinový filtr",  sectionId: 350, keywords: ["cabin filter", "pollen filter", "kabinov\u00fd filtr", "kabinovy filtr"] },
      { id: "fuel-filter",  label: "Palivový filtr",  sectionId: 23,  keywords: ["fuel filter", "palivov\u00fd filtr", "palivovy filtr", "kraftstoffilter"] },
    ],
  },
  {
    id: "suspension",
    label: "Odpružení",
    keywords: ["suspension", "odpru\u017een", "odpruzen", "tlumi\u010d", "tlumic", "stossdaempfer", "feder"],
    children: [
      { id: "shock-absorbers", label: "Tlumiče",        sectionId: 51,  keywords: ["shock absorber", "tlumi\u010d", "tlumic", "stossdaempfer"] },
      { id: "control-arms",    label: "Ramena nápravy", sectionId: 423, keywords: ["control arm", "rameno n\u00e1pravy", "rameno napravy"] },
      { id: "bushings",        label: "Silentbloky",    sectionId: 459, keywords: ["bushing", "silentblok", "lager"] },
    ],
  },
];

const SECTION_ID_BY_CATEGORY_ID = new Map<string, number>();
const registerSectionIds = (nodes: SeedCategory[]) => {
  nodes.forEach((node) => {
    if (typeof node.sectionId === "number") SECTION_ID_BY_CATEGORY_ID.set(node.id, node.sectionId);
    if (node.children?.length) registerSectionIds(node.children);
  });
};
registerSectionIds(DEFAULT_CATEGORY_TREE);

// =============================================================
// HELPERS
// =============================================================

const normalize = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizeOem = (s: string): string =>
  (s || "").toUpperCase().replace(/[\s\-._/]/g, "");

// =============================================================
// SANITIZERS
// =============================================================

function sanitizeName(raw: string): string {
  if (!raw || raw === "—") return raw;
  let name = raw.trim();
  // Zjednodušená verze sanitizace pro čistotu kódu
  const words = name.split(/\s+/);
  const allCaps = words.length > 0 && words.every((w) => w === w.toUpperCase() && /[A-Z]/.test(w));
  if (allCaps && name.length > 2) {
    name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  return name;
}

function sanitizeCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw === "Karoserie") return null; // Force keyword matching
  return raw;
}

function rank(source?: string | null): number {
  const s = (source || "").toLowerCase();
  if (s === "mopar" || s === "mopar_oem") return 1;
  if (["epc-ai", "7zap", "epc-link", "ai-epc", "csv"].includes(s)) return 2;
  if (s === "jm") return 5;
  return 9;
}

function badge(source?: string | null): CatalogPart["badge_label"] {
  const r = rank(source);
  if (r <= 2) return "ORIGINÁL";
  if (r === 5) return "NÁHRADA";
  return "NEZNÁMÝ";
}

function safeNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(row: any): CatalogPart {
  const source = row?.catalog_source || "mopar";
  const priceWithVat = safeNumber(row?.price_with_vat);
  let priceWithoutVat = safeNumber(row?.price_without_vat);
  
  if (priceWithoutVat === null && priceWithVat !== null) {
    priceWithoutVat = Math.round((priceWithVat / 1.21) * 100) / 100;
  }

  return {
    id: String(row?.id ?? `tmp:${row?.oem_number || Math.random()}`),
    oem_number: String(row?.oem_number || ""),
    name: sanitizeName(String(row?.name || row?.oem_number || "—")),
    manufacturer: row?.manufacturer ?? null,
    catalog_source: source,
    price_without_vat: priceWithoutVat,
    price_with_vat: priceWithVat,
    availability: row?.availability ?? null,
    image_urls: Array.isArray(row?.image_urls) ? row.image_urls : null,
    category: sanitizeCategory(row?.category),
    description: row?.description || null,
    compatible_vehicles: row?.compatible_vehicles ?? null,
    technical_parameters: row?.technical_parameters ?? null,
    is_oem: rank(source) <= 2,
    badge_label: badge(source),
    rank: rank(source),
  };
}

// =============================================================
// MATCHING LOGIC (OPRAVENO)
// =============================================================

function partMatchesKeywords(part: CatalogPart, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;

  // 🔥 OPRAVA: Přidány zpětné uvozovky (backticks)
  const haystack = `${part.name} ${part.category || ""} ${part.description || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  
  const partCategory = (part.category || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const normKw = keywords
    .map(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())
    .filter(Boolean);

  if (normKw.some(kw => partCategory.includes(kw))) return true;
  return normKw.some(kw => haystack.includes(kw));
}

function dedupeByOem(parts: CatalogPart[]): CatalogPart[] {
  const seen = new Set<string>();
  const out: CatalogPart[] = [];
  for (const p of parts) {
    const key = normalizeOem(p.oem_number) || p.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// =============================================================
// API METHODS
// =============================================================

async function fetchLocalRowsForVehicle(opts: {
  brand: string;
  model: string;
  engine?: string | null;
  limit?: number;
}): Promise<any[]> {
  const limit = opts.limit ?? 1000;
  const { data, error } = await supabase
    .from("parts_new_public")
    .select("*")
    .ilike("compatible_vehicles", `%${opts.brand}%`)
    .ilike("compatible_vehicles", `%${opts.model}%`)
    .limit(limit);

  if (error) return [];
  return data || [];
}

export async function listPartsForVehicle(opts: {
  brand: string;
  model: string;
  engine?: string | null;
  categoryKeywords?: string[];
  page?: number;
  pageSize?: number;
}): Promise<{ items: CatalogPart[]; total: number }> {
  const page = opts.page ?? 0;
  const pageSize = opts.pageSize ?? 30;

  const rows = await fetchLocalRowsForVehicle({
    brand: opts.brand,
    model: opts.model,
    engine: opts.engine
  });

  let parts = rows.map(normalizeRow);

  if (opts.categoryKeywords?.length) {
    parts = parts.filter(p => partMatchesKeywords(p, opts.categoryKeywords!));
  }

  parts = dedupeByOem(parts).sort((a, b) => a.rank - b.rank);

  return {
    items: parts.slice(page * pageSize, (page + 1) * pageSize),
    total: parts.length
  };
}

// =============================================================
// LEGACY listParts (DOPSÁNO A OPRAVENO)
// =============================================================

export async function listParts(filter: {
  brand?: string;
  model?: string;
  engine?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: CatalogPart[]; total: number }> {
  const page = Math.max(0, filter.page ?? 0);
  const pageSize = Math.min(filter.pageSize ?? 30, PAGE_SIZE_MAX);

  // Pokud máme auto, použijeme listPartsForVehicle
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

  // Obecné vyhledávání v DB pokud není vybráno auto
  let query = supabase.from("parts_new_public").select("*", { count: "exact" });

  if (filter.search) {
    query = query.or(`oem_number.ilike.%${filter.search}%,name.ilike.%${filter.search}%`);
  }

  const { data, error, count } = await query
    .range(page * pageSize, (page + 1) * pageSize - 1)
    .limit(pageSize);

  if (error) {
    console.error("[listParts] Error:", error.message);
    return { items: [], total: 0 };
  }

  return {
    items: (data || []).map(normalizeRow),
    total: count || 0
  };
}
