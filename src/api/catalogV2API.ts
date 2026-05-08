import { supabase } from "@/integrations/supabase/client";

export const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"] as const;

async function logCatalogEvent(params: {
  level?: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  message?: string;
  oem_number?: string | null;
  vehicle_id?: string | null;
  category?: string | null;
  duration_ms?: number;
  details?: Record<string, unknown>;
}) {
  try {
    await (supabase as any).from('catalog_event_log').insert({
      source: 'catalogV2API',
      level: params.level ?? 'info',
      event: params.event,
      message: params.message ?? null,
      oem_number: params.oem_number ?? null,
      vehicle_id: params.vehicle_id ?? null,
      category: params.category ?? null,
      duration_ms: params.duration_ms ?? null,
      details: params.details ?? {},
    });
  } catch (e) {
    if ((e as any)?.code && (e as any).code !== '42501') {
      console.warn('[catalogV2API.log] insert failed:', e);
    }
  }
}

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
  final_price: number | null;
  markup_percent: number;
  technical_parameters?: Record<string, string> | null;
  compatible_vehicles?: string[] | null;
  related_oem_number?: string | null;
  oe_numbers?: string[] | null;
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
  power_kw?: number | null;
};

const DE_TO_CS: Record<string, string> = {
  'BREMSBELAG SATZ': 'Sada brzdových destiček',
  'BREMSBELAG VORNE': 'Brzdové destičky přední',
  'BREMSBELAG HINTEN': 'Brzdové destičky zadní',
  'BREMSSCHEIBE VORNE': 'Brzdový kotouč přední',
  'BREMSSCHEIBE HINTEN': 'Brzdový kotouč zadní',
  'BREMSENCHEIBE VORNE': 'Brzdový kotouč přední',
  'BREMSENCHEIBE HINTEN': 'Brzdový kotouč zadní',
  'BREMSSATTEL VORNE': 'Brzdový třmen přední',
  'BREMSSATTEL HINTEN': 'Brzdový třmen zadní',
  'BREMSZYLINDER': 'Brzdový válec',
  'BREMSFLUEESSIGKEIT': 'Brzdová kapalina',
  'ABS VENTIL': 'ABS ventil',
  'ABS PUMPE': 'ABS čerpadlo',
  'ZAHNRIEMEN': 'Rozvodový řemen',
  'ZAHNRIEMEN SATZ': 'Sada rozvodového řemene',
  'ZYLINDERKOPF': 'Hlava válců',
  'OELWANNE': 'Olejová vana',
  'OELFILTER': 'Olejový filtr',
  'ZUENDKERZE': 'Zapalovací svíčka',
  'WASSERPUMPE': 'Vodní čerpadlo',
  'WASSERPUMPE KOMPLETT': 'Vodní čerpadlo kompletní',
  'KUEHLER': 'Chladič',
  'KUEHLER KOMBI': 'Chladič kombinovaný',
  'KUEHLFLUEESSIGKEIT': 'Chladící kapalina',
  'THERMOSTAT': 'Termostat',
  'VENTILATOR': 'Ventilátor',
  'STOSSDAEMPFER': 'Tlumič nárazů',
  'SPANNFEDER': 'Pružina',
  'LICHTMASCHINE': 'Alternátor',
  'ANLASSER': 'Startér',
  'BATTERIE': 'Baterie',
  'RELAIS': 'Relé',
  'LUFTFILTER': 'Vzduchový filtr',
  'KABINNENFILTER': 'Filtr kabiny',
  'KRAFTSTOFFFILTER': 'Palivový filtr',
  'KRAFTSTOFFPUMPE': 'Palivové čerpadlo',
  'EINSPRITZVENTIL': 'Vstřikovací ventil',
  'GETRIEBE': 'Převodovka',
  'KUPPPLUNG': 'Spojka',
  'KUPPPLUNG SATZ': 'Sada spojky',
  'KUPPLUNG SCHEIBE': 'Kotouč spojky',
  'TUEER': 'Dveře',
  'MOTORHAUBE': 'Kapota motoru',
  'STOSSSTANGE': 'Nárazník',
  'TUERKGRIFF': 'Rukojeť dveří',
  'SITZ': 'Sedadlo',
  'AIRBAG': 'Airbag',
  'MOTOROEL': 'Motorový olej',
  'GETRIEBEOEL': 'Převodový olej',
  'DIFFERENZIALOEL': 'Diferenciálový olej',
};

