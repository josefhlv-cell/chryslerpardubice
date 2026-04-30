import { supabase } from "@/integrations/supabase/client";

export const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"] as const;

// ---------- structured client-side logger ----------
// Best-effort: never throws, never blocks UI.
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
    // RLS will reject anonymous inserts — that's fine, we just skip silently.
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
  'VENTILATOR VISIKUS': 'Viskózní ventilátor',
  'STOSSDAEMPFER': 'Tlumič nárazů',
  'SPANNFEDER': 'Pružina',
  'FAHRKERKSBUSSCHE': 'Pouzdro podvozku',
  'QUERLENKRR': 'Příčné rameno',
  'LICHTMASCHINE': 'Alternátor',
  'ANLASSER': 'Startér',
  'AKKUMULATOR': 'Baterie',
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
  'SCHEIBE': 'Okno',
  'SPIEGEL': 'Zrcadlo',
  'RUECKBLIKSSPIEGEL': 'Zpětné zrcátko',
  'SEITENSPIEGEL': 'Boční zrcadlo',
  'STOSSSTANGE': 'Nárazník',
  'TUERKGRIFF': 'Rukojeť dveří',
  'SITZ': 'Sedadlo',
  'RUEKKLEHNE': 'Opěradlo',
  'KOPFSTUTZE': 'Opěrka hlavy',
  'GUERTEL': 'Bezpečnostní pás',
  'AIRBAG': 'Airbag',
  'MOTOROEL': 'Motorový olej',
  'GETRIEBEOEL': 'Převodový olej',
  'DIFFERENZIALOEL': 'Diferenciálový olej',
};

const normalizeOem = (s: string) => (s || "").toUpperCase().replace(/[\s\-._/]/g, "");

const stripDiacritics = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function sanitizeName(raw: string): string {
  if (!raw) return '—';
  let text = String(raw || "").trim();
  for (const [de, cs] of Object.entries(DE_TO_CS)) {
    const regex = new RegExp(`\\b${de}\\b`, 'gi');
    text = text.replace(regex, cs);
  }
  text = text.replace(/\s+/g, ' ');
  if (text === text.toUpperCase() && text.length > 3) {
    text = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }
  return text;
}

const unwrapFunctionPayload = (payload: any) => payload?.data ?? payload ?? {};

function calculateFinalPrice(basePrice: number | null, source: string): { final: number | null; markup: number } {
  if (basePrice === null) return { final: null, markup: 0 };
  if (source === 'jm') {
    return { final: Number((basePrice * 1.37).toFixed(2)), markup: 37 };
  }
  return { final: basePrice, markup: 0 };
}

// Aftermarket sources we no longer use directly. Data stays in DB for history,
// but the catalog UI must NEVER show them — J+M (via jm-proxy) is the sole
// aftermarket supplier and also drives the catalog tree.
const DISABLED_AFTERMARKET_SOURCES = new Set([
  'makro', 'sag', 'autokelly', 'epc-ai', 'ai-epc', 'crossref', 'ai',
]);

export function isDisabledAftermarketSource(source: string | null | undefined): boolean {
  return DISABLED_AFTERMARKET_SOURCES.has(String(source || '').toLowerCase());
}

