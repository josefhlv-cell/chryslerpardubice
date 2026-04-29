import { supabase } from "@/integrations/supabase/client";

export const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"] as const;

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

function normalizeRow(row: any, source: string = 'mopar'): CatalogPart {
  const sourceNorm = (source || row?.catalog_source || 'mopar').toLowerCase();
  const isOem = ['mopar', 'mopar_oem', 'epc', '7zap', 'epc-ai', 'csv'].includes(sourceNorm);
  const basePrice = Number(row?.price_with_vat) || null;
  const { final: finalPrice, markup } = calculateFinalPrice(basePrice, sourceNorm);
  const priceNoVat = Number(row?.price_without_vat);
  const hasPrice = (basePrice && basePrice > 0) || (priceNoVat && priceNoVat > 0);
  
  return {
    id: String(row?.id || Math.random()),
    oem_number: String(row?.oem_number || ''),
    name: sanitizeName(String(row?.name || row?.oem_number || 'Díl')),
    manufacturer: row?.manufacturer ?? null,
    catalog_source: sourceNorm,
    price_without_vat: priceNoVat > 0 ? priceNoVat : null,
    price_with_vat: basePrice,
    availability: hasPrice ? (row?.availability ?? 'available') : 'on_order',
    image_urls: Array.isArray(row?.image_urls) ? row.image_urls : null,
    category: row?.category ?? null,
    description: row?.description ?? null,
    is_oem: isOem,
    badge_label: isOem ? 'ORIGINÁL' : 'NÁHRADA',
    rank: isOem ? 1 : 5,
    final_price: finalPrice,
    markup_percent: markup,
    technical_parameters: row?.technical_parameters ?? null,
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
    
    const oemParts = (data || []).map(p => normalizeRow(p, 'mopar'));
    
    const jmResult = await supabase.functions.invoke('jm-proxy', {
      body: { action: 'searchByCode', payload: { code: q } }
    });
    
    const jmPayload = unwrapFunctionPayload(jmResult?.data);
    const jmParts = (jmPayload?.items || []).map((it: any) => normalizeRow(it, 'jm'));
    
    return {
      oem: oemParts,
      jm: jmParts,
    };
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

export async function fetchJmCategoryTree(opts: any) {
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

export async function listPartsForVehicle(opts: any) {
  const page = Math.max(Number(opts.page || 0), 0);
  const pageSize = Math.min(Math.max(Number(opts.pageSize || 30), 1), 100);
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const category = String(opts.canonicalCategory || "").trim();

  const fetchRows = async (useEngine: boolean) => {
    let query = supabase
      .from("parts_new_public")
      .select("*")
      .ilike("compatible_vehicles", `%${opts.brand}%`)
      .ilike("compatible_vehicles", `%${opts.model}%`);
    if (useEngine && opts.engine) query = query.ilike("compatible_vehicles", `%${opts.engine}%`);
    if (category) query = query.eq("category", category);
    return await query.order("price_with_vat", { ascending: true }).range(from, to);
  };

  const strict = await fetchRows(true);
  const fallback = strict.error || (strict.data || []).length === 0 ? await fetchRows(false) : strict;
  if (fallback.error) throw fallback.error;

  const all = (fallback.data || []).map((row) => normalizeRow(row));
  return { items: deduplicateParts(all), total: all.length };
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
    const all = (data || []).map((row) => normalizeRow(row));
    return deduplicateParts(all);
  } catch {
    return [];
  }
}