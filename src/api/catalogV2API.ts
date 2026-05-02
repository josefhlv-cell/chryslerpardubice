// catalogV2API.ts — Unified Catalog v2
// OEM-first (Mopar/parts_new) + J+M Autodíly (live via jm-proxy)
// DO NOT OVERWRITE THIS FILE — it took many iterations to get right.

import { supabase } from '@/integrations/supabase/client';

// ─── Logging ──────────────────────────────────────────────────────────────────

function logCatalogEvent(params: {
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  vehicle_id?: string | null;
  category?: string | null;
  message?: string;
  details?: Record<string, unknown>;
}) {
  const { level, event, vehicle_id, category, message, details } = params;
  if (level === 'debug') return; // suppress debug in prod
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    `[CatalogV2][${event}]`, message || '', details || '',
  );
  (supabase as any).from('catalog_event_log').insert({
    level, event, vehicle_id: vehicle_id || null,
    category: category || null, message: message || null,
    details: details ? JSON.stringify(details) : null,
    created_at: new Date().toISOString(),
  }).then(() => {}).catch(() => {});
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CatalogPart = {
  id: string;
  oem_number: string;
  name: string;
  description: string | null;
  price_with_vat: number | null;
  price_without_vat: number | null;
  final_price: number | null;
  currency: string;
  manufacturer: string | null;
  catalog_source: string;
  is_oem: boolean;
  badge_label: 'ORIGINÁL' | 'NÁHRADA' | 'NEZNÁMÝ';
  rank: number;
  image_urls: string[];
  related_oem_number: string | null;
  oe_numbers: string[] | null;
  category: string | null;
  compatible_vehicles: string | null;
  stock_status: string | null;
  availability: string | null;
  technical_parameters?: Record<string, string> | null;
};

export type CatalogCategoryNode = {
  id: string;
  label: string;
  path: string[];
  keywords: string[];
  count: number;
  sectionId: string | null;
  children: CatalogCategoryNode[];
};

export type NextisVehicle = {
  id: string;
  brand: string;
  model: string;
  engine: string;
  year_from: number | null;
  year_to: number | null;
  power_kw: number | null;
  body_type: string | null;
};

// ─── Price calculation ────────────────────────────────────────────────────────

const MARKUP: Record<string, number> = {
  mopar: 1.0, mopar_oem: 1.0, csv: 1.0, '7zap': 1.0, 'epc-link': 1.0,
  jm: 1.0, crossref: 1.15, sag: 1.15, autokelly: 1.15, makro: 1.12,
  'epc-ai': 1.2, 'ai-epc': 1.2, ai: 1.2,
};
const VAT = 1.21;

function calculateFinalPrice(basePrice: number | null, source: string) {
  if (!basePrice || basePrice <= 0) return { final: null, markup: 1 };
  const markup = MARKUP[source] ?? 1.1;
  const withMarkup = basePrice * markup;
  const withVat = Math.round(withMarkup * VAT * 100) / 100;
  return { final: withVat, markup };
}

// ─── normalizeOem ─────────────────────────────────────────────────────────────

export function normalizeOem(raw: string | null | undefined): string {
  return String(raw || '').toUpperCase().replace(/[\s\-._/]/g, '').trim();
}

// ─── normalizeRow ─────────────────────────────────────────────────────────────

export function normalizeRow(row: any, source?: string): CatalogPart {
  const mfr = String(row?.manufacturer || '').trim();
  const basePrice: number | null =
    row?.price_without_vat ?? row?.base_price ?? row?.price ?? null;
  const sourceNorm = String(source || row?.catalog_source || row?.supplier || 'mopar').toLowerCase();

  const oemSources = ['mopar', 'mopar_oem', '7zap', 'epc-link', 'csv'];
  const aftermarketSources = ['epc-ai', 'ai-epc', 'makro', 'autokelly', 'crossref', 'sag', 'jm', 'ai'];
  const isAftermarket = aftermarketSources.includes(sourceNorm);
  const isVerifiedOem = oemSources.includes(sourceNorm);
  const isOem = !isAftermarket && isVerifiedOem;

  const { final: finalPrice } = calculateFinalPrice(basePrice, sourceNorm);
  const priceWithVat = row?.price_with_vat ?? finalPrice;

  return {
    id: String(row?.id || `${sourceNorm}-${row?.oem_number || Math.random()}`),
    oem_number: String(row?.oem_number || ''),
    name: String(row?.name || row?.part_name || 'Díl'),
    description: row?.description || null,
    price_with_vat: priceWithVat,
    price_without_vat: row?.price_without_vat ?? basePrice,
    final_price: finalPrice,
    currency: row?.currency || 'CZK',
    manufacturer: mfr || null,
    catalog_source: sourceNorm,
    is_oem: isOem,
    badge_label: isOem ? 'ORIGINÁL' : isAftermarket ? 'NÁHRADA' : 'NEZNÁMÝ',
    rank: isOem ? 1 : isAftermarket ? 5 : 9,
    image_urls: Array.isArray(row?.image_urls) ? row.image_urls : [],
    related_oem_number: row?.related_oem_number || null,
    oe_numbers: Array.isArray(row?.oe_numbers) ? row.oe_numbers : null,
    category: row?.category || null,
    compatible_vehicles: row?.compatible_vehicles || null,
    stock_status: row?.stock_status || null,
    availability: row?.availability || null,
    technical_parameters: row?.technical_parameters || null,
  };
}