function filterDisabledSources(parts: CatalogPart[]): CatalogPart[] {
  return parts.filter((p) => !isDisabledAftermarketSource(p.catalog_source));
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
    const key = normalizeOem(part.oem_number);
    if (!seen.has(key)) {
      seen.set(key, part);
    }
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

  // For J+M (aftermarket) rows, the supplier puts the producer brand under `brand`
  // (TRW, ATE, Bosch, ...). For local DB rows it sits in `manufacturer`.
  const manufacturer = row?.manufacturer ?? row?.brand ?? null;

  // Build description from J+M raw fields when available
  let description: string | null = row?.description ?? null;
  if (!description && Array.isArray(row?.oe_numbers) && row.oe_numbers.length > 0) {
    description = `OE čísla: ${row.oe_numbers.slice(0, 8).join(', ')}`;
  } else if (description && Array.isArray(row?.oe_numbers) && row.oe_numbers.length > 0) {
    description = `${description}\n\nOE čísla: ${row.oe_numbers.slice(0, 8).join(', ')}`;
  }

  // Technical parameters: object map from J+M, or stored on local row
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
    badge_label: isOem ? 'ORIGINÁL' : 'NÁHRADA',
    rank: isOem ? 1 : 5,
    final_price: finalPrice,
    markup_percent: markup,
    technical_parameters,
    compatible_vehicles: Array.isArray(row?.compatible_vehicles) ? row.compatible_vehicles : null,
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
    
    const oemPartsRaw = (data || []).map(p => normalizeRow(p));
    const oemParts = filterDisabledSources(oemPartsRaw);
    
    const jmResult = await supabase.functions.invoke('jm-proxy', {
      body: { action: 'searchByCode', payload: { code: q } }
    });
    
    const jmPayload = unwrapFunctionPayload(jmResult?.data);
    const jmParts = (jmPayload?.items || []).map((it: any) => normalizeRow(it, 'jm'));

    if (oemParts.length === 0 && jmParts.length === 0) {
      logCatalogEvent({
        level: 'warn',
        event: 'globalOemSearch_empty',
        oem_number: q,
        message: `Vyhledávání bez výsledků: ${q}`,
        details: { jmAttempts: jmPayload?.attempts?.slice(0, 5) || [], jmTotalRaw: jmPayload?.totalRawHits ?? 0 },
      });
    }

    return {
      oem: oemParts,
      jm: jmParts,
    };
  } catch (err) {
    console.error('[globalOemSearch] error:', err);
    logCatalogEvent({
      level: 'error',
      event: 'globalOemSearch_exception',
      oem_number: q,
      message: (err as Error).message,
    });
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

// Cache flag value for 60s to avoid repeated lookups during a session.
let _flagCache: { value: boolean; ts: number } | null = null;
export async function isJmTreeFlagEnabled(): Promise<boolean> {
  if (_flagCache && Date.now() - _flagCache.ts < 60_000) return _flagCache.value;
  try {
    const { data } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("feature_key", "catalog_jm_tree")
      .maybeSingle();
    const value = !!data?.enabled;
    _flagCache = { value, ts: Date.now() };
    return value;
  } catch {
    return false;
  }
}

/**
 * Read the locally-mirrored 5-level catalog tree (Brand→Model→Engine→Category→Subcategory)
 * for one vehicle. Used when feature flag `catalog_jm_tree` is ON.
 */
async function fetchLocalCategoryTree(opts: { brand?: string; model?: string; engine?: string; year?: number; powerKw?: number }): Promise<CatalogCategoryNode[]> {
  const { data, error } = await supabase
    .from("catalog_categories")
    .select("id, parent_id, slug, name_cs, node_type, is_global, sort_order, vehicle_brand, vehicle_model, vehicle_engine, year_from, year_to, power_kw")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];

  // Filter to the relevant scope: keep nodes that match brand/model/engine OR are global (null scope)
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

  const canonicalCounts = new Map<string, number>();
  // Scoped count: pokud máme vozidlo, počítáme jen díly kompatibilní s ním; jinak globálně
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
        .select("part_id, parts_new!inner(category)")
        .eq("nextis_vehicle_id", vRow.id)
        .limit(20000);
      for (const row of (scopedRows || []) as any[]) {
        const cat = String(row?.parts_new?.category || "Ostatní");
        canonicalCounts.set(cat, (canonicalCounts.get(cat) || 0) + 1);
      }
    }
  }
  if (canonicalCounts.size === 0) {
    // Fallback na globální count z parts_new_public
    const { data: countRows } = await supabase.from("parts_new_public").select("category").limit(20000);
    for (const row of countRows || []) {
      const key = String((row as any).category || "Ostatní");
      canonicalCounts.set(key, (canonicalCounts.get(key) || 0) + 1);
    }
  }

  const nodeCounts = new Map<string, number>();
  const { data: mappedRows } = await supabase.from("catalog_part_categories").select("category_id").limit(10000);
  for (const row of mappedRows || []) {
    const key = String((row as any).category_id || "");
    if (key) nodeCounts.set(key, (nodeCounts.get(key) || 0) + 1);
  }

  const build = (parentId: string | null, path: string[]): CatalogCategoryNode[] => {
    const kids = byParent.get(parentId) || [];
    return kids.map((n) => {
      const nodePath = [...path, n.slug];
      const canonical = resolveCanonicalCategory(n.name_cs, []);
      return {
        id: n.id,
        label: n.name_cs,
        path: nodePath,
        keywords: [n.name_cs, canonical].filter(Boolean) as string[],
        count: canonical ? (canonicalCounts.get(canonical) || 0) : 0,
        sectionId: null,
        children: build(n.id, nodePath),
      };
    });
  };

  const roots = byParent.get(null) || [];
  const brandNode = roots.find((n) => n.node_type === "brand" && (!opts.brand || n.name_cs.toLowerCase() === opts.brand.toLowerCase()));
  const modelNodes = brandNode ? (byParent.get(brandNode.id) || []) : [];
  const modelNode = modelNodes.find((n) => n.node_type === "model" && (!opts.model || String(n.vehicle_model || n.name_cs).toLowerCase() === opts.model.toLowerCase() || n.name_cs.toLowerCase().startsWith(opts.model.toLowerCase())));
  const engineNodes = modelNode ? (byParent.get(modelNode.id) || []) : [];
  const engineNode = engineNodes.find((n) => {
    if (n.node_type !== "engine") return false;
    if (opts.engine && String(n.vehicle_engine || "").toLowerCase() !== opts.engine.toLowerCase()) return false;
    if (opts.powerKw && n.power_kw && Math.abs(n.power_kw - opts.powerKw) > 10) return false;
    if (opts.year && n.year_from && opts.year < n.year_from) return false;
    if (opts.year && n.year_to && opts.year > n.year_to) return false;
    return true;
  });

  // Globální J+M strom je vždy stejný (parent_id=NULL, is_global=true).
  // Vehicle scope (brand/model/engine) ovlivňuje jen filtraci dílů, ne strukturu stromu.
  const globalRoots = (byParent.get(null) || []).filter((n: any) => n.node_type === 'category' && n.is_global);
  if (globalRoots.length > 0) {
    const buildGlobal = (parentId: string, path: string[]): CatalogCategoryNode[] => {
      const kids = (byParent.get(parentId) || []).filter((k: any) => k.node_type === 'subcategory');
      return kids.map((k: any) => ({
        id: k.id,
        label: k.name_cs,
        path: [...path, k.slug],
        keywords: [k.name_cs],
        count: nodeCounts.get(k.id) || (resolveCanonicalCategory(k.name_cs, []) ? canonicalCounts.get(resolveCanonicalCategory(k.name_cs, [])!) || 0 : 0),
        sectionId: null,
        children: buildGlobal(k.id, [...path, k.slug]),
      }));
    };
    return globalRoots
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((n: any) => ({
        id: n.id,
        label: n.name_cs,
        path: [n.slug],
        keywords: [n.name_cs],
        count: canonicalCounts.get(n.name_cs) || 0,
        sectionId: null,
        children: buildGlobal(n.id, [n.slug]),
      }));
  }
  return [];
}

