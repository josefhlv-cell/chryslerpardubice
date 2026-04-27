/**
 * CATALOG V4 — Production-grade engine.
 * -----------------------------------------------------
 * Sources:
 *   • OEM (rank 1): mopar / epc / 7zap (parts_new_public)
 *   • Aftermarket (rank 5): J+M via jm-proxy edge function
 *   • Pricing: CSV-only (vernostsevyplaci) — never an API
 *
 * Vehicle filtering: nextis_vehicles is the single source of truth
 * for Brand → Model → Engine. compatible_vehicles is only used as a
 * downstream text fallback when joining parts to vehicles.
 *
 * Design rules:
 *   • Never crash on null prices, never return null lists.
 *   • OEM always sorts before aftermarket (rank ASC).
 *   • Strict category scoping — no cross-category fallbacks.
 *   • All public functions return a safe, typed value.
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

/** Used by the legacy CatalogTree sidebar (catalog_categories rows). */
export type CategoryNode = {
  id: string;
  name_cs: string;
  name_en?: string | null;
  node_type: "brand" | "model" | "engine" | "category" | "global";
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  vehicle_engine?: string | null;
  parent_id?: string | null;
  children?: CategoryNode[];
};

/** Used by Catalog.tsx drill-down (in-memory category tree). */
export type CatalogCategoryNode = {
  id: string;
  label: string;
  path: string[];
  keywords: string[];
  count: number;
  /** Optional Nextis section id (when known). */
  sectionId?: number | null;
  children: CatalogCategoryNode[];
};

// =============================================================
// CATEGORY TREE (CS) — keyword-driven, deterministic
// =============================================================

type SeedCategory = {
  id: string;
  label: string;
  keywords: string[];
  sectionId?: number;
  children?: SeedCategory[];
};

/**
 * Single source of truth for the in-app category tree.
 * Keywords are normalised (lower-case, no diacritics) at runtime.
 */
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
  {
    id: "electrical",
    label: "Elektroinstalace",
    keywords: ["electric", "elektri", "battery", "baterie", "elektromotor", "anlasser", "alternator"],
    children: [
      { id: "battery",    label: "Baterie",    sectionId: 213, keywords: ["battery", "baterie", "akumul\u00e1tor", "akumulator"] },
      { id: "alternator", label: "Alternátor", sectionId: 71,  keywords: ["alternator", "altern\u00e1tor"] },
      { id: "starter",    label: "Startér",    sectionId: 72,  keywords: ["starter motor", "start\u00e9r", "starter", "anlasser"] },
    ],
  },
  {
    id: "cooling",
    label: "Chlazení",
    keywords: ["cooling", "radiator", "chlazen", "chladi\u010d", "chladic", "kuehler", "thermostat"],
    children: [
      { id: "radiator",   label: "Chladič",   sectionId: 31,  keywords: ["radiator", "chladi\u010d", "chladic", "kuehler"] },
      { id: "thermostat", label: "Termostat", sectionId: 195, keywords: ["thermostat", "termostat"] },
    ],
  },
  { id: "exhaust",      label: "Výfuk",            sectionId: 64,  keywords: ["exhaust", "v\u00fdfuk", "vyfuk", "abgasdaempfer"] },
  { id: "transmission", label: "Převodovka",       sectionId: 252, keywords: ["transmission", "p\u0159evodovk", "prevodovk", "gearbox", "getriebe"] },
  { id: "ac",           label: "Klimatizace",      sectionId: 244, keywords: ["air conditioning", "klimatiza", "a/c ", "kompressor", "dehydrat"] },
  { id: "body",         label: "Karoserie",        keywords: ["body", "karoseri", "fender", "bumper", "n\u00e1raz", "naraz", "rueckblickspiegel", "gehaeuse"] },
  { id: "interior",     label: "Interiér",         keywords: ["interior", "interi\u00e9r", "interier", "seat", "sedadlo"] },
  { id: "fluids",       label: "Kapaliny a oleje", keywords: ["fluid", "oil", "olej", "kapalina"] },
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
// NAME & CATEGORY SANITIZER — DE→CS + Sentence case
// =============================================================

/**
 * German → Czech translation table for automotive part names.
 * Order matters: longer/more specific phrases must come before shorter ones.
 */