// OPRAVA 1: Slovenské/ruské AI překlady → česky
const SK_RU_TO_CS: Record<string, string> = {
  'klieste': 'třmen', 'kliesce': 'třmen',
  'brzdove': 'brzdové', 'predne': 'přední', 'zadne': 'zadní',
  'pred': 'přední', 'zad': 'zadní', 'lavy': 'levý', 'pravy': 'pravý',
  'rukojet': 'rukojeť', 'drzadlo': 'madlo', 'rucka': 'rukojeť',
  'kotuc': 'kotouč', 'desticky': 'destičky', 'hadica': 'hadice',
  'cerpadlo': 'čerpadlo', 'filter': 'filtr',
  'ventil': 'ventil', 'senzor': 'senzor', 'kapalina': 'kapalina',
};

const normalizeOem = (s: string) => (s || "").toUpperCase().replace(/[\s\-._/]/g, "");

const stripDiacritics = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function sanitizeName(raw: string): string {
  if (!raw) return '—';
  let text = String(raw || "").trim();

  // Přeložení německých výrazů (delší fráze první)
  const deEntries = Object.entries(DE_TO_CS).sort((a, b) => b[0].length - a[0].length);
  for (const [de, cs] of deEntries) {
    const regex = new RegExp(`\\b${de}\\b`, 'gi');
    text = text.replace(regex, cs);
  }

  // Přeložení slovenských/ruských slov
  const words = text.split(/\s+/);
  const translated = words.map(w => {
    const key = w.toLowerCase().replace(/[^a-záčďéěíňóřšťúůýžaeiouy]/g, '');
    return SK_RU_TO_CS[key] || w;
  });
  text = translated.join(' ');

  text = text.replace(/\s+/g, ' ').trim();

  // Pokud celé uppercase → Title Case
  if (text === text.toUpperCase() && text.length > 3) {
    text = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }
  // Vždy kapitalizuj první písmeno
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  return text || '—';
}

const unwrapFunctionPayload = (payload: any) => payload?.data ?? payload ?? {};

function calculateFinalPrice(basePrice: number | null, source: string): { final: number | null; markup: number } {
  if (basePrice === null) return { final: null, markup: 0 };
  if (source === 'jm') {
    return { final: Number((basePrice * 1.37).toFixed(2)), markup: 37 };
  }
  return { final: basePrice, markup: 0 };
}

const DISABLED_AFTERMARKET_SOURCES = new Set([
  'makro', 'sag', 'autokelly', 'epc-ai', 'ai-epc', 'crossref', 'ai',
]);

export function isDisabledAftermarketSource(source: string | null | undefined): boolean {
  return DISABLED_AFTERMARKET_SOURCES.has(String(source || '').toLowerCase());
}

// OPRAVA 2: Filtruj i AI-generované názvy (slovenština/ruština/nesmysly)
const AI_BAD_NAME_PATTERNS = [
  /klieste/i, /kliesce/i,
  /rukojet\s+drzadl/i,
  /nakl[aá]dka/i,
  /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{3,}\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{3,}\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{3,}$/,
];

function isAiBadName(name: string): boolean {
  return AI_BAD_NAME_PATTERNS.some(p => p.test(name || ''));
}

function filterDisabledSources(parts: CatalogPart[]): CatalogPart[] {
  return parts.filter((p) => {
    if (isDisabledAftermarketSource(p.catalog_source)) return false;
    if (isAiBadName(p.name)) return false;
    return true;
  });
}

function deduplicateParts(parts: CatalogPart[]): CatalogPart[] {
  const seen = new Map();
  const sorted = parts.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const aPrice = a.final_price || 999999;
    const bPrice = b.final_price || 999999;
    return aPrice - bPrice;
  });
  for (const part of sorted) {
    const key = part.catalog_source === 'jm' && part.related_oem_number
      ? `jm:${normalizeOem(part.related_oem_number)}:${normalizeOem(part.oem_number)}`
      : normalizeOem(part.oem_number);
    if (!seen.has(key)) seen.set(key, part);
  }
  return Array.from(seen.values());
}