export async function fetchJmCategoryTree(opts: any) {
  // Feature flag ON → use local mirrored tree (J+M-style 5 levels)
  if (await isJmTreeFlagEnabled()) {
    const local = await fetchLocalCategoryTree({
      brand: opts?.brand || opts?.vehicle?.brand,
      model: opts?.model || opts?.vehicle?.model,
      engine: opts?.engine || opts?.vehicle?.engine,
      year: opts?.year || opts?.vehicle?.year,
      powerKw: opts?.powerKw || opts?.vehicle?.power_kw,
    });
    if (local.length > 0) return local;
    // Fall through to JM proxy if local mirror is empty (not yet built)
  }
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
      return { items: [], warning: 'J+M API error' };
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

export async function fetchJmByCodes(codes: string[]) {
  try {
    const allItems: CatalogPart[] = [];
    for (const code of codes) {
      try {
        const { data } = await supabase.functions.invoke('jm-proxy', {
          body: { action: 'searchByCode', payload: { code } }
        });
        const payload = unwrapFunctionPayload(data);
        if (payload?.items) {
          allItems.push(...payload.items.map((it: any) => normalizeRow(it, 'jm')));
        }
      } catch (err) {
        console.warn(`[fetchJmByCodes] code ${code} failed:`, err);
      }
    }
    return allItems;
  } catch (err) {
    console.error('[fetchJmByCodes] error:', err);
    return [];
  }
}

export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]) {
  const all = [...oem, ...jm];
  return deduplicateParts(all);
}

