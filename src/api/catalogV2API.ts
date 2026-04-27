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
 *
 * Design rules:
 * • Never crash on null prices, never return null lists.
 * • OEM always sorts before aftermarket (rank ASC).
 * • Strict category scoping — no cross-category fallbacks.
 * • All public functions return a safe, typed value.
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

const DE_TO_CS: [RegExp, string][] = [
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
    "Brake System":        "Brzdové zařízení",
    "Engine":              "Motor",
    "Filters":             "Filtry",
    "Suspension":          "Odpružení a nápravy",
    "Steering":            "Řízení",
    "Cooling":             "Chlazení",
    "Electrical":          "Elektroinstalace",
  };
  const mapped = CAT_MAP[raw] ?? raw;
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
// MATCHING LOGIC (OPRAVENO: Backticks a odstranění závorky)
// =============================================================

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
// CACHE
// =============================================================

type CacheEntry<T> = { value: T; expires: number };
const _cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const e = _cache.get(key);
  if (!e || Date.now() > e.expires) return null;
  return e.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  _cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

// =============================================================
// VEHICLE API
// =============================================================

export async function fetchBrands(): Promise<string[]> {
  const cached = cacheGet<string[]>("brands");
  if (cached) return cached;
  const { data, error } = await supabase.from("nextis_vehicles").select("brand");
  if (error) return [];
  const set = new Set<string>();
  (data || []).forEach((r) => r.brand && set.add(r.brand));
  return cacheSet("brands", ALLOWED_BRANDS.filter(b => set.has(b)), 300000);
}

export async function fetchModelsForBrand(brand: string): Promise<string[]> {
  const key = `models:${brand}`;
  const cached = cacheGet<string[]>(key);
  if (cached) return cached;
  const { data, error } = await supabase.from("nextis_vehicles").select("model").eq("brand", brand);
  if (error) return [];
  const set = new Set<string>();
  (data || []).forEach(r => r.model && set.add(r.model));
  return cacheSet(key, [...set].sort(), 300000);
}

export async function fetchEnginesForModel(brand: string, model: string): Promise<string[]> {
  const key = `engines:${brand}:${model}`;
  const cached = cacheGet<string[]>(key);
  if (cached) return cached;
  const { data, error } = await supabase.from("nextis_vehicles").select("engine").eq("brand", brand).eq("model", model);
  if (error) return [];
  const set = new Set<string>();
  (data || []).forEach(r => r.engine && set.add(r.engine));
  return cacheSet(key, [...set].sort(), 300000);
}

export async function fetchNextisVehicles(brand: string, model: string): Promise<NextisVehicle[]> {
  const { data, error } = await supabase.from("nextis_vehicles").select("*").eq("brand", brand).eq("model", model);
  return error ? [] : (data as NextisVehicle[]);
}

export async function resolveVehicleByVin(_vin: string): Promise<NextisVehicle | null> {
  return null;
}

// =============================================================
// PARTS API
// =============================================================

async function fetchLocalRowsForVehicle(opts: {
  brand: string;
  model: string;
  engine?: string | null;
  limit?: number;
}): Promise<any[]> {
  const { data, error } = await supabase
    .from("parts_new_public")
    .select("*")
    .ilike("compatible_vehicles", `%${opts.brand}%`)
    .ilike("compatible_vehicles", `%${opts.model}%`)
    .limit(opts.limit ?? 1000);
  return error ? [] : (data || []);
}

export async function listPartsForVehicle(opts: {
  brand: string;
  model: string;
  engine?: string | null;
  categoryKeywords?: string[];
  page?: number;
  pageSize?: number;
}): Promise<{ items: CatalogPart[]; total: number }> {
  const rows = await fetchLocalRowsForVehicle({ brand: opts.brand, model: opts.model, engine: opts.engine });
  let parts = rows.map(normalizeRow).filter(p => ALLOWED_OEM_SOURCES.includes(p.catalog_source as any));
  
  if (opts.categoryKeywords?.length) {
    parts = parts.filter(p => partMatchesKeywords(p, opts.categoryKeywords!));
  }
  
  parts = dedupeByOem(parts).sort((a, b) => a.rank - b.rank);
  const page = opts.page ?? 0;
  const size = opts.pageSize ?? 30;
  return { items: parts.slice(page * size, (page + 1) * size), total: parts.length };
}

// =============================================================
// J+M & SEARCH (OPRAVENO: Dopsána funkce listParts)
// =============================================================

export async function fetchJmByCode(code: string): Promise<CatalogPart[]> {
  try {
    const { data, error } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "searchByCode", payload: { code } },
    });
    if (error || !data?.success) return [];
    const items = Array.isArray(data?.data?.items) ? data.data.items : [];
    return items.map((it: any) => ({ ...normalizeRow(it), catalog_source: "jm", rank: 5, badge_label: "NÁHRADA", is_oem: false }));
  } catch { return []; }
}

export async function globalOemSearch(query: string): Promise<{ oem: CatalogPart[]; jm: CatalogPart[] }> {
  if (query.length < 2) return { oem: [], jm: [] };
  const [localRes, jmRes] = await Promise.allSettled([
    supabase.from("parts_new_public").select("*").or(`oem_number.ilike.%${query}%,name.ilike.%${query}%`).limit(50),
    fetchJmByCode(query),
  ]);
  const oem = localRes.status === "fulfilled" && localRes.value.data ? localRes.value.data.map(normalizeRow) : [];
  const jm = jmRes.status === "fulfilled" ? jmRes.value : [];
  return { oem: dedupeByOem(oem), jm: dedupeByOem(jm) };
}

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
  if (filter.search) q = q.or(`oem_number.ilike.%${filter.search}%,name.ilike.%${filter.search}%`);
  
  const { data, error, count } = await q.range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) return { items: [], total: 0 };

  return { items: (data || []).map(normalizeRow), total: count || 0 };
 }