function normalizeRow(row: any, source?: string): CatalogPart {
  const sourceNorm = String(source || row?.catalog_source || row?.supplier || 'mopar').toLowerCase();
  const mfr = String(row?.manufacturer || '').trim().toLowerCase();
  const oemSources = ['mopar', 'mopar_oem', '7zap', 'epc-link'];
  const aftermarketSources = ['epc-ai', 'ai-epc', 'makro', 'autokelly', 'crossref', 'sag', 'jm', 'ai'];
  const isAftermarket = aftermarketSources.includes(sourceNorm);
  const isVerifiedOem = oemSources.includes(sourceNorm) || (sourceNorm === 'csv' && mfr === 'mopar');
  const isOem = !isAftermarket && isVerifiedOem;
  const basePrice = Number(row?.price_with_vat) || null;
  const { final: finalPrice, markup } = calculateFinalPrice(basePrice, sourceNorm);
  const priceNoVat = Number(row?.price_without_vat);
  const hasPrice = (basePrice && basePrice > 0) || (priceNoVat && priceNoVat > 0);
  const manufacturer = row?.manufacturer ?? row?.brand ?? null;

  let description: string | null = row?.description ?? null;
  if (!description && Array.isArray(row?.oe_numbers) && row.oe_numbers.length > 0) {
    description = `OE čísla: ${row.oe_numbers.slice(0, 8).join(', ')}`;
  } else if (description && Array.isArray(row?.oe_numbers) && row.oe_numbers.length > 0) {
    description = `${description}\n\nOE čísla: ${row.oe_numbers.slice(0, 8).join(', ')}`;
  }

  let technical_parameters: Record<string, string> | null = null;
  if (row?.technical_parameters && typeof row.technical_parameters === 'object' && !Array.isArray(row.technical_parameters)) {
    const entries = Object.entries(row.technical_parameters).filter(([, v]) => v != null && String(v).trim() !== '');
    technical_parameters = entries.length > 0 ? Object.fromEntries(entries) as Record<string, string> : null;
  }

  return {
    id: String(row?.id || `${sourceNorm}-${row?.oem_number || Math.random()}`),
    oem_number: String(row?.oem_number || ''),
    name: sanitizeName(String(row?.name || row?.oem_number || 'Díl')),
    manufacturer: manufacturer ? String(manufacturer).trim() : null,
    catalog_source: sourceNorm,
    price_without_vat: priceNoVat > 0 ? priceNoVat : null,
    price_with_vat: basePrice,
    availability: hasPrice ? (row?.availability ?? 'available') : 'on_order',
    image_urls: Array.isArray(row?.image_urls) ? row.image_urls : null,
    category: row?.category ?? null,
    description,
    is_oem: isOem,
    badge_label: isOem ? 'ORIGINÁL' : isAftermarket ? 'NÁHRADA' : 'NEZNÁMÝ',
    rank: isOem ? 1 : isAftermarket ? 5 : 9,
    final_price: finalPrice,
    markup_percent: markup,
    technical_parameters,
    compatible_vehicles: Array.isArray(row?.compatible_vehicles) ? row.compatible_vehicles : null,
    related_oem_number: row?.related_oem_number ? String(row.related_oem_number) : null,
    oe_numbers: Array.isArray(row?.oe_numbers) && row.oe_numbers.length > 0
      ? row.oe_numbers.map((x: any) => String(x)).filter(Boolean)
      : null,
  };
}