function finalizeCatalogRows(rows: any[], from: number, to: number) {
  const all = filterDisabledSources(deduplicateParts((rows || []).map((row) => normalizeRow(row))));
  return { items: all.slice(from, to + 1), total: all.length };
}

/**
 * Mapping from JM tree subcategory labels → canonical parts_new.category.
 * The DB has 19 broad categories; the JM tree has hundreds of leaves.
 * Without this map, drill-down to "Kotoučové brzdy" returns 0 rows.
 */
const SUBCATEGORY_TO_CANONICAL: Array<{ keywords: string[]; canonical: string }> = [
  { keywords: ['airbag', 'bezpe', 'pas '], canonical: 'Bezpečnostní systém' },
  { keywords: ['brzd', 'kotouč', 'destič', 'třmen', 'abs', 'bubn', 'oblož'], canonical: 'Brzdové zařízení' },
  { keywords: ['stěrač', 'ostřik', 'čištění skel'], canonical: 'Čištění skel' },
  { keywords: ['servis', 'údržb', 'nářad'], canonical: 'Údržba' },
  { keywords: ['filtr'], canonical: 'Filtry' },
  { keywords: ['hybrid', 'elektr pohon'], canonical: 'Hybridní / elektrický pohon' },
  { keywords: ['chlad', 'termostat', 'vodní čerpadl', 'ventilátor chla', 'expanzní'], canonical: 'Chlazení' },
  { keywords: ['rádio', 'reproduktor', 'navigac', 'displej'], canonical: 'Informační / komunikační systém' },
  { keywords: ['karoser', 'nárazn', 'kapot', 'dveř', 'blatn', 'maska', 'sklo', 'zrcátk', 'zrcadl'], canonical: 'Karosérie' },
  { keywords: ['klimat', 'topení', 'kompresor klima', 'kondenz'], canonical: 'Klimatizace' },
  { keywords: ['pneu', 'kolo', 'disk', 'ráfek'], canonical: 'Pneumatiky' },
  { keywords: ['sedadl', 'koberec', 'palubní deska', 'interi'], canonical: 'Komfortní systémy' },
  { keywords: ['motor', 'hlava válc', 'olejová van', 'vačk', 'klikov', 'pístn', 'turbo', 'rozvod'], canonical: 'Motor' },
  { keywords: ['odpruž', 'tlumič', 'pružin', 'rameno', 'silentbl', 'stabiliz', 'ložisko'], canonical: 'Odpružení' },
  { keywords: ['palivov', 'vstřikov', 'čerpadlo paliv', 'palivové čerpadlo'], canonical: 'Palivový systém' },
  { keywords: ['poloos', 'pohon kol'], canonical: 'Pohon nápravy' },
  { keywords: ['kardan', 'diferenc'], canonical: 'Pohon nápravy' },
  { keywords: ['nosič', 'tažné'], canonical: 'Přepravní vybavení' },
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
  // 1) Exact match on the 19 canonical labels
  for (const m of SUBCATEGORY_TO_CANONICAL) {
    const canNorm = stripDiacritics(m.canonical);
    if (lab === canNorm) return m.canonical;
  }
  // 2) Heuristic: any keyword from the map appears in label or supplied keywords
  for (const m of SUBCATEGORY_TO_CANONICAL) {
    if (m.keywords.some((kw) => allText.includes(stripDiacritics(kw)))) return m.canonical;
  }
  return null;
}