// ─── Deduplicate ──────────────────────────────────────────────────────────────

function deduplicateParts(parts: CatalogPart[]): CatalogPart[] {
  const seen = new Map<string, CatalogPart>();
  const sorted = [...parts].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return (a.price_with_vat ?? 999999) - (b.price_with_vat ?? 999999);
  });
  for (const part of sorted) {
    const key =
      part.catalog_source === 'jm' && part.related_oem_number
        ? `jm:${normalizeOem(part.related_oem_number)}:${normalizeOem(part.oem_number)}`
        : normalizeOem(part.oem_number);
    if (key && !seen.has(key)) seen.set(key, part);
  }
  return Array.from(seen.values());
}

// ─── filterDisabledSources ────────────────────────────────────────────────────

const DISABLED_SOURCES: string[] = [];
function filterDisabledSources(parts: CatalogPart[]) {
  if (!DISABLED_SOURCES.length) return parts;
  return parts.filter((p) => !DISABLED_SOURCES.includes(p.catalog_source));
}

// ─── finalizeCatalogRows ──────────────────────────────────────────────────────

function finalizeCatalogRows(
  rows: any[],
  from: number,
  to: number,
  source?: string,
): { items: CatalogPart[]; total: number } {
  const normalized = rows.map((r) => normalizeRow(r, source));
  const deduped = deduplicateParts(normalized);
  return { items: deduped.slice(from, to), total: deduped.length };
}

// ─── J+M proxy helpers ────────────────────────────────────────────────────────

export async function fetchJmByCodes(oems: string[]): Promise<CatalogPart[]> {
  if (!oems.length) return [];
  try {
    const { data, error } = await supabase.functions.invoke('jm-proxy', {
      body: { action: 'searchByCode', codes: oems },
    });
    if (error) throw error;
    const items: any[] = data?.items || [];
    return items.map((r) => normalizeRow(r, 'jm'));
  } catch (err) {
    logCatalogEvent({ level: 'warn', event: 'fetchJmByCodes_error', message: String(err) });
    return [];
  }
}

export async function fetchJmForVehicle(opts: {
  brand: string; model: string; engine: string;
  nextisVehicleId?: string; year?: number; powerKw?: number;
  sectionId?: string | null; category?: string;
  categoryId?: string; categoryKeywords?: string[];
  parentKeywords?: string[];
}): Promise<{ items: CatalogPart[]; warning?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('jm-proxy', {
      body: {
        action: 'searchByVehicle',
        brand: opts.brand, model: opts.model, engine: opts.engine,
        nextisVehicleId: opts.nextisVehicleId,
        year: opts.year, powerKw: opts.powerKw,
        sectionId: opts.sectionId,
        category: opts.category,
        categoryKeywords: opts.categoryKeywords,
        parentKeywords: opts.parentKeywords,
      },
    });
    if (error) throw error;
    const items: any[] = data?.items || [];
    return {
      items: items.map((r) => normalizeRow(r, 'jm')),
      warning: data?.warning,
    };
  } catch (err) {
    logCatalogEvent({ level: 'warn', event: 'fetchJmForVehicle_error', message: String(err) });
    return { items: [], warning: String(err) };
  }
}

// ─── mergeWithJm ─────────────────────────────────────────────────────────────

const MAX_JM_PER_OEM = 3;
const MAX_JM_TOTAL = 30;