export async function globalOemSearch(query: string): Promise<{ oem: CatalogPart[]; jm: CatalogPart[] }> {
  const q = (query || "").trim();
  if (!q) return { oem: [], jm: [] };
  try {
    const { data } = await supabase
      .from("parts_new")
      .select("*")
      .or(`oem_number.ilike.%${q}%,name.ilike.%${q}%`)
      .limit(50);
    const oemParts = filterDisabledSources((data || []).map(p => normalizeRow(p)));
    const jmResult = await supabase.functions.invoke('jm-proxy', {
      body: { action: 'searchByCode', payload: { code: q } }
    });
    const jmPayload = unwrapFunctionPayload(jmResult?.data);
    const jmParts = (jmPayload?.items || []).map((it: any) => normalizeRow(it, 'jm'));
    return { oem: oemParts, jm: jmParts };
  } catch (err) {
    console.error('[globalOemSearch] error:', err);
    return { oem: [], jm: [] };
  }
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

// OPRAVA 3: catalog_jm_tree flag je VŽDY false - lokální strom je rozbitý
// Používáme výhradně live jm-proxy vehicleCategories
export async function isJmTreeFlagEnabled(): Promise<boolean> {
  return false; // Lokální strom obsahuje brand uzly jako kategorie → vypnuto natvrdo
}

async function fetchLocalCategoryTree(opts: { brand?: string; model?: string; engine?: string; year?: number; powerKw?: number }): Promise<CatalogCategoryNode[]> {
  const { data, error } = await supabase
    .from("catalog_categories")
    .select("id, parent_id, slug, name_cs, node_type, is_global, sort_order, vehicle_brand, vehicle_model, vehicle_engine, year_from, year_to, power_kw")
    .eq("node_type", "category")   // OPRAVA: jen kategorie dílů, ne brand/model uzly
    .eq("is_global", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];

  const scoped = data.filter((n: any) => {
    if (opts.brand && n.vehicle_brand && n.vehicle_brand.toLowerCase() !== opts.brand.toLowerCase()) return false;
    if (opts.model && n.vehicle_model && n.vehicle_model.toLowerCase() !== opts.model.toLowerCase()) return false;
    if (opts.engine && n.vehicle_engine && n.vehicle_engine.toLowerCase() !== opts.engine.toLowerCase()) return false;
    return true;
  });

  const byParent = new Map<string | null, any[]>();
  for (const n of scoped) {
    const k = n.parent_id || null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(n);
  }

  type PartMeta = { name: string; category: string };
  const partsForCount: PartMeta[] = [];
  const canonicalCounts = new Map<string, number>();

  if (opts.brand && opts.model && opts.engine) {
    const { data: vRow } = await supabase
      .from("nextis_vehicles")
      .select("id")
      .ilike("brand", opts.brand)
      .ilike("model", opts.model)
      .ilike("engine", opts.engine)
      .maybeSingle();
    if (vRow?.id) {
      const { data: scopedRows } = await supabase
        .from("catalog_vehicle_compatibility")
        .select("part_id, parts_new!inner(name, category)")
        .eq("nextis_vehicle_id", vRow.id)
        .limit(20000);
      for (const row of (scopedRows || []) as any[]) {
        const cat = String(row?.parts_new?.category || "Ostatní");
        const name = String(row?.parts_new?.name || "");
        partsForCount.push({ name, category: cat });
        canonicalCounts.set(cat, (canonicalCounts.get(cat) || 0) + 1);
      }
    }
  }
  if (partsForCount.length === 0) {
    const { data: countRows } = await supabase
      .from("parts_new_public")
      .select("name, category")
      .limit(20000);
    for (const row of countRows || []) {
      const name = String((row as any).name || "");
      const cat = String((row as any).category || "Ostatní");
      partsForCount.push({ name, category: cat });
      canonicalCounts.set(cat, (canonicalCounts.get(cat) || 0) + 1);
    }
  }

  const normalizeForCount = (s: string) =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const partsHaystack = partsForCount.map((p) => normalizeForCount(`${p.name} ${p.category}`));

  const SUBCAT_KEYWORDS: Record<string, string[]> = {
    "brzdová kapalina": ["kapalin", "fluid", "dot 3", "dot 4", "brake fluid"],
    "brzdové hadičky": ["hadic", "trubk", "hose", "brake line"],
    "brzdový třmen": ["třmen", "trmen", "sattel", "caliper"],
    "brzdový váleček": ["válec", "valec", "zylinder", "cylinder"],
    "bubnová brzda": ["bubn", "drum", "trommel", "čelist", "shoe"],
    "kotoučová brzda": ["destič", "destic", "pad", "belag", "kotouč", "kotouc", "scheibe", "rotor"],
    "brzdové obložení": ["destič", "destic", "pad", "belag", "obložen"],
    "brzdový kotouč": ["kotouč brzdov", "brzdový kotouč", "scheibe", "brake disc", "brake rotor"],
    "abs a snímače": ["abs", "snímač", "snimac", "sensor"],
    "filtr oleje": ["olejov filtr", "oil filter"],
    "vzduchový filtr": ["vzduch", "luftfilter", "air filter"],
    "filtr kabiny": ["kabin", "pollen", "cabin filter"],
    "palivový filtr": ["palivový filtr", "kraftstofffilter", "fuel filter"],
  };

  const countForSubcategoryLabel = (label: string): number => {
    const normLabel = normalizeForCount(label);
    const keywords = (SUBCAT_KEYWORDS[normLabel] || [normLabel]).map(normalizeForCount).filter(Boolean);
    if (keywords.length === 0) return 0;
    return partsHaystack.filter(hay => keywords.some(k => hay.includes(k))).length;
  };

  const nodeCounts = new Map<string, number>();
  const { data: mappedRows } = await supabase
    .from("catalog_part_categories")
    .select("category_id")
    .limit(10000);
  for (const row of mappedRows || []) {
    const key = String((row as any).category_id || "");
    if (key) nodeCounts.set(key, (nodeCounts.get(key) || 0) + 1);
  }

  const globalRoots = (byParent.get(null) || []).filter((n: any) => n.node_type === 'category' && n.is_global);
  if (globalRoots.length > 0) {
    const buildGlobal = (parentId: string, path: string[]): CatalogCategoryNode[] => {
      const kids = (byParent.get(parentId) || []).filter((k: any) => k.node_type === 'subcategory');
      return kids.map((k: any) => ({
        id: k.id,
        label: k.name_cs,
        path: [...path, k.slug],
        keywords: [k.name_cs],
        count: nodeCounts.get(k.id) ?? countForSubcategoryLabel(k.name_cs),
        sectionId: null,
        children: buildGlobal(k.id, [...path, k.slug]),
      }));
    };
    return globalRoots
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((n: any) => {
        const children = buildGlobal(n.id, [n.slug]);
        return {
          id: n.id,
          label: n.name_cs,
          path: [n.slug],
          keywords: [n.name_cs],
          count: children.reduce((s, c) => s + c.count, 0) || canonicalCounts.get(n.name_cs) || 0,
          sectionId: null,
          children,
        };
      });
  }
  return [];
}

export async function fetchJmCategoryTree(opts: any) {
  // Lokální strom je vypnutý (catalog_jm_tree = false natvrdo)
  // Vždy používáme live jm-proxy vehicleCategories
  try {
    const { data } = await supabase.functions.invoke('jm-proxy', {
      body: { action: 'vehicleCategories', payload: opts }
    });
    const payload = unwrapFunctionPayload(data);
    return Array.isArray(payload?.categories) ? payload.categories : [];
  } catch (err) {
    console.error('[fetchJmCategoryTree] error:', err);
    return [];
  }
}

export async function fetchJmForVehicle(opts: any) {
  try {
    const { data, error } = await supabase.functions.invoke('jm-proxy', {
      body: { action: 'searchByVehicle', payload: opts }
    });
    if (error) {
      console.warn('[fetchJmForVehicle] error:', error);
      return { items: [], warning: 'Katalog dočasně nedostupný' };
    }
    const payload = unwrapFunctionPayload(data);
    return {
      items: (payload?.items || []).map((it: any) => normalizeRow(it, 'jm')),
      warning: payload?.warning
    };
  } catch (err) {
    console.error('[fetchJmForVehicle] exception:', err);
    return { items: [], warning: String(err) };
  }
}

const _jmCodeCache = new Map<string, { items: CatalogPart[]; ts: number }>();
const JM_CODE_TTL = 5 * 60 * 1000;

export async function fetchJmByCodes(codes: string[]) {
  const uniq = [...new Set(codes.filter(Boolean))];
  if (uniq.length === 0) return [];
  const fresh: string[] = [];
  const cached: CatalogPart[] = [];
  const now = Date.now();
  for (const code of uniq) {
    const hit = _jmCodeCache.get(code);
    if (hit && now - hit.ts < JM_CODE_TTL) cached.push(...hit.items);
    else fresh.push(code);
  }
  const results = await Promise.allSettled(
    fresh.map((code) =>
      supabase.functions
        .invoke('jm-proxy', { body: { action: 'searchByCode', payload: { code } } })
        .then(({ data }) => {
          const payload = unwrapFunctionPayload(data);
          const items: CatalogPart[] = (payload?.items || []).map((it: any) => normalizeRow(it, 'jm'));
          _jmCodeCache.set(code, { items, ts: Date.now() });
          return items;
        })
    )
  );
  const fetched: CatalogPart[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') fetched.push(...r.value);
    else console.warn(`[fetchJmByCodes] code ${fresh[i]} failed:`, r.reason);
  });
  return [...cached, ...fetched];
}