function buildKeywordOr(keywords: string[]): string | null {
  if (!keywords || keywords.length === 0) return null;
  // Use the first 6 keywords for OR filter on name + category
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

  // STRATEGY A: official mapping via catalog_vehicle_compatibility (most reliable)
  const tryViaCompat = async (): Promise<{ rows: any[]; error: any }> => {
    if (!opts.nextisVehicleId && !opts.brand) return { rows: [], error: null };

    let compatQ = supabase
      .from('catalog_vehicle_compatibility')
      .select('part_id')
      .limit(2000);

    if (opts.nextisVehicleId) {
      compatQ = compatQ.eq('nextis_vehicle_id', opts.nextisVehicleId);
    } else {
      compatQ = compatQ.ilike('brand', opts.brand);
      if (opts.model) compatQ = compatQ.ilike('model', opts.model);
      if (opts.engine) compatQ = compatQ.ilike('engine', opts.engine);
      // Year filter: include rows whose [year_from, year_to] overlaps the user year
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

  // STRATEGY B: legacy compatible_vehicles text match
  const tryViaText = async (useEngine: boolean) => {
    let query = supabase
      .from('parts_new_public')
      .select('*')
      .ilike('compatible_vehicles', `%${opts.brand}%`);
    if (opts.model) query = query.ilike('compatible_vehicles', `%${opts.model}%`);
    if (useEngine && opts.engine) query = query.ilike('compatible_vehicles', `%${opts.engine}%`);
    if (canonical) query = query.eq('category', canonical);
    else if (orFilter) query = query.or(orFilter);
    return await query.limit(2000);
  };

  // STRATEGY 0: when flag ON and we have a category node id, use the explicit
  // catalog_part_categories mapping (built by jm-classify-parts).
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
        if (opts.year) compatQ = compatQ.or(`year_from.is.null,year_from.lte.${opts.year}`).or(`year_to.is.null,year_to.gte.${opts.year}`);
      }
      const { data: compatRows } = await compatQ;
      const allowedIds = new Set((compatRows || []).map((r: any) => r.part_id).filter(Boolean));
      partIds = partIds.filter((id) => allowedIds.has(id));
    }
    if (partIds.length > 0) {
      const { data } = await supabase
        .from('parts_new_public')
        .select('*')
        .in('id', partIds)
        .limit(2000);
      if ((data || []).length > 0) return finalizeCatalogRows(data || [], from, to);
    }
  }

  // Try in order: compat join → text strict → text without engine → category-only fallback
  const a = await tryViaCompat();
  if (!a.error && a.rows.length > 0) {
    return finalizeCatalogRows(a.rows, from, to);
  }

  const b1 = await tryViaText(true);
  if (!b1.error && (b1.data || []).length > 0) {
    return finalizeCatalogRows(b1.data || [], from, to);
  }

  const b2 = await tryViaText(false);
  if (!b2.error && (b2.data || []).length > 0) {
    return finalizeCatalogRows(b2.data || [], from, to);
  }

  // Last resort: show category for the brand alone (any vehicle)
  if (canonical) {
    const { data } = await supabase
      .from('parts_new_public')
      .select('*')
      .eq('category', canonical)
      .ilike('compatible_vehicles', `%${opts.brand}%`)
      .limit(2000);
    if ((data || []).length === 0) {
      logCatalogEvent({
        level: 'warn',
        event: 'listPartsForVehicle_empty',
        vehicle_id: opts.nextisVehicleId || null,
        category: canonical,
        message: `Žádné díly pro ${opts.brand} ${opts.model || ''} ${opts.engine || ''} / ${canonical}`,
        details: {
          brand: opts.brand, model: opts.model, engine: opts.engine, year: opts.year,
          canonical, keywords, categoryNodeId: opts.categoryNodeId,
          strategiesAttempted: ['categoryNode', 'compat', 'textStrict', 'textNoEngine', 'brandFallback'],
          reason: 'no_local_parts_match_any_strategy',
        },
      });
    }
    return finalizeCatalogRows(data || [], from, to);
  }

  logCatalogEvent({
    level: 'warn',
    event: 'listPartsForVehicle_empty',
    vehicle_id: opts.nextisVehicleId || null,
    category: rawLabel || null,
    message: `Žádné díly a žádná kanonická kategorie (${rawLabel || 'n/a'})`,
    details: {
      brand: opts.brand, model: opts.model, engine: opts.engine,
      rawLabel, keywords,
      reason: 'no_canonical_category_resolved',
    },
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
    const all = filterDisabledSources(deduplicateParts((data || []).map((row) => normalizeRow(row))));
    return all;
  } catch {
    return [];
  }
}