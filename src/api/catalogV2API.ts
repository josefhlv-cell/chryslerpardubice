/**
 * CATALOG V4 — Production-grade engine (REVISED)
 * -----------------------------------------------------
 * Fixes applied:
 * - Strict regex-based keyword matching (no partial overlaps).
 * - Removed aggressive J+M fallback that caused unrelated parts to appear.
 * - Expanded German-to-Czech translation dictionary.
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

type SeedCategory = {
  id: string;
  label: string;
  keywords: string[];
  sectionId?: number;
  children?: SeedCategory[];
};

// =============================================================
// CATEGORY TREE (CS)
// =============================================================

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
  {
    id: "steering",
    label: "Řízení",
    keywords: ["steering", "\u0159\u00edzen", "rizeni", "lenkstange", "kugelgelenk"],
    children: [
      { id: "tie-rods",    label: "Spojovací tyče", sectionId: 433, keywords: ["tie rod", "spojovac\u00ed ty\u010d", "spojovaci tyc", "lenkstange"] },
      { id: "ball-joints", label: "Kulové čepy",    sectionId: 432, keywords: ["ball joint", "kulov\u00fd \u010dep", "kulovy cep", "kugelgelenk"] },
    ],
  },
  { id: "exhaust",      label: "Výfuk",            sectionId: 64,  keywords: ["exhaust", "v\u00fdfuk", "vyfuk", "abgasdaempfer"] },
  { id: "transmission", label: "Převodovka",       sectionId: 252, keywords: ["transmission", "p\u0159evodovk", "prevodovk", "gearbox", "getriebe"] },
  { id: "ac",           label: "Klimatizace",      sectionId: 244, keywords: ["air conditioning", "klimatiza", "a/c ", "kompressor", "dehydrat"] },
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
// NAME & CATEGORY SANITIZER
// =============================================================

const DE_TO_CS: [RegExp, string][] = [
  [/\bBREMSBELAG SATZ\b/gi,       "Sada brzdových destiček"],
  [/\bBREMSBELAG\b/gi,            "Brzdová destička"],
  [/\bBREMSSCHEIBE\b/gi,          "Brzdový kotouč"],
  [/\bBREMSSATTEL\b/gi,           "Brzdový třmen"],
  [/\bBREMSSCHLAUCH\b/gi,        "Brzdová hadice"],
  [/\bBREMSEN\b/gi,               "Brzdy"],
  [/\bZAHNRIEMEN SATZ\b/gi,       "Sada rozvodového řemene"],
  [/\bWASSERPUMPE\b/gi,           "Vodní čerpadlo"],
  [/\bSTOSSDAEMPFER\b/gi,         "Tlumič pérování"],
  [/\bKRAFTSTOFFILTER\b/gi,       "Palivový filtr"],
  [/\bLUFTFILTER\b/gi,            "Vzduchový filtr"],
  [/\bOELFILTER\b/gi,             "Olejový filtr"],
  [/\bGETRIEBE\b/gi,              "Převodovka"],
  [/\bANLASSER\b/gi,              "Startér"],
  [/\bKUEHLER\b/gi,               "Chladič"],
  [/\bLENKER\b/gi,                "Rameno nápravy"],
  [/\bFILTER\b/gi,                "Filtr"],
  [/\bSATZ\b/gi,                  "Sada"],
];

function sanitizeName(raw: string): string {
  if (!raw || raw === "—") return raw;
  let name = raw;
  for (const [pattern, replacement] of DE_TO_CS) {
    name = name.replace(pattern, replacement);
  }
  const words = name.trim().split(/\s+/);
  const allCaps = words.length > 0 && words.every((w) => w === w.toUpperCase() && /[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(w));
  if (allCaps && name.length > 2) {
    name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  return name.trim();
}

function sanitizeCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const CAT_MAP: Record<string, string> = {
    "Brake System": "Brzdové zařízení",
    "Engine": "Motor",
    "Filters": "Filtry",
    "Body": "Karoserie",
  };
  const mapped = CAT_MAP[raw] ?? raw;
  // Fix: Don't return null for Karoserie, return a safe fallback
  if (mapped === "Karoserie") return "Ostatní / Karoserie";
  return mapped;
}

function rank(source?: string | null): number {
  const s = (source || "").toLowerCase();
  if (s === "mopar" || s === "mopar_oem") return 1;
  if (s === "jm") return 5;
  return 2;
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
  const priceWithoutVat = safeNumber(row?.price_without_vat) ?? (priceWithVat ? Math.round((priceWithVat / 1.21) * 100) / 100 : null);

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
    description: row?.description ?? null,
    is_oem: rank(source) <= 2,
    badge_label: badge(source),
    rank: rank(source),
  };
}

/**
 * FIXED: Uses regex word boundaries \b to prevent partial matches (e.g., "olej" matching "kolej")
 */