const MAX_JM_PER_OEM = 3;
const MAX_JM_TOTAL = 30;

export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]) {
  const oemClean = filterDisabledSources(oem);
  const jmClean = filterDisabledSources(jm);
  if (oemClean.length === 0) return [];

  const baseKey = (oem: string) => normalizeOem(oem).replace(/^K/, '').match(/^\d{8}/)?.[0] || normalizeOem(oem);
  const oemBaseSet = new Set(oemClean.map((p) => baseKey(p.oem_number)));

  const jmSorted = [...jmClean].sort((a, b) => {
    const priceA = (a.price_with_vat ?? 0) > 0 ? 1 : 0;
    const priceB = (b.price_with_vat ?? 0) > 0 ? 1 : 0;
    if (priceA !== priceB) return priceB - priceA;
    const photoA = a.image_urls?.[0] ? 1 : 0;
    const photoB = b.image_urls?.[0] ? 1 : 0;
    if (photoA !== photoB) return photoB - photoA;
    const brandA = (a.manufacturer || '').trim().length > 0 ? 1 : 0;
    const brandB = (b.manufacturer || '').trim().length > 0 ? 1 : 0;
    return brandB - brandA;
  });

  const perOemCount = new Map<string, number>();
  const jmKept: CatalogPart[] = [];
  for (const part of jmSorted) {
    if (jmKept.length >= MAX_JM_TOTAL) break;
    const ownKey = baseKey(part.oem_number);
    const relKey = part.related_oem_number ? baseKey(part.related_oem_number) : null;
    const oeKeys = (part.oe_numbers || []).map((oe) => baseKey(oe)).filter(Boolean);

    let linkKey: string | null = null;
    if (oemBaseSet.has(ownKey)) linkKey = ownKey;
    else if (relKey && oemBaseSet.has(relKey)) linkKey = relKey;
    else {
      for (const oeKey of oeKeys) {
        if (oemBaseSet.has(oeKey)) { linkKey = oeKey; break; }
      }
    }
    // Fallback: má OE propojení ale číslo není v DB → propustit pod první OEM
    if (!linkKey && (relKey || oeKeys.length > 0)) {
      linkKey = [...oemBaseSet][0] || null;
    }
    if (!linkKey) continue;
    const cur = perOemCount.get(linkKey) || 0;
    if (cur >= MAX_JM_PER_OEM) continue;
    perOemCount.set(linkKey, cur + 1);
    jmKept.push(part);
  }
  return deduplicateParts([...oemClean, ...jmKept]);
}