const DE_TO_CS: [RegExp, string][] = [
  // Multi-word first
  [/\bBREMSBELAG SATZ\b/gi,       "Sada brzdových destiček"],
  [/\bZAHNRIEMEN SATZ\b/gi,       "Sada rozvodového řemene"],
  [/\bZAHNRIEMEN KIT\b/gi,        "Sada rozvodového řemene"],
  [/\bKOPFDICHTUNG SATZ\b/gi,     "Sada těsnění hlavy válců"],
  [/\bABGASDEMPFER\b/gi,          "Tlumič výfuku"],
  [/\bSTOSSDAEMPFER\b/gi,         "Tlumič pérování"],
  [/\bRUECKBLICKSPIEGEL\b/gi,    "Zpětné zrcátko"],
  [/\bKRAFTSTOFFILTER\b/gi,       "Palivový filtr"],
  [/\bKOPFDICHTUNG\b/gi,          "Těsnění hlavy válců"],
  [/\bBREMSBELAG\b/gi,            "Brzdová destička"],
  [/\bBREMSSCHEIBE\b/gi,          "Brzdový kotouč"],
  [/\bBREMSSATTEL\b/gi,           "Brzdový třmen"],
  [/\bBREMSSCHLAUCH\b/gi,        "Brzdová hadice"],
  [/\bWASSERPUMPE\b/gi,           "Vodní čerpadlo"],
  [/\bZAHNRIEMEN\b/gi,            "Rozvodový řemen"],
  [/\bZUENDKERZE\b/gi,            "Zapalovací svíčka"],
  [/\bELEKTROMOTOR\b/gi,          "Elektromotor"],
  [/\bNOCKENWELLE\b/gi,           "Vačkový hřídel"],
  [/\bKURBELWELLE\b/gi,           "Klikový hřídel"],
  [/\bLUFTFILTER\b/gi,            "Vzduchový filtr"],
  [/\bOELFILTER\b/gi,             "Olejový filtr"],
  [/\bKOMPRESSOR\b/gi,            "Kompresor klimatizace"],
  [/\bKUEHLER\b/gi,               "Chladič"],
  [/\bGEBLAESE\b/gi,              "Ventilátor"],
  [/\bGETRIEBE\b/gi,              "Převodovka"],
  [/\bKUGELGELENK\b/gi,           "Kulový čep"],
  [/\bLENKSTANGE\b/gi,            "Řídicí tyč"],
  [/\bANLASSER\b/gi,              "Startér"],
  [/\bGEHAEUSE\b/gi,              "Kryt"],
  [/\bDICHTUNG\b/gi,              "Těsnění"],
  [/\bSCHLAUCH\b/gi,              "Hadice"],
  [/\bZYLINDER\b/gi,              "Válec"],
  [/\bKOLBEN\b/gi,                "Píst"],
  [/\bLAGER\b/gi,                 "Ložisko"],
  [/\bPUMPE\b/gi,                 "Čerpadlo"],
  [/\bVENTIL\b/gi,                "Ventil"],
  [/\bSENSOR\b/gi,                "Senzor"],
  [/\bFEDER\b/gi,                 "Pružina"],
  [/\bROHR\b/gi,                  "Trubka"],
  [/\bSATZ\b/gi,                  "Sada"],
  // Czech typos / missing diacritics
  [/\bSTYKAC\b/gi,                "Stykač"],
  [/\bCISTIC OLEJE\b/gi,          "Čistič oleje"],
  [/\bOBJIMKA ZAROVKY\b/gi,       "Objímka žárovky"],
  [/\bDEHYDRAT\.?FILTR\.?\b/gi,  "Filtr klimatizace"],
  [/\bELAST\.?PODLOZKA\b/gi,     "Elastická podložka"],
  [/\bTYPOVY STITEK\b/gi,        "Typový štítek"],
  [/\bSICHERUNGSSATZ\b/gi, "Sada pojistek"],
  [/\bSICHERUNG\b/gi, "Pojistka"],
  [/\bVERKLEIDUNG\b/gi, "Obložení"],
  [/\bHALTER\b/gi, "Držák"],
  [/\bKONSOLE\b/gi, "Konzola"],
  [/\bTRAEGER\b/gi, "Nosič"],
  [/\bDECKEL\b/gi, "Víko"],
  [/\bRINGE\b/gi, "Kroužky"],
  [/\bSCHEIBE\b/gi, "Podložka"],
  [/\bMUTTER\b/gi, "Matice"],
  [/\bBOLZEN\b/gi, "Šroub"],
  [/\bFEDERBEIN\b/gi, "Vzpěra odpružení"],
  [/\bQUERLENKER\b/gi, "Příčné rameno"],
  [/\bSTABILISATOR\b/gi, "Stabilizátor"],
  [/\bBUCHSE\b/gi, "Pouzdro"],
  [/\bWELLE\b/gi, "Hřídel"],
  [/\bGELENK\b/gi, "Kloub"],
  [/\bKUPPLUNG\b/gi, "Spojka"],
  [/\bZYLINDERKOPF\b/gi, "Hlava válců"],
  [/\bOELWANNE\b/gi, "Olejová vana"],
  [/\bKETTE\b/gi, "Řetěz"],
  [/\bSPANNER\b/gi, "Napínák"],
  [/\bUMLENKROLLE\b/gi, "Přesměrovací kladka"],
  [/\bRIEMENSCHEIBE\b/gi, "Řemenice"],
  [/\bDRZAK\b/gi, "Držák"],
  [/\bKONZOLA\b/gi, "Konzola"],
];