export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]): CatalogPart[] {
  const oemClean = filterDisabledSources(oem);
  const jmClean = filterDisabledSources(jm);
  if (oemClean.length === 0) return [];

  const baseKey = (s: string) =>
    normalizeOem(s).replace(/^K/, '').match(/^\d{8}/)?.[0] || normalizeOem(s);
  const oemBaseSet = new Set(oemClean.map((p) => baseKey(p.oem_number)));

  const jmSorted = [...jmClean].sort((a, b) => {
    const pa = (a.price_with_vat ?? 0) > 0 ? 1 : 0;
    const pb = (b.price_with_vat ?? 0) > 0 ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const ia = a.image_urls?.[0] ? 1 : 0;
    const ib = b.image_urls?.[0] ? 1 : 0;
    return ib - ia;
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
    // Fallback: díl má OE propojení ale číslo není přesně v DB → propustit
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

// ─── Vehicle selectors ────────────────────────────────────────────────────────

export async function fetchBrands(): Promise<string[]> {
  const { data } = await supabase.from('nextis_vehicles').select('brand');
  const brands = [...new Set((data || []).map((r: any) => r.brand).filter(Boolean))];
  return brands.sort();
}

export async function fetchModelsForBrand(brand: string): Promise<string[]> {
  const { data } = await supabase.from('nextis_vehicles').select('model').eq('brand', brand);
  const models = [...new Set((data || []).map((r: any) => r.model).filter(Boolean))];
  return models.sort();
}

export async function fetchEnginesForModel(brand: string, model: string): Promise<string[]> {
  const { data } = await supabase
    .from('nextis_vehicles').select('engine').eq('brand', brand).eq('model', model);
  const engines = [...new Set((data || []).map((r: any) => r.engine).filter(Boolean))];
  return engines.sort();
}

export async function fetchNextisVehicles(brand: string, model: string): Promise<NextisVehicle[]> {
  const { data } = await supabase
    .from('nextis_vehicles').select('*').eq('brand', brand).eq('model', model);
  return (data || []) as NextisVehicle[];
}

// ─── Category tree ────────────────────────────────────────────────────────────

export async function fetchJmCategoryTree(opts: {
  nextisVehicleId: string; brand: string; model: string; engine: string;
  year?: number; powerKw?: number;
}): Promise<CatalogCategoryNode[]> {
  try {
    const { data, error } = await supabase.functions.invoke('jm-proxy', {
      body: { action: 'getCategories', ...opts },
    });
    if (error) throw error;

    // Try local DB tree first, fall back to JM categories
    const localTree = await fetchLocalCategoryTree(opts);
    if (localTree.length > 0) return localTree;

    const cats: any[] = data?.categories || [];
    return cats.map((c: any) => ({
      id: c.id || c.slug || c.label,
      label: c.label || c.name,
      path: c.path || [c.slug || c.label],
      keywords: c.keywords || [c.label || c.name],
      count: c.count || 0,
      sectionId: c.sectionId || null,
      children: (c.children || []).map((ch: any) => ({
        id: ch.id || ch.slug || ch.label,
        label: ch.label || ch.name,
        path: ch.path || [c.slug, ch.slug],
        keywords: ch.keywords || [ch.label || ch.name],
        count: ch.count || 0,
        sectionId: ch.sectionId || null,
        children: [],
      })),
    }));
  } catch (err) {
    logCatalogEvent({ level: 'warn', event: 'fetchJmCategoryTree_error', message: String(err) });
    return fetchLocalCategoryTree(opts);
  }
}

async function fetchLocalCategoryTree(opts: {
  nextisVehicleId: string; brand: string; model: string; engine: string;
}): Promise<CatalogCategoryNode[]> {
  try {
    const { data: globalRoots } = await supabase
      .from('catalog_categories')
      .select('*, children:catalog_categories!parent_id(*)')
      .is('parent_id', null)
      .order('sort_order');

    if (!globalRoots?.length) return [];

    const { data: compatData } = await supabase
      .from('catalog_vehicle_compatibility')
      .select('part_id')
      .eq('nextis_vehicle_id', opts.nextisVehicleId);

    const totalForVehicle = compatData?.length || 0;

    const buildGlobal = (parentId: string, parentPath: string[]): CatalogCategoryNode[] => {
      const siblings = (globalRoots as any[]).filter((n: any) => n.parent_id === parentId);
      return siblings
        .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((n: any) => {
          const path = [...parentPath, n.slug];
          const children = buildGlobal(n.id, path);
          return {
            id: n.id, label: n.name_cs, path,
            keywords: [n.name_cs, ...(n.keywords || [])],
            count: 0, sectionId: null, children,
          };
        });
    };

    return (globalRoots as any[])
      .filter((n: any) => !n.parent_id)
      .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((n: any) => {
        const children = buildGlobal(n.id, [n.slug]);
        return {
          id: n.id, label: n.name_cs, path: [n.slug],
          keywords: [n.name_cs],
          count: children.reduce((s, c) => s + c.count, 0) || totalForVehicle,
          sectionId: null, children,
        };
      });
  } catch {
    return [];
  }
}

// ─── listPartsForVehicle ──────────────────────────────────────────────────────

export async function listPartsForVehicle(opts: {
  brand: string; model: string; engine?: string;
  nextisVehicleId?: string; year?: number;
  categoryNodeId?: string; canonicalCategory?: string;
  categoryKeywords?: string[]; page?: number; pageSize?: number;
}): Promise<{ items: CatalogPart[]; total: number }> {
  const page = opts.page ?? 0;
  const pageSize = opts.pageSize ?? 30;
  const from = page * pageSize;
  const to = from + pageSize;

  const rawLabel = opts.canonicalCategory || '';
  const keywords = opts.categoryKeywords || [rawLabel];

  // Strategy 1: by nextisVehicleId via compat table
  if (opts.nextisVehicleId) {
    try {
      const { data: compatRows } = await supabase
        .from('catalog_vehicle_compatibility')
        .select('part_id')
        .eq('nextis_vehicle_id', opts.nextisVehicleId)
        .limit(500);

      if (compatRows?.length) {
        const partIds = (compatRows as any[]).map((r: any) => r.part_id).filter(Boolean);
        let q = supabase.from('parts_new_public').select('*').in('id', partIds).limit(500);
        if (rawLabel) q = q.ilike('category', `%${rawLabel}%`);
        const { data } = await q;
        if (data?.length) return finalizeCatalogRows(data, from, to);
      }
    } catch { /* try next strategy */ }
  }

  // Strategy 2: text match strict (brand + model + engine + canonical category)
  const canonical = rawLabel;
  if (canonical) {
    try {
      let q = supabase.from('parts_new_public').select('*')
        .ilike('compatible_vehicles', `%${opts.brand}%`)
        .limit(500);
      if (opts.model) q = q.ilike('compatible_vehicles', `%${opts.model}%`);
      if (opts.engine) q = q.ilike('compatible_vehicles', `%${opts.engine}%`);
      q = q.ilike('category', `%${canonical}%`);
      const { data } = await q;
      if (data?.length) return finalizeCatalogRows(data, from, to);
    } catch { /* try next */ }
  }

  // Strategy 3: text match without engine
  if (canonical && opts.engine) {
    try {
      const { data } = await supabase.from('parts_new_public').select('*')
        .ilike('compatible_vehicles', `%${opts.brand}%`)
        .ilike('category', `%${canonical}%`)
        .limit(500);
      if (data?.length) return finalizeCatalogRows(data, from, to);
    } catch { /* try next */ }
  }

  // Strategy 4: keyword match
  for (const kw of keywords.filter((k) => k.length >= 3)) {
    try {
      const { data } = await supabase.from('parts_new_public').select('*')
        .ilike('compatible_vehicles', `%${opts.brand}%`)
        .or(`category.ilike.%${kw}%,name.ilike.%${kw}%`)
        .limit(300);
      if (data?.length) return finalizeCatalogRows(data, from, to);
    } catch { /* continue */ }
  }

  // Strict: no fallback — prevents cross-vehicle pollution
  logCatalogEvent({
    level: 'warn', event: 'listPartsForVehicle_empty',
    vehicle_id: opts.nextisVehicleId || null, category: canonical,
    message: `Žádné díly: ${opts.brand} ${opts.model || ''} / ${canonical || rawLabel}`,
    details: { brand: opts.brand, model: opts.model, engine: opts.engine, reason: 'strict_vehicle_scope_no_fallback' },
  });
  return { items: [], total: 0 };
}

// ─── Legacy fetchCatalogProducts (pro zpětnou kompatibilitu) ──────────────────

export async function fetchCatalogProducts(opts: {
  brand: string; model: string; engine: string; category: any;
}): Promise<{ success: boolean; data: { oem: CatalogPart[]; aftermarket_matched: CatalogPart[]; aftermarket_unmatched: CatalogPart[] } }> {
  const label = typeof opts.category === 'string' ? opts.category : opts.category?.label || '';
  const { items } = await listPartsForVehicle({
    brand: opts.brand, model: opts.model, engine: opts.engine,
    canonicalCategory: label,
  });
  const oem = items.filter((p) => p.is_oem);
  const aftermarket = items.filter((p) => !p.is_oem);
  return {
    success: true,
    data: { oem, aftermarket_matched: aftermarket, aftermarket_unmatched: [] },
  };
}