function finalizeCatalogRows(rows: any[], from: number, to: number) {
  const activeRows = (rows || []).filter((r: any) => r?.is_active !== false);
  const all = filterDisabledSources(deduplicateParts(activeRows.map((row) => normalizeRow(row))));
  return { items: all.slice(from, to + 1), total: all.length };
}

// OPRAVA 4: SUBCATEGORY_TO_CANONICAL - brzdy rozděleny přesněji
const SUBCATEGORY_TO_CANONICAL: Array<{ keywords: string[]; canonical: string }> = [
  { keywords: ['airbag', 'bezpe', 'pas '], canonical: 'Bezpečnostní systém' },
  { keywords: ['brzdová kapalin', 'brake fluid', 'dot 3', 'dot 4'], canonical: 'Brzdové zařízení' },
  { keywords: ['brzdový třmen', 'třmen', 'caliper', 'sattel', 'bremssattel'], canonical: 'Brzdové zařízení' },
  { keywords: ['brzdový kotouč', 'kotouč brzdov', 'brake disc', 'brake rotor', 'bremsscheibe'], canonical: 'Brzdové zařízení' },
  { keywords: ['brzdové destičky', 'destič', 'brake pad', 'bremsbelag', 'oblož'], canonical: 'Brzdové zařízení' },
  { keywords: ['abs', 'bubn', 'drum brake', 'brzdový válec', 'wheel cylinder', 'brzd'], canonical: 'Brzdové zařízení' },
  { keywords: ['stěrač', 'ostřik', 'čištění skel'], canonical: 'Čištění skel' },
  { keywords: ['servis', 'údržb', 'nářad'], canonical: 'Údržba' },
  { keywords: ['filtr'], canonical: 'Filtry' },
  { keywords: ['chlad', 'termostat', 'vodní čerpadl', 'ventilátor chla', 'expanzní'], canonical: 'Chlazení' },
  { keywords: ['rádio', 'reproduktor', 'navigac', 'displej'], canonical: 'Informační / komunikační systém' },
  { keywords: ['karoser', 'nárazn', 'kapot', 'dveř', 'blatn', 'maska', 'sklo', 'zrcátk', 'zrcadl'], canonical: 'Karosérie' },
  { keywords: ['klimat', 'topení', 'kompresor klima', 'kondenz'], canonical: 'Klimatizace' },
  { keywords: ['pneu', 'kolo', 'disk', 'ráfek'], canonical: 'Pneumatiky' },
  { keywords: ['sedadl', 'koberec', 'palubní deska', 'interi'], canonical: 'Komfortní systémy' },
  { keywords: ['motor', 'hlava válc', 'olejová van', 'vačk', 'klikov', 'pístn', 'turbo', 'rozvod'], canonical: 'Motor' },
  { keywords: ['odpruž', 'tlumič', 'pružin', 'rameno', 'silentbl', 'stabiliz', 'ložisko'], canonical: 'Odpružení' },
  { keywords: ['palivov', 'vstřikov', 'čerpadlo paliv', 'palivové čerpadlo'], canonical: 'Palivový systém' },
  { keywords: ['poloos', 'pohon kol', 'kardan', 'diferenc'], canonical: 'Pohon nápravy' },
  { keywords: ['řízení', 'volant', 'řídicí', 'hřeben řízení'], canonical: 'Řízení' },
  { keywords: ['spojk', 'setrvačn'], canonical: 'Spojka' },
  { keywords: ['výfuk', 'katalyz', 'tlumič výf', 'lambd', 'dpf'], canonical: 'Výfuk' },
  { keywords: ['zapalov', 'svíčk', 'cívka', 'žhavi'], canonical: 'Zapalování / žhavení' },
  { keywords: ['převodov', 'manuální převod', 'automatická převod'], canonical: 'Převodovka' },
  { keywords: ['alternátor', 'startér', 'baterie', 'relé', 'pojistk', 'kabelá', 'senzor', 'snímač'], canonical: 'Elektroinstalace' },
];

