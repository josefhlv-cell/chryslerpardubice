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

const normalizeOem = (s: string) => (s || "").toUpperCase().replace(/[\s\-._/]/g, "");

const stripDiacritics = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function normalizeRow(row: any): CatalogPart {
  const source = (row?.catalog_source || "mopar").toLowerCase();
  const isOem = ["mopar", "mopar_oem", "epc", "7zap", "epc-ai", "csv"].includes(source);
  const priceNoVat = Number(row?.price_without_vat);
  const priceWithVat = Number(row?.price_with_vat);
  const hasPrice = priceNoVat > 0 || priceWithVat > 0;
  return {
    id: String(row?.id || Math.random()),
    oem_number: String(row?.oem_number || ""),
    name: String(row?.name || row?.oem_number || "Díl"),
    manufacturer: row?.manufacturer ?? null,
    catalog_source: source,
    price_without_vat: priceNoVat > 0 ? priceNoVat : null,
    price_with_vat: priceWithVat > 0 ? priceWithVat : null,
    availability: hasPrice ? (row?.availability ?? "available") : "on_order",
    image_urls: Array.isArray(row?.image_urls) ? row.image_urls : null,
    category: row?.category ?? null,
    description: row?.description ?? null,
    is_oem: isOem,
    badge_label: isOem ? "ORIGINÁL" : "NÁHRADA",
    rank: isOem ? 1 : 5,
  };
}

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

export async function fetchBrands() {
  const { data } = await supabase.from("nextis_vehicles").select("brand");
  const unique = [...new Set((data || []).map((r) => r.brand))];
  return ALLOWED_BRANDS.filter((b) => unique.includes(b));
}

export async function fetchModelsForBrand(brand: string) {
  const { data } = await supabase.from("nextis_vehicles").select("model").eq("brand", brand);
  return [...new Set((data || []).map((r) => r.model))].sort();
}

export async function fetchEnginesForModel(brand: string, model: string) {
  const { data } = await supabase.from("nextis_vehicles").select("engine").eq("brand", brand).eq("model", model);
  return [...new Set((data || []).map((r) => r.engine))].sort();
}

export async function fetchNextisVehicles(brand: string, model: string) {
  const { data } = await supabase.from("nextis_vehicles").select("*").eq("brand", brand).eq("model", model);
  return (data || []) as NextisVehicle[];
}

/**
 * Canonical product category tree.
 * The `label` MUST exactly match the canonical value stored in `parts_new.category`
 * (after the 2026-04 normalization migration). Counts are filled in from the DB.
 */
const CANONICAL_TREE: Omit<CatalogCategoryNode, "count">[] = [
  {
    id: "brakes", label: "Brzdové zařízení", path: ["Brzdové zařízení"], sectionId: null,
    keywords: ["brzd", "brake", "abs", "třmen", "trmen", "kotouč", "kotouc", "destičk", "destick", "caliper", "rotor"],
    children: [],
  },
  {
    id: "engine", label: "Motor", path: ["Motor"], sectionId: null,
    keywords: ["motor", "engine", "rozvod", "svíčk", "svick", "těsnění", "tesneni", "ventil", "valve", "píst", "pist", "kolben"],
    children: [],
  },
  {
    id: "filters", label: "Filtry", path: ["Filtry"], sectionId: null,
    keywords: ["filtr", "filter", "oelfilter", "luftfilter"],
    children: [],
  },
  {
    id: "cooling", label: "Chlazení", path: ["Chlazení"], sectionId: null,
    keywords: ["chlad", "cool", "radiator", "termostat", "thermostat", "kuehler", "wasserpumpe"],
    children: [],
  },
  {
    id: "suspension", label: "Odpružení", path: ["Odpružení"], sectionId: null,
    keywords: ["odpruž", "odpruz", "tlumič", "tlumic", "náprav", "naprav", "rameno", "suspension", "shock", "spring", "pružin", "silentblok", "stossdaempfer"],
    children: [],
  },
  {
    id: "steering", label: "Řízení", path: ["Řízení"], sectionId: null,
    keywords: ["řízení", "rizeni", "steer", "servolenkung", "tie rod", "kulový čep", "kulovy cep"],
    children: [],
  },
  {
    id: "transmission", label: "Převodovka", path: ["Převodovka"], sectionId: null,
    keywords: ["převod", "prevod", "transmission", "gearbox", "spojk", "clutch", "kupplung"],
    children: [],
  },
  {
    id: "electrical", label: "Elektroinstalace", path: ["Elektroinstalace"], sectionId: null,
    keywords: ["elektr", "alternátor", "alternator", "starter", "anlasser", "senzor", "sensor", "geber", "kabelstrang", "kabelov", "wiring", "steuergeraet", "řídicí jednotka"],
    children: [],
  },
  {
    id: "lighting", label: "Osvětlení", path: ["Osvětlení"], sectionId: null,
    keywords: ["světlomet", "svetlomet", "světlo", "svetlo", "žárovka", "zarovka", "scheinwerfer", "leuchte", "headlight", "bulb"],
    children: [],
  },
  {
    id: "body", label: "Karoserie", path: ["Karoserie"], sectionId: null,
    keywords: ["karoser", "body", "dveře", "dvere", "nárazník", "naraznik", "stossfaenger", "tuer", "blatník", "blatnik", "kapot", "víko", "viko"],
    children: [],
  },
  {
    id: "interior", label: "Interiér", path: ["Interiér"], sectionId: null,
    keywords: ["interiér", "interier", "interior", "sedadl", "obložení", "oblozeni", "verkleidung"],
    children: [],
  },
  {
    id: "hvac", label: "Klimatizace", path: ["Klimatizace"], sectionId: null,
    keywords: ["klimat", "topen", "a/c", "hvac", "kompresor klima", "condenser"],
    children: [],
  },
  {
    id: "exhaust", label: "Výfuk", path: ["Výfuk"], sectionId: null,
    keywords: ["výfuk", "vyfuk", "exhaust", "katalyz", "schalldaempfer", "muffler"],
    children: [],
  },
  {
    id: "fuel", label: "Palivový systém", path: ["Palivový systém"], sectionId: null,
    keywords: ["palivo", "fuel", "vstřik", "vstrik", "injektor", "injector", "kraftstoff"],
    children: [],
  },
  {
    id: "fluids", label: "Kapaliny a oleje", path: ["Kapaliny a oleje"], sectionId: null,
    keywords: ["olej", "oil", "kapalin", "fluid", "mazi", "atf", "dot 4"],
    children: [],
  },
  {
    id: "maintenance", label: "Údržba", path: ["Údržba"], sectionId: null,
    keywords: ["údržba", "udrzba", "service", "maintenance", "sada"],
    children: [],
  },
  {
    id: "tyres", label: "Pneumatiky", path: ["Pneumatiky"], sectionId: null,
    keywords: ["pneu", "tyre", "tire"],
    children: [],
  },
  {
    id: "accessories", label: "Příslušenství", path: ["Příslušenství"], sectionId: null,
    keywords: ["příslušenství", "prislusenstvi", "accessor"],
    children: [],
  },
  {
    id: "other", label: "Ostatní", path: ["Ostatní"], sectionId: null,
    keywords: [],
    children: [],
  },
];