/**
 * Sanitize a part name:
 * 1. Translate German terms to Czech.
 * 2. Convert ALL-CAPS to Sentence case.
 * 3. Trim whitespace.
 */
function sanitizeName(raw: string): string {
  if (!raw || raw === "—") return raw;
  let name = raw;

  // Step 1: German → Czech
  for (const [pattern, replacement] of DE_TO_CS) {
    name = name.replace(pattern, replacement);
  }

  // Step 2: ALL-CAPS → Sentence case (only when entire string is caps)
  const words = name.trim().split(/\s+/);
  const allCaps = words.length > 0 && words.every((w) => w === w.toUpperCase() && /[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(w));
  if (allCaps && name.length > 2) {
    name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  return name.trim();
}

/**
 * Sanitize category field:
 * - Normalise English → Czech labels.
 * - Parts incorrectly tagged as "Karoserie" get null so keyword-matching
 *   in countSeedTree() can reassign them to the correct category.
 */
function sanitizeCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const CAT_MAP: Record<string, string> = {
    "Brake System":        "Brzdové zařízení",
    "Brzdový systém":      "Brzdové zařízení",
    "Engine":              "Motor",
    "Filters":             "Filtry",
    "Suspension":          "Odpružení a nápravy",
    "Steering":            "Řízení",
    "Cooling":             "Chlazení",
    "Exhaust":             "Výfuk",
    "Transmission":        "Převodovka",
    "Air Conditioning":    "Klimatizace",
    "Body":                "Karoserie",
    "Interior":            "Interiér",
    "Fluids":              "Kapaliny a oleje",
    "Electrical":          "Elektroinstalace",
    "Other":               "Ostatní",
  };

  const mapped = CAT_MAP[raw] ?? raw;

  // Parts tagged "Karoserie" that are clearly engine/drivetrain components
  // get null so the keyword tree re-assigns them correctly.
  // The UI will fall back to keyword matching.
  if (mapped === "Karoserie") return null;

  return mapped;
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
  if (!Number.isFinite(n)) return null;
  return n;
}
function isDescriptionRelevantRaw(name: string, desc: string | null): boolean {
  if (!desc) return false;

  const n = name.toLowerCase();
  const d = desc.toLowerCase();

  const blacklist = [
    "brzd", "kotouč", "destičk",
    "čerpadlo", "pump",
    "filtr"
  ];

  for (const w of blacklist) {
    if (!n.includes(w) && d.includes(w)) {
      return false;
    }
  }

  return true;
}
function normalizeRow(row: any): CatalogPart {
  const source = row?.catalog_source || "mopar";

  const priceWithVat = safeNumber(row?.price_with_vat);
  let priceWithoutVat = safeNumber(row?.price_without_vat);
  if (priceWithoutVat === null && priceWithVat !== null) {
    priceWithoutVat = Math.round((priceWithVat / 1.21) * 100) / 100;
  }

  const finalWithVat = priceWithVat && priceWithVat > 0 ? priceWithVat : null;
  const finalWithoutVat = priceWithoutVat && priceWithoutVat > 0 ? priceWithoutVat : null;

  return {
    id: String(row?.id ?? `tmp:${row?.oem_number || Math.random()}`),
    oem_number: String(row?.oem_number || ""),
    // ✅ Sanitize name: DE→CS + Sentence case
    name: sanitizeName(String(row?.name || row?.oem_number || "—")),
    manufacturer: row?.manufacturer ?? null,
    catalog_source: source,
    price_without_vat: finalWithoutVat,
    price_with_vat: finalWithVat,
    availability: row?.availability ?? null,
    image_urls: Array.isArray(row?.image_urls) ? row.image_urls : null,
    // ✅ Sanitize category: EN→CS + fix wrong "Karoserie" assignments
    category: sanitizeCategory(row?.category),
    description: isDescriptionRelevantRaw(
  String(row?.name || ""),
  row?.description
)
  ? row?.description
  : null,
    compatible_vehicles: row?.compatible_vehicles ?? null,
    technical_parameters: row?.technical_parameters ?? null,
    is_oem: rank(source) <= 2,
    badge_label: badge(source),
    rank: rank(source),
  };
}

function buildKeywordHaystack(part: { name: string; category: string | null; description: string | null }): string {
  return normalize(`${part.name} ${part.category || ""} ${part.description || ""}`);
}

function partMatchesKeywords(part: CatalogPart, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;


  const haystack = `${part.name} ${part.category || ""} ${part.description || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const partCategory = (part.category || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const normKw = keywords
    .map(k =>
      k.normalize("NFD")
       .replace(/[\u0300-\u036f]/g, "")
       .toLowerCase()
    )
    .filter(Boolean);

  if (normKw.some(kw => partCategory.includes(kw))) {
  return true;
}

  return normKw.some(kw => haystack.includes(kw));
}

  
  const partCategory = (part.category || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const normKw = keywords
    .map(k =>
      k.normalize("NFD")
       .replace(/[\u0300-\u036f]/g, "")
       .toLowerCase()
    )
    .filter(Boolean);

  // 🔥 PRIORITA: přesná shoda kategorie
  if (normKw.some(kw => partCategory.includes(kw))) {
    return true;
  }

  // 🔥 fallback: hledání v názvu + popisu
  return normKw.some(kw => haystack.includes(kw));
}
}

function dedupeByOem(parts: CatalogPart[]): CatalogPart[] {
  const seen = new Set<string>();
  const out: CatalogPart[] = [];
  for (const p of parts) {
    const key = p.catalog_source === "jm"
      ? `${normalizeOem(p.related_oem_number || "") || "jm"}:${normalizeOem(p.manufacturer || "")}:${normalizeOem(p.oem_number) || p.id}`
      : normalizeOem(p.oem_number) || p.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// =============================================================
// IN-MEMORY CACHE (lightweight, per-tab)
// =============================================================

type CacheEntry<T> = { value: T; expires: number };
const _cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    _cache.delete(key);
    return null;
  }
  return e.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  _cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

/** Public helper to wipe the cache (e.g. after CSV price sync). */
export function clearCatalogCache(): void {
  _cache.clear();
}

const TTL_VEHICLE_TREE = 5 * 60_000;
const TTL_PARTS_QUERY = 60_000;
const TTL_JM_CODE = 5 * 60_000;

// =============================================================
// VEHICLE TREE — nextis_vehicles is the source of truth
// =============================================================

export async function fetchBrands(): Promise<string[]> {
  const cached = cacheGet<string[]>("brands");
  if (cached) return cached;

  const { data, error } = await supabase
    .from("nextis_vehicles")
    .select("brand")
    .in("brand", ALLOWED_BRANDS as unknown as string[])
    .limit(VEHICLE_LIST_LIMIT);

  if (error) {
    console.error("[catalogV2API] fetchBrands failed:", error.message);
    return [];
  }
  const set = new Set<string>();
  (data || []).forEach((r: any) => r?.brand && set.add(r.brand));
  return cacheSet("brands", ALLOWED_BRANDS.filter((b) => set.has(b)), TTL_VEHICLE_TREE);
}

export async function fetchModelsForBrand(brand: string): Promise<string[]> {
  if (!brand) return [];
  const key = `models:${brand}`;
  const cached = cacheGet<string[]>(key);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("nextis_vehicles")
    .select("model")
    .eq("brand", brand)
    .limit(VEHICLE_LIST_LIMIT);

  if (error) {
    console.error("[catalogV2API] fetchModelsForBrand failed:", error.message);
    return [];
  }
  const set = new Set<string>();
  (data || []).forEach((r: any) => r?.model && set.add(r.model));
  return cacheSet(key, [...set].sort((a, b) => a.localeCompare(b)), TTL_VEHICLE_TREE);
}

export async function fetchEnginesForModel(brand: string, model: string): Promise<string[]> {
  if (!brand || !model) return [];
  const key = `engines:${brand}:${model}`;
  const cached = cacheGet<string[]>(key);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("nextis_vehicles")
    .select("engine")
    .eq("brand", brand)
    .eq("model", model)
    .limit(VEHICLE_LIST_LIMIT);

  if (error) {
    console.error("[catalogV2API] fetchEnginesForModel failed:", error.message);
    return [];
  }
  const set = new Set<string>();
  (data || []).forEach((r: any) => r?.engine && set.add(r.engine));
  return cacheSet(key, [...set].sort((a, b) => a.localeCompare(b)), TTL_VEHICLE_TREE);
}

export async function fetchNextisVehicles(brand: string, model: string): Promise<NextisVehicle[]> {
  if (!brand || !model) return [];
  const key = `nextis:${brand}:${model}`;
  const cached = cacheGet<NextisVehicle[]>(key);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("nextis_vehicles")
    .select("id, brand, model, engine, year_from, year_to, external_id")
    .eq("brand", brand)
    .eq("model", model)
    .limit(VEHICLE_LIST_LIMIT);

  if (error) {
    console.error("[catalogV2API] fetchNextisVehicles failed:", error.message);
    return [];
  }
  return cacheSet(key, (data || []) as NextisVehicle[], TTL_VEHICLE_TREE);
}

// =============================================================
// VIN DECODING — placeholder for future AI-driven flow
// =============================================================

/** Reserved for upcoming VIN→vehicle resolution. Returns null today. */
export async function resolveVehicleByVin(_vin: string): Promise<NextisVehicle | null> {
  return null;
}

// =============================================================
// PARTS LISTING (LOCAL OEM)
// =============================================================

function engineVariants(engine: string | null | undefined): string[] {
  if (!engine) return [];
  const out = new Set<string>([engine]);
  out.add(engine.replace(/^(\d+\.\d+)(\s)/, "$1L$2"));
  out.add(engine.replace(/^(\d+\.\d+)L(\s)/, "$1$2"));
  const m = engine.match(/^(\d+\.\d+)/);
  if (m) out.add(m[1]);
  return [...out].filter(Boolean);
}

async function fetchLocalRowsForVehicle(opts: {
  brand: string;
  model: string;
  engine?: string | null;
  limit?: number;
}): Promise<any[]> {
  const limit = Math.min(opts.limit ?? 1000, 3000);
  const cacheKey = `local:${opts.brand}:${opts.model}:${opts.engine || ""}:${limit}`;
  const cached = cacheGet<any[]>(cacheKey);
  if (cached) return cached;

  const variants = engineVariants(opts.engine);
  const candidates = variants.length ? variants : [null];
  const queries = [...candidates, null].filter((value, index, arr) => arr.indexOf(value) === index);
  const merged: any[] = [];
  const seen = new Set<string>();

  for (const variant of queries) {
    let q = supabase
      .from("parts_new_public")
      .select(
        "id, oem_number, name, manufacturer, catalog_source, price_with_vat, availability, image_urls, category, description, compatible_vehicles"
      )
      .ilike("compatible_vehicles", `%${opts.brand}%`)
      .ilike("compatible_vehicles", `%${opts.model}%`)
      .limit(limit);
    if (variant) q = q.ilike("compatible_vehicles", `%${variant}%`);

    const { data, error } = await q;
    if (error) {
      console.error("[catalogV2API] fetchLocalRowsForVehicle failed:", error.message);
      return [];
    }
    for (const row of data || []) {
      const key = String(row?.id || row?.oem_number || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
  }
  return cacheSet(cacheKey, merged, TTL_PARTS_QUERY);
}

export async function listPartsForVehicle(opts: {
  brand: string;
  model: string;
  engine?: string | null;
  nextisVehicleId?: string;
  canonicalCategory?: string;
  categoryKeywords?: string[];
  page?: number;
  pageSize?: number;
}): Promise<{ items: CatalogPart[]; total: number }> {
  const page = Math.max(0, opts.page ?? 0);
  const pageSize = Math.min(opts.pageSize ?? 30, PAGE_SIZE_MAX);

  console.log("[catalogV2API] listPartsForVehicle", {
    brand: opts.brand,
    model: opts.model,
    engine: opts.engine,
    category: opts.canonicalCategory,
    keywords: opts.categoryKeywords?.length ?? 0,
  });

  const rows = await fetchLocalRowsForVehicle({
    brand: opts.brand,
    model: opts.model,
    engine: opts.engine,
    limit: 2000,
  });

  let parts = rows
    .map(normalizeRow)
    .filter((p) =>
      ALLOWED_OEM_SOURCES.includes(p.catalog_source as (typeof ALLOWED_OEM_SOURCES)[number])
    );

  if (opts.categoryKeywords && opts.categoryKeywords.length > 0) {
    const strict = parts.filter((p) => partMatchesKeywords(p, opts.categoryKeywords!));
    const labelKeywords = opts.canonicalCategory
      ? normalize(opts.canonicalCategory).split(/\s+/).filter((k) => k.length >= 4)
      : [];
    const relaxed = strict.length === 0 && labelKeywords.length > 0
      ? parts.filter((p) => partMatchesKeywords(p, labelKeywords))
      : strict;
    parts = relaxed;
  }

  parts = dedupeByOem(parts).sort((a, b) => a.rank - b.rank);

  const total = parts.length;
  const sliced = parts.slice(page * pageSize, page * pageSize + pageSize);
  return { items: sliced, total };
}

// =============================================================
// CATEGORY TREE — counts based on local parts inventory
// =============================================================

function countSeedTree(seed: SeedCategory[], parts: CatalogPart[], path: string[] = []): CatalogCategoryNode[] {
  return seed.map((node) => {
    const nodePath = [...path, node.label];
    const matches = parts.filter((p) => partMatchesKeywords(p, node.keywords));
    const children = node.children
      ? countSeedTree(node.children, matches, nodePath)
      : [];
    return {
      id: node.id,
      label: node.label,
      path: nodePath,
      keywords: node.keywords,
      sectionId: node.sectionId ?? null,
      count: matches.length,
      children,
    };
  });
}

export async function fetchJmCategoryTree(opts: {
  nextisVehicleId?: string;
  brand: string;
  model: string;
  engine?: string | null;
}): Promise<CatalogCategoryNode[]> {
  const rows = await fetchLocalRowsForVehicle({
    brand: opts.brand,
    model: opts.model,
    engine: opts.engine,
    limit: 3000,
  });
  const parts = rows
    .map(normalizeRow)
    .filter((p) =>
      ALLOWED_OEM_SOURCES.includes(p.catalog_source as (typeof ALLOWED_OEM_SOURCES)[number])
    );

  const localTree = countSeedTree(DEFAULT_CATEGORY_TREE, parts);

  try {
    const { data, error } = await supabase.functions.invoke("jm-proxy", {
      body: {
        action: "vehicleCategories",
        payload: {
          nextisVehicleId: opts.nextisVehicleId,
          brand: opts.brand,
          model: opts.model,
          engine: opts.engine || "",
        },
      },
    });
    if (!error && data?.success && Array.isArray(data?.data?.categories) && data.data.categories.length > 0) {
      return data.data.categories as CatalogCategoryNode[];
    }
  } catch (e) {
    console.warn("[catalogV2API] jm-proxy vehicleCategories failed (using local tree):", e);
  }

  return localTree;
}

// =============================================================
// J+M (aftermarket) — strict category scoping
// =============================================================

type JmRaw = {
  oem_number?: string;
  name?: string;
  brand?: string;
  manufacturer?: string;
  price_with_vat?: number | null;
  price_without_vat?: number | null;
  stock?: number;
  availability?: string;
  image?: string;
  image_urls?: string[];
  category?: string;
  description?: string;
  related_oem_number?: string;
  searched_code?: string;
};

function jmNormalize(it: JmRaw): CatalogPart {
  const pw = safeNumber(it.price_with_vat);
  const pwoVat =
    safeNumber(it.price_without_vat) ?? (pw !== null ? Math.round((pw / 1.21) * 100) / 100 : null);

  const imageUrls = Array.isArray(it.image_urls)
    ? it.image_urls.filter(Boolean)
    : (it.image ? [String(it.image)] : null);

  return {
    id: `jm:${it.related_oem_number || it.searched_code || it.oem_number || Math.random()}:${it.oem_number || ""}`,
    oem_number: String(it.oem_number || ""),
    // ✅ Sanitize name
    name: sanitizeName(String(it.name || it.oem_number || "—")),
    manufacturer: it.manufacturer || it.brand || "J+M",
    catalog_source: "jm",
    price_without_vat: pwoVat && pwoVat > 0 ? pwoVat : null,
    price_with_vat: pw && pw > 0 ? pw : null,
    availability: it.availability || (it.stock && it.stock > 0 ? "in_stock" : "unknown"),
    image_urls: imageUrls,
    // ✅ Sanitize category
    category: sanitizeCategory(it.category),
    description: it.description ?? null,
    compatible_vehicles: (it as any).compatible_vehicles ?? null,
    technical_parameters: (it as any).technical_parameters ?? null,
    related_oem_number: it.related_oem_number ?? null,
    searched_code: it.searched_code ?? null,
    is_oem: false,
    badge_label: "NÁHRADA",
    rank: 5,
  };
}

export async function fetchJmByCode(code: string): Promise<CatalogPart[]> {
  if (!code) return [];
  const cacheKey = `jm:code:${normalizeOem(code)}`;
  const cached = cacheGet<CatalogPart[]>(cacheKey);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "searchByCode", payload: { code } },
    });
    if (error || !data?.success) return cacheSet(cacheKey, [], TTL_JM_CODE);
    const items = Array.isArray(data?.data?.items) ? data.data.items : [];
    return cacheSet(cacheKey, items.map(jmNormalize), TTL_JM_CODE);
  } catch (e) {
    console.warn("[catalogV2API] fetchJmByCode failed:", e);
    return [];
  }
}

export async function fetchJmByCodes(codes: string[]): Promise<CatalogPart[]> {
  const unique = [...new Set((codes || []).filter(Boolean))].slice(0, 30);
  if (unique.length === 0) return [];
  const results = await Promise.allSettled(unique.map((c) => fetchJmByCode(c)));
  const out: CatalogPart[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
  }
  return dedupeByOem(out);
}

const JM_CATEGORY_SYNONYMS: Record<string, string[]> = {
  "brake-pads":     ["brake", "pads", "brake pad", "brzdove desticky", "brzdova deska", "destic", "bremsbelag"],
  "brake-discs":    ["discs", "rotor", "brake disc", "kotouce", "brzdovy kotouc", "bremsscheibe"],
  "brake-calipers": ["caliper", "trmen", "brake caliper", "brzdovy trmen", "bremssattel"],
  "brake-hoses":    ["brake hose", "hadice brzd", "brzdova hadice", "bremsschlauch"],
  "oil-filter":     ["oil filter", "olejovy filtr", "oelfilter"],
  "air-filter":     ["air filter", "vzduchovy filtr", "luftfilter"],
  "cabin-filter":   ["cabin filter", "pollen filter", "kabinovy filtr"],
  "fuel-filter":    ["fuel filter", "palivovy filtr", "kraftstoffilter"],
  "spark-plugs":    ["spark plug", "zapalovaci svicka", "zuendkerze"],
  "timing-belt":    ["timing belt", "rozvodovy remen", "zahnriemen"],
  "water-pump":     ["water pump", "vodni cerpadlo", "wasserpumpe"],
  "shock-absorbers":["shock absorber", "tlumic", "stossdaempfer"],
  "control-arms":   ["control arm", "rameno napravy"],
  "tie-rods":       ["tie rod", "spojovaci tyc", "lenkstange"],
  "ball-joints":    ["ball joint", "kulovy cep", "kugelgelenk"],
  "battery":        ["battery", "baterie", "akumulator"],
  "alternator":     ["alternator"],
  "starter":        ["starter motor", "starter", "anlasser"],
  "radiator":       ["radiator", "chladic", "kuehler"],
  "thermostat":     ["thermostat", "termostat"],
};

function expandCategoryKeywords(categoryId?: string | null, base: string[] = []): string[] {
  const set = new Set<string>(base.filter(Boolean));
  if (categoryId && JM_CATEGORY_SYNONYMS[categoryId]) {
    JM_CATEGORY_SYNONYMS[categoryId].forEach((k) => set.add(k));
  }
  return [...set];
}

async function callJmSearchByVehicle(payload: Record<string, unknown>): Promise<{ items: CatalogPart[]; warning?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "searchByVehicle", payload },
    });
    if (error) return { items: [], warning: error.message };
    if (!data?.success) return { items: [], warning: data?.error || "J+M nevrátilo data" };
    const raw = Array.isArray(data?.data?.items) ? data.data.items : [];
    console.log("[catalogV2API] jm-proxy searchByVehicle", {
      mode: data?.data?.mode,
      usedStep: data?.data?.usedStep,
      sectionId: data?.data?.sectionId,
      raw: raw.length,
      warning: data?.data?.warning,
    });
    const items = raw.map(jmNormalize).filter((p: CatalogPart) => !!p.oem_number);
    return { items: dedupeByOem(items) };
  } catch (e) {
    const err = e as { message?: string };
    return { items: [], warning: err?.message || "J+M dotaz selhal" };
  }
}

export async function fetchJmForVehicle(opts: {
  brand: string;
  model: string;
  engine?: string | null;
  nextisVehicleId?: string;
  sectionId?: number | null;
  category?: string;
  categoryId?: string | null;
  categoryKeywords?: string[];
  parentKeywords?: string[];
}): Promise<{ items: CatalogPart[]; warning?: string }> {
  const expandedKeywords = expandCategoryKeywords(opts.categoryId, opts.categoryKeywords || []);
  const inputCategory = opts.category || opts.categoryId || null;
  const resolvedSectionId = opts.sectionId ?? (opts.categoryId ? SECTION_ID_BY_CATEGORY_ID.get(opts.categoryId) ?? null : null);

  const basePayload = {
    nextisVehicleId: opts.nextisVehicleId,
    brand: opts.brand,
    model: opts.model,
    engine: opts.engine || "",
    sectionId: resolvedSectionId,
    category: opts.category,
    categoryId: opts.categoryId || null,
    parentKeywords: opts.parentKeywords || [],
  };

  const step1 = await callJmSearchByVehicle({
    ...basePayload,
    categoryKeywords: expandedKeywords,
  });

  let step1Items = step1.items;
  if (expandedKeywords.length > 0) {
    const filtered = step1Items.filter((p) => partMatchesKeywords(p, expandedKeywords));
    step1Items = filtered.length > 0 ? filtered : step1Items;
  }

  let finalItems = step1Items;
  let warning = step1.warning;
  let step2Count = 0;

  if (step1Items.length === 0) {
    const step2 = await callJmSearchByVehicle({
      ...basePayload,
      categoryKeywords: [],
    });
    step2Count = step2.items.length;
    if (step2.items.length > 0) {
      finalItems = step2.items;
      warning = undefined;
    } else if (!warning) {
      warning = step2.warning;
    }
  }

  console.log("[JM DEBUG]", {
    inputCategory,
    expandedKeywords,
    step1Count: step1Items.length,
    step2Count,
    finalCount: finalItems.length,
  });

  return { items: finalItems, warning: finalItems.length > 0 ? undefined : warning };
}

// =============================================================
// MERGE: OEM-first, J+M never overrides existing OEM
// =============================================================

export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]): CatalogPart[] {
  const oemKeys = new Set(oem.map((p) => normalizeOem(p.oem_number)).filter(Boolean));
  const oemBase8 = new Set(oem.map((p) => normalizeOem(p.oem_number).match(/^K?(\d{8})/)?.[1]).filter(Boolean));
  const imageByRelatedBase = new Map<string, string[]>();

  for (const p of jm) {
    const related = normalizeOem(p.related_oem_number || "");
    const relatedBase = related.match(/^K?(\d{8})/)?.[1];
    const images = p.image_urls?.filter(Boolean) || [];
    if (relatedBase && images.length && !imageByRelatedBase.has(relatedBase)) {
      imageByRelatedBase.set(relatedBase, images);
    }
  }

  const enrichedOem = oem.map((p) => {
    if (p.image_urls?.some(Boolean)) return p;
    const base = normalizeOem(p.oem_number).match(/^K?(\d{8})/)?.[1];
    const fallbackImages = base ? imageByRelatedBase.get(base) : undefined;
    return fallbackImages?.length ? { ...p, image_urls: fallbackImages } : p;
  });

  const filteredJm = jm.filter((p) => {
    const k = normalizeOem(p.oem_number);
    const related = normalizeOem(p.related_oem_number || "");
    const relatedBase = related.match(/^K?(\d{8})/)?.[1];
    if (!k) return false;
    return !oemKeys.has(k) || (!!relatedBase && oemBase8.has(relatedBase));
  });
  return [...enrichedOem, ...dedupeByOem(filteredJm)].sort((a, b) => a.rank - b.rank);
}

/** Legacy alias kept for older callers. */
export const mergeParts = mergeWithJm;

// =============================================================
// GLOBAL OEM SEARCH — header search bar
// =============================================================

export async function globalOemSearch(query: string): Promise<{ oem: CatalogPart[]; jm: CatalogPart[] }> {
  const term = (query || "").trim();
  if (term.length < 2) return { oem: [], jm: [] };

  const [localRes, jmRes] = await Promise.allSettled([
    supabase
      .from("parts_new_public")
      .select("id, oem_number, name, manufacturer, catalog_source, price_with_vat, availability, image_urls, category, description")
      .or(`oem_number.ilike.%${term}%,name.ilike.%${term}%`)
      .limit(50),
    fetchJmByCode(term),
  ]);

  const oem: CatalogPart[] =
    localRes.status === "fulfilled" && localRes.value.data
      ? (localRes.value.data as any[])
          .map(normalizeRow)
          .filter((p) =>
            ALLOWED_OEM_SOURCES.includes(p.catalog_source as (typeof ALLOWED_OEM_SOURCES)[number])
          )
          .sort((a, b) => a.rank - b.rank)
      : [];

  const jm: CatalogPart[] = jmRes.status === "fulfilled" ? jmRes.value : [];

  const oemKeys = new Set(oem.map((p) => normalizeOem(p.oem_number)));
  const cleanJm = jm.filter((p) => !oemKeys.has(normalizeOem(p.oem_number)));

  return { oem: dedupeByOem(oem), jm: dedupeByOem(cleanJm) };
}

// =============================================================
// LEGACY listParts — kept for callers expecting the old API
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
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("parts_new_public")
    .select(
      "id, oem_number, name, manufacturer, catalog_source, price_with_vat, availability, image_urls, category, description, compatible_vehicles",
      { count: "exact" }
    )
    .in("catalog_source", ALLOWED_OEM_SOURCES as unknown as string[]);

  if (filter.brand) q = q.ilike("compatible_vehicles", `%${filter.brand}%`);
  if (filter.model) q = q.ilike("compatible_vehicles", `%${filter.model}%`);
  if (filter.engine) q = q.ilike("compatible_vehicles", `%${filter.engine}%`);
  if (filter.search) {
    const t = filter.search.trim();
    q = q.or(`oem_number.ilike.%${t}%,name.ilike.%${t}%`);
  }
  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) {
    console.error("[catalogV2API] listParts failed:", error.message);
    return { items: [], total: 0 };
  }

  const items = (data || []).map(normalizeRow).sort((a, b) => a.rank - b.rank);
  return { items, total: count || 0 };
}

// =============================================================
// CSV PRICING SYNC (vernostsevyplaci) — NO API
// =============================================================

export async function syncPricesFromCsv(
  rows: Array<{ oem: string; price: number | string }>
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;

  const valid = new Map<string, { oem: string; price: number }>();
  for (const r of rows || []) {
    const oem = String(r?.oem || "").trim();
    const price = Number(r?.price);
    if (!oem || !Number.isFinite(price) || price <= 0 || price > 1_000_000) {
      skipped++;
      continue;
    }
    valid.set(normalizeOem(oem), { oem, price });
  }

  const entries = [...valid.values()];
  const CHUNK = 20;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      chunk.map((e) =>
        supabase.from("parts_new").update({ price_with_vat: e.price }).eq("oem_number", e.oem)
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled" && !r.value.error) updated++;
      else skipped++;
    }
  }

  if (updated > 0) clearCatalogCache();
  return { updated, skipped };
}