function partMatchesKeywords(part: CatalogPart, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;
  const haystack = normalize(`${part.name} ${part.category || ""} ${part.description || ""}`);
  return keywords.some((kw) => {
    const nKw = normalize(kw);
    const regex = new RegExp(`(^|\\s|\\/|\\-)${nKw}($|\\s|\\/|\\-)`, "i");
    return regex.test(haystack);
  });
}

function dedupeByOem(parts: CatalogPart[]): CatalogPart[] {
  const seen = new Set<string>();
  const out: CatalogPart[] = [];
  for (const p of parts) {
    const key = p.catalog_source === "jm" 
      ? `jm:${normalizeOem(p.related_oem_number || "")}:${normalizeOem(p.oem_number)}`
      : normalizeOem(p.oem_number);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// =============================================================
// API FETCHERS
// =============================================================

export async function fetchBrands() {
  const { data } = await supabase.from("nextis_vehicles").select("brand").in("brand", ALLOWED_BRANDS as any);
  return [...new Set((data || []).map(r => r.brand))].sort();
}

export async function fetchModelsForBrand(brand: string) {
  const { data } = await supabase.from("nextis_vehicles").select("model").eq("brand", brand);
  return [...new Set((data || []).map(r => r.model))].sort();
}

export async function fetchEnginesForModel(brand: string, model: string) {
  const { data } = await supabase.from("nextis_vehicles").select("engine").eq("brand", brand).eq("model", model);
  return [...new Set((data || []).map(r => r.engine))].sort();
}

export async function listPartsForVehicle(opts: any) {
  const { data, error } = await supabase
    .from("parts_new_public")
    .select("*")
    .ilike("compatible_vehicles", `%${opts.brand}%`)
    .ilike("compatible_vehicles", `%${opts.model}%`)
    .limit(1000);

  if (error) return { items: [], total: 0 };
  
  let parts = data.map(normalizeRow);
  if (opts.categoryKeywords?.length) {
    parts = parts.filter(p => partMatchesKeywords(p, opts.categoryKeywords));
  }
  
  const sorted = dedupeByOem(parts).sort((a, b) => a.rank - b.rank);
  return { items: sorted.slice(0, 30), total: sorted.length };
}

// =============================================================
// J+M LOGIC
// =============================================================

function jmNormalize(it: any): CatalogPart {
  const pw = safeNumber(it.price_with_vat);
  return {
    ...normalizeRow(it),
    id: `jm:${it.oem_number}`,
    catalog_source: "jm",
    badge_label: "NÁHRADA",
    rank: 5,
    is_oem: false,
    related_oem_number: it.related_oem_number,
    price_with_vat: pw,
    price_without_vat: safeNumber(it.price_without_vat) ?? (pw ? Math.round(pw / 1.21) : null),
  };
}

/**
 * FIXED: Removed Step 2 fallback to prevent "category bleeding"
 */
export async function fetchJmForVehicle(opts: any) {
  const sectionId = opts.sectionId ?? (opts.categoryId ? SECTION_ID_BY_CATEGORY_ID.get(opts.categoryId) : null);
  
  try {
    const { data, error } = await supabase.functions.invoke("jm-proxy", {
      body: { 
        action: "searchByVehicle", 
        payload: { ...opts, sectionId } 
      },
    });

    if (error || !data?.success) return { items: [], warning: "J+M data nedostupná" };
    
    const raw = Array.isArray(data?.data?.items) ? data.data.items : [];
    let items = raw.map(jmNormalize);

    // Apply strict filtering on the results
    if (opts.categoryKeywords?.length) {
      items = items.filter(p => partMatchesKeywords(p, opts.categoryKeywords));
    }

    return { 
      items: dedupeByOem(items), 
      warning: items.length === 0 ? "V této kategorii nebyly nalezeny žádné náhrady." : undefined 
    };
  } catch (e) {
    return { items: [], warning: "Chyba komunikace s J+M" };
  }
}

export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]): CatalogPart[] {
  const oemKeys = new Set(oem.map((p) => normalizeOem(p.oem_number)));
  // Only add JM parts that aren't already in OEM
  const filteredJm = jm.filter((p) => !oemKeys.has(normalizeOem(p.oem_number)));
  return [...oem, ...filteredJm].sort((a, b) => a.rank - b.rank);
}

export const mergeParts = mergeWithJm;