function resolveCanonicalCategory(label: string, keywords: string[] = []): string | null {
  const lab = stripDiacritics(label || '');
  const allText = stripDiacritics([label, ...(keywords || [])].join(' '));
  for (const m of SUBCATEGORY_TO_CANONICAL) {
    const canNorm = stripDiacritics(m.canonical);
    if (lab === canNorm) return m.canonical;
  }
  for (const m of SUBCATEGORY_TO_CANONICAL) {
    if (m.keywords.some((kw) => allText.includes(stripDiacritics(kw)))) return m.canonical;
  }
  return null;
}

function buildKeywordOr(keywords: string[]): string | null {
  if (!keywords || keywords.length === 0) return null;
  const top = keywords.slice(0, 6).map((k) => k.replace(/[%,()]/g, '').trim()).filter(Boolean);
  if (top.length === 0) return null;
  const parts: string[] = [];
  for (const kw of top) {
    parts.push(`name.ilike.%${kw}%`);
    parts.push(`category.ilike.%${kw}%`);
  }
  return parts.join(',');
}

export async function listPartsForVehicle(opts: any) {
  const page = Math.max(Number(opts.page || 0), 0);
  const pageSize = Math.min(Math.max(Number(opts.pageSize || 30), 1), 100);
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const rawLabel = String(opts.canonicalCategory || '').trim();
  const keywords: string[] = Array.isArray(opts.categoryKeywords) ? opts.categoryKeywords : [];
  const canonical = resolveCanonicalCategory(rawLabel, keywords);
  const orFilter = buildKeywordOr(keywords.length ? keywords : [rawLabel]);

  const tryViaCompat = async (): Promise<{ rows: any[]; error: any }> => {
    if (!opts.nextisVehicleId && !opts.brand) return { rows: [], error: null };
    let compatQ = supabase.from('catalog_vehicle_compatibility').select('part_id').limit(2000);
    if (opts.nextisVehicleId) {
      compatQ = compatQ.eq('nextis_vehicle_id', opts.nextisVehicleId);
    } else {
      compatQ = compatQ.ilike('brand', opts.brand);
      if (opts.model) compatQ = compatQ.ilike('model', opts.model);
      if (opts.engine) compatQ = compatQ.ilike('engine', opts.engine);
      if (opts.year) {
        compatQ = compatQ.or(`year_from.is.null,year_from.lte.${opts.year}`)
                         .or(`year_to.is.null,year_to.gte.${opts.year}`);
      }
    }
    const { data: compatRows, error: compatErr } = await compatQ;
    if (compatErr) return { rows: [], error: compatErr };
    const partIds = [...new Set((compatRows || []).map((r: any) => r.part_id).filter(Boolean))];
    if (partIds.length === 0) return { rows: [], error: null };
    let q = supabase.from('parts_new_public').select('*').in('id', partIds);
    if (canonical) q = q.eq('category', canonical);
    else if (orFilter) q = q.or(orFilter);
    const { data, error } = await q.limit(2000);
    return { rows: data || [], error };
  };

  const tryViaText = async (useEngine: boolean) => {
    let query = supabase.from('parts_new_public').select('*')
      .ilike('compatible_vehicles', `%${opts.brand}%`);
    if (opts.model) query = query.ilike('compatible_vehicles', `%${opts.model}%`);
    if (useEngine && opts.engine) query = query.ilike('compatible_vehicles', `%${opts.engine}%`);
    if (canonical) query = query.eq('category', canonical);
    else if (orFilter) query = query.or(orFilter);
    return await query.limit(2000);
  };

  // Strategy 0: catalog_part_categories mapping (jen když flag ON - nyní vždy false)
  if (opts.categoryNodeId && (await isJmTreeFlagEnabled())) {
    const { data: mapRows } = await supabase
      .from('catalog_part_categories')
      .select('part_id')
      .eq('category_id', opts.categoryNodeId)
      .limit(2000);
    let partIds = [...new Set((mapRows || []).map((r: any) => r.part_id).filter(Boolean))];
    if (partIds.length > 0 && (opts.nextisVehicleId || opts.brand)) {
      let compatQ = supabase.from('catalog_vehicle_compatibility').select('part_id').in('part_id', partIds).limit(2000);
      if (opts.nextisVehicleId) compatQ = compatQ.eq('nextis_vehicle_id', opts.nextisVehicleId);
      else {
        compatQ = compatQ.ilike('brand', opts.brand);
        if (opts.model) compatQ = compatQ.ilike('model', opts.model);
        if (opts.engine) compatQ = compatQ.ilike('engine', opts.engine);
      }
      const { data: compatRows } = await compatQ;
      const allowedIds = new Set((compatRows || []).map((r: any) => r.part_id).filter(Boolean));
      partIds = partIds.filter((id) => allowedIds.has(id));
    }
    if (partIds.length > 0) {
      const { data } = await supabase.from('parts_new_public').select('*').in('id', partIds).limit(2000);
      if ((data || []).length > 0) return finalizeCatalogRows(data || [], from, to);
    }
  }

  const a = await tryViaCompat();
  if (!a.error && a.rows.length > 0) return finalizeCatalogRows(a.rows, from, to);

  const b1 = await tryViaText(true);
  if (!b1.error && (b1.data || []).length > 0) return finalizeCatalogRows(b1.data || [], from, to);

  const b2 = await tryViaText(false);
  if (!b2.error && (b2.data || []).length > 0) return finalizeCatalogRows(b2.data || [], from, to);

  logCatalogEvent({
    level: 'warn',
    event: 'listPartsForVehicle_empty',
    vehicle_id: opts.nextisVehicleId || null,
    category: canonical,
    message: `Žádné díly: ${opts.brand} ${opts.model || ''} / ${canonical || rawLabel}`,
    details: { brand: opts.brand, model: opts.model, engine: opts.engine, canonical, reason: 'strict_vehicle_scope_no_fallback' },
  });
  return { items: [], total: 0 };
}

export async function searchCatalog(query: string): Promise<CatalogPart[]> {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  try {
    const { data } = await supabase
      .from("parts_new_public")
      .select("*")
      .or(`name.ilike.%${q}%,oem_number.ilike.%${q}%,description.ilike.%${q}%`)
      .limit(100);
    return filterDisabledSources(deduplicateParts((data || []).map((row) => normalizeRow(row))));
  } catch {
    return [];
  }
}
