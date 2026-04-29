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

// Legacy DB-shape category node (used by older CatalogTree component)
export type CategoryNode = {
  id: string;
  parent_id: string | null;
  slug: string;
  name_cs: string;
  name_en: string | null;
  node_type: string;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_engine: string | null;
  is_global: boolean;
  sort_order: number;
  children?: CategoryNode[];
};

export type NextisVehicle = {
  id: string;
  brand: string;
  model: string;
  engine: string | null;
  year_from?: number | null;
  year_to?: number | null;
};

// Legacy global OEM search (used by GlobalOEMSearch component)
// Legacy global OEM search (used by GlobalOEMSearch component)
export async function globalOemSearch(query: string): Promise<{ oem: CatalogPart[]; jm: CatalogPart[] }> {
  const q = (query || "").trim();
  if (!q) return { oem: [], jm: [] };
  const { data } = await supabase
    .from("parts_new")
    .select("*")
    .or(`oem_number.ilike.%${q}%,name.ilike.%${q}%`)
    .limit(50);
  const all = (data || []).map(normalizeRow);
  return {
    oem: all.filter((p) => p.is_oem),
    jm: all.filter((p) => !p.is_oem),
  };
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

// Static product category tree — mirrors PRODUCT_CATEGORY_TREE in jm-proxy.
// Returns CatalogCategoryNode[] with proper shape (label, keywords, children, count).
// We don't fetch from DB because catalog_categories stores vehicle hierarchy,
// not product categories. The product tree is small and stable.
const PRODUCT_TREE: CatalogCategoryNode[] = [
  {
    id: "brakes", label: "Brzdové zařízení", path: ["Brzdové zařízení"], sectionId: null, count: 0,
    keywords: ["brzd", "brake", "abs", "třmen", "trmen", "kotouč", "kotouc", "destičk", "destick"],
    children: [
      {
        id: "disc-brakes", label: "Kotoučové brzdy", path: ["Brzdové zařízení", "Kotoučové brzdy"], sectionId: null, count: 0,
        keywords: ["brzd", "brake", "kotouč", "kotouc", "destičk", "destick", "třmen", "trmen"],
        children: [
          { id: "brake-pads", label: "Brzdové destičky", path: ["Brzdové zařízení", "Kotoučové brzdy", "Brzdové destičky"], sectionId: null, count: 0, keywords: ["destičk", "destick", "brake pad", "pads"], children: [] },
          { id: "brake-discs", label: "Brzdové kotouče", path: ["Brzdové zařízení", "Kotoučové brzdy", "Brzdové kotouče"], sectionId: null, count: 0, keywords: ["kotouč", "kotouc", "disc", "rotor"], children: [] },
          { id: "brake-calipers", label: "Brzdové třmeny", path: ["Brzdové zařízení", "Kotoučové brzdy", "Brzdové třmeny"], sectionId: null, count: 0, keywords: ["třmen", "trmen", "caliper"], children: [] },
        ],
      },
      { id: "brake-fluid", label: "Brzdová kapalina", path: ["Brzdové zařízení", "Brzdová kapalina"], sectionId: null, count: 0, keywords: ["brzdová kapalina", "brzdova kapalina", "brake fluid", "dot 3", "dot 4"], children: [] },
      { id: "abs", label: "ABS a snímače", path: ["Brzdové zařízení", "ABS a snímače"], sectionId: null, count: 0, keywords: ["abs", "snímač", "snimac", "sensor"], children: [] },
    ],
  },
  { id: "engine", label: "Motor", path: ["Motor"], sectionId: null, count: 0, keywords: ["motor", "engine", "rozvod", "svíčk", "svick", "těsnění", "tesneni"], children: [] },
  { id: "filters", label: "Filtry", path: ["Filtry"], sectionId: null, count: 0, keywords: ["filtr", "filter"], children: [] },
  { id: "cooling", label: "Chlazení", path: ["Chlazení"], sectionId: null, count: 0, keywords: ["chlad", "cool", "radiator", "termostat"], children: [] },
  { id: "suspension", label: "Odpružení", path: ["Odpružení"], sectionId: null, count: 0, keywords: ["odpruž", "odpruz", "tlumič", "tlumic", "náprav", "naprav", "rameno", "suspension"], children: [] },
  { id: "steering", label: "Řízení", path: ["Řízení"], sectionId: null, count: 0, keywords: ["řízení", "rizeni", "steer"], children: [] },
  { id: "transmission", label: "Převodovka", path: ["Převodovka"], sectionId: null, count: 0, keywords: ["převod", "prevod", "transmission", "gearbox"], children: [] },
  { id: "electrical", label: "Elektroinstalace", path: ["Elektroinstalace"], sectionId: null, count: 0, keywords: ["elektr", "alternátor", "alternator", "starter", "senzor"], children: [] },
  { id: "body", label: "Karoserie", path: ["Karoserie"], sectionId: null, count: 0, keywords: ["karoser", "body", "dveře", "dvere", "nárazník", "naraznik"], children: [] },
  { id: "hvac", label: "Klimatizace", path: ["Klimatizace"], sectionId: null, count: 0, keywords: ["klimat", "topen", "a/c", "hvac"], children: [] },
  { id: "exhaust", label: "Výfuk", path: ["Výfuk"], sectionId: null, count: 0, keywords: ["výfuk", "vyfuk", "exhaust", "katalyz"], children: [] },
  { id: "fluids", label: "Kapaliny a oleje", path: ["Kapaliny a oleje"], sectionId: null, count: 0, keywords: ["olej", "oil", "kapalin", "fluid", "mazi"], children: [] },
];

export async function fetchJmCategoryTree(_opts: any): Promise<CatalogCategoryNode[]> {
  // Return cloned static tree so callers can mutate counts without polluting source.
  return PRODUCT_TREE.map((node) => structuredClone(node));
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