/**
 * Build the category tree with real counts derived from parts_new for the given vehicle.
 * Counts use exact match on the canonical `category` column (post-migration values).
 */
export async function fetchJmCategoryTree(opts: {
  brand?: string;
  model?: string;
  engine?: string;
  nextisVehicleId?: string;
}): Promise<CatalogCategoryNode[]> {
  const tree: CatalogCategoryNode[] = CANONICAL_TREE.map((node) => ({ ...node, count: 0 }));

  try {
    let query = supabase.from("parts_new_public").select("category", { count: "exact", head: false }).limit(5000);
    if (opts?.brand) query = query.ilike("compatible_vehicles", `%${opts.brand}%`);
    if (opts?.model) query = query.ilike("compatible_vehicles", `%${opts.model}%`);
    const { data } = await query;
    const counts = new Map<string, number>();
    for (const row of (data || []) as Array<{ category: string | null }>) {
      const c = (row.category || "Ostatní").trim();
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    for (const node of tree) {
      node.count = counts.get(node.label) || 0;
    }
  } catch (err) {
    console.warn("[catalogV2API] category count failed", err);
  }

  // Hide empty leaves except "Ostatní" (always shown as fallback)
  return tree.filter((n) => n.count > 0 || n.id === "other");
}

export async function fetchJmForVehicle(opts: any) {
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", { body: { action: "searchByVehicle", payload: opts } });
    return { items: (data?.data?.items || []).map((it: any) => normalizeRow(it)), warning: data?.warning };
  } catch {
    return { items: [] };
  }
}

export async function fetchJmByCodes(codes: string[]) {
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", { body: { action: "searchByCodes", payload: { codes } } });
    return (data?.data?.items || []).map((it: any) => normalizeRow(it));
  } catch {
    return [];
  }
}

export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]) {
  const map = new Map<string, CatalogPart>();
  (oem || []).forEach((p) => map.set(normalizeOem(p.oem_number), p));
  (jm || []).forEach((p) => {
    const key = normalizeOem(p.oem_number);
    if (!map.has(key)) map.set(key, p);
  });
  return Array.from(map.values()).sort((a, b) => a.rank - b.rank);
}

/**
 * List parts for a vehicle filtered by canonical category.
 * Strict: matches `parts_new.category = canonicalCategory`.
 * Falls back to keyword match in `name` if zero exact-category hits (handles legacy rows).
 */
export async function listPartsForVehicle(opts: {
  brand: string;
  model: string;
  engine?: string;
  canonicalCategory?: string;
  categoryKeywords?: string[];
  page?: number;
  pageSize?: number;
}) {
  const pageSize = opts.pageSize || 30;
  const page = opts.page || 0;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  // Primary query: exact canonical category
  let q = supabase
    .from("parts_new_public")
    .select("*", { count: "exact" })
    .ilike("compatible_vehicles", `%${opts.brand}%`)
    .ilike("compatible_vehicles", `%${opts.model}%`);

  if (opts.canonicalCategory) {
    q = q.eq("category", opts.canonicalCategory);
  }

  q = q.range(from, to).order("price_without_vat", { ascending: false, nullsFirst: false });

  const { data, count } = await q;
  let items = (data || []).map(normalizeRow);
  let total = count || items.length;

  // Fallback: if exact-category yielded 0 but we have keywords, try keyword match in name
  if (items.length === 0 && (opts.categoryKeywords?.length || 0) > 0) {
    const orFilter = opts
      .categoryKeywords!.slice(0, 8)
      .map((k) => `name.ilike.%${k}%`)
      .join(",");
    let q2 = supabase
      .from("parts_new_public")
      .select("*", { count: "exact" })
      .ilike("compatible_vehicles", `%${opts.brand}%`)
      .ilike("compatible_vehicles", `%${opts.model}%`)
      .or(orFilter)
      .range(from, to);
    const { data: data2, count: count2 } = await q2;
    items = (data2 || []).map(normalizeRow);
    total = count2 || items.length;
  }

  return { items, total };
}
