import { supabase } from "@/integrations/supabase/client";

// -------------------- CONSTANTS --------------------

export const ALLOWED_BRANDS = [
  "Chrysler",
  "Dodge",
  "RAM",
  "Cadillac",
  "Lancia",
] as const;

// -------------------- TYPES --------------------

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

export type NextisVehicle = {
  id: string;
  brand: string;
  model: string;
  engine: string | null;
};

// -------------------- DICTIONARY --------------------

const DE_TO_CS: Record<string, string> = {
  BREMSBELAG_SATZ: "Sada brzdových destiček",
  BREMSBELAG_VORNE: "Brzdové destičky přední",
  BREMSBELAG_HINTEN: "Brzdové destičky zadní",
  BREMSENCHEIBE_VORNE: "Brzdový kotouč přední",
  BREMSENCHEIBE_HINTEN: "Brzdový kotouč zadní",
  BREMSSATTEL_VORNE: "Brzdový třmen přední",
  BREMSSATTEL_HINTEN: "Brzdový třmen zadní",
  BREMSZYLINDER: "Brzdový válec",
  BREMSFLUEESSIGKEIT: "Brzdová kapalina",
  ABS_VENTIL: "ABS ventil",
  ABS_PUMPE: "ABS čerpadlo",
  ZAHNRIEMEN: "Rozvodový řemen",
  ZAHNRIEMEN_SATZ: "Sada rozvodového řemene",
  ZYLINDERKOPF: "Hlava válců",
  OELWANNE: "Olejová vana",
  OELFILTER: "Olejový filtr",
  ZUENDKERZE: "Zapalovací svíčka",
  WASSERPUMPE: "Vodní čerpadlo",
  WASSERPUMPE_KOMPLETT: "Vodní čerpadlo kompletní",
  KUEHLER: "Chladič",
  KUEHLER_KOMBI: "Chladič kombinovaný",
  KUEHLFLUEESSIGKEIT: "Chladící kapalina",
  THERMOSTAT: "Termostat",
  VENTILATOR: "Ventilátor",
  VENTILATOR_VISIKUS: "Viskózní ventilátor",
  STOSSDAEMPFER: "Tlumič nárazů",
  SPANNFEDER: "Pružina",
  FAHRKERKSBUSSCHE: "Pouzdro podvozku",
  QUERLENKRR: "Příčné rameno",
  LICHTMASCHINE: "Alternátor",
  ANLASSER: "Startér",
  AKKUMULATOR: "Baterie",
  BATTERIE: "Baterie",
  RELAIS: "Relé",
  LUFTFILTER: "Vzduchový filtr",
  KABINNENFILTER: "Filtr kabiny",
  KRAFTSTOFFFILTER: "Palivový filtr",
  KRAFTSTOFFPUMPE: "Palivové čerpadlo",
  EINSPRITZVENTIL: "Vstřikovací ventil",
  GETRIEBE: "Převodovka",
  KUPPPLUNG: "Spojka",
  KUPPPLUNG_SATZ: "Sada spojky",
  KUPPLUNG_SCHEIBE: "Kotouč spojky",
  TUEER: "Dveře",
  MOTORHAUBE: "Kapota motoru",
  SCHEIBE: "Okno",
  SPIEGEL: "Zrcadlo",
  RUECKBLIKSSPIEGEL: "Zpětné zrcátko",
  SEITENSPIEGEL: "Boční zrcadlo",
  STOSSSTANGE: "Nárazník",
  TUERKGRIFF: "Rukojeť dveří",
  SITZ: "Sedadlo",
  RUEKKLEHNE: "Opěradlo",
  KOPFSTUTZE: "Opěrka hlavy",
  GUERTEL: "Bezpečnostní pás",
  AIRBAG: "Airbag",
  MOTOROEL: "Motorový olej",
  GETRIEBEOEL: "Převodový olej",
  DIFFERENZIALOEL: "Diferenciálový olej",
};

// -------------------- HELPERS --------------------

const normalizeOem = (s: string) =>
  (s || "").toUpperCase().replace(/[\s\-._/]/g, "");

function sanitizeName(raw: string): string {
  if (!raw) return "—";

  let text = String(raw).trim();

  for (const [de, cs] of Object.entries(DE_TO_CS)) {
    const regex = new RegExp(`\\b${de}\\b`, "gi");
    text = text.replace(regex, cs);
  }

  text = text.replace(/\s+/g, " ");

  if (text === text.toUpperCase() && text.length > 3) {
    text =
      text.charAt(0).toUpperCase() +
      text.slice(1).toLowerCase();
  }

  return text;
}

function calculateFinalPrice(
  basePrice: number | null,
  source: string
): { final: number | null; markup: number } {
  if (basePrice === null) {
    return { final: null, markup: 0 };
  }

  if (source === "jm") {
    return {
      final: Number((basePrice * 1.36).toFixed(2)),
      markup: 36,
    };
  }

  return {
    final: basePrice,
    markup: 0,
  };
}

function deduplicateParts(parts: CatalogPart[]): CatalogPart[] {
  const seen = new Map<string, CatalogPart>();

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

function normalizeRow(row: any, source: string = "mopar"): CatalogPart {
  const sourceNorm = (source || row?.catalog_source || "mopar").toLowerCase();

  const isOem = [
    "mopar",
    "mopar_oem",
    "epc",
    "7zap",
    "epc-ai",
    "csv",
  ].includes(sourceNorm);

  const basePrice = Number(row?.price_with_vat) || null;

  const { final: finalPrice, markup } = calculateFinalPrice(
    basePrice,
    sourceNorm
  );

  return {
    id: String(row?.id || Math.random()),
    oem_number: String(row?.oem_number || ""),
    name: sanitizeName(
      String(row?.name || row?.oem_number || "Díl")
    ),
    manufacturer: row?.manufacturer ?? null,
    catalog_source: sourceNorm,
    price_without_vat: Number(row?.price_without_vat) || null,
    price_with_vat: basePrice,
    availability: row?.availability ?? null,
    image_urls: Array.isArray(row?.image_urls)
      ? row.image_urls
      : null,
    category: row?.category ?? null,
    description: row?.description ?? null,
    is_oem: isOem,
    badge_label: isOem ? "ORIGINÁL" : "NÁHRADA",
    rank: isOem ? 1 : 5,
    final_price: finalPrice,
    markup_percent: markup,
  };
}

// -------------------- API --------------------

export async function fetchBrands() {
  const { data } = await supabase
    .from("nextis_vehicles")
    .select("brand");

  const unique = [...new Set((data || []).map((r) => r.brand))];

  return ALLOWED_BRANDS.filter((b) =>
    unique.includes(b)
  );
}

export async function fetchModelsForBrand(brand: string) {
  const { data } = await supabase
    .from("nextis_vehicles")
    .select("model")
    .eq("brand", brand);

  return [...new Set((data || []).map((r) => r.model))].sort();
}

export async function fetchEnginesForModel(
  brand: string,
  model: string
) {
  const { data } = await supabase
    .from("nextis_vehicles")
    .select("engine")
    .eq("brand", brand)
    .eq("model", model);

  return [...new Set((data || []).map((r) => r.engine))].sort();
}

export async function fetchNextisVehicles(
  brand: string,
  model: string
) {
  const { data } = await supabase
    .from("nextis_vehicles")
    .select("*")
    .eq("brand", brand)
    .eq("model", model);

  return (data || []) as NextisVehicle[];
}

export async function fetchJmCategoryTree(opts: any) {
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", {
      body: {
        action: "getCategoryTree",
        payload: opts,
      },
    });

    return data?.data || [];
  } catch {
    return [];
  }
}

export async function fetchJmForVehicle(opts: any) {
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", {
      body: {
        action: "searchByVehicle",
        payload: opts,
      },
    });

    return {
      items: (data?.data?.items || []).map((it: any) =>
        normalizeRow(it, "jm")
      ),
      warning: data?.warning,
    };
  } catch {
    return { items: [] };
  }
}

export async function fetchJmByCodes(codes: string[]) {
  try {
    const { data } = await supabase.functions.invoke("jm-proxy", {
      body: {
        action: "searchByCodes",
        payload: { codes },
      },
    });

    return (data?.data?.items || []).map((it: any) =>
      normalizeRow(it, "jm")
    );
  } catch {
    return [];
  }
}

// -------------------- SEARCH --------------------

export async function globalOemSearch(query: string) {
  try {
    const { data: oemData } = await supabase
      .from("parts_new_public")
      .select("*")
      .or(`name.ilike.%${query}%,oem_number.ilike.%${query}%`)
      .limit(50);

    const oemParts = (oemData || []).map((p) =>
      normalizeRow(p, "mopar")
    );

    const jmData = await fetchJmByCodes([query]);

    const combined = deduplicateParts([
      ...oemParts,
      ...jmData,
    ]);

    return {
      oem: oemParts,
      jm: jmData,
      combined,
    };
  } catch {
    return { oem: [], jm: [], combined: [] };
  }
}

// -------------------- MERGE --------------------

export function mergeWithJm(
  oem: CatalogPart[],
  jm: CatalogPart[]
): CatalogPart[] {
  return deduplicateParts([...oem, ...jm]);
}

// -------------------- VEHICLE PARTS --------------------

export async function listPartsForVehicle(opts: any) {
  const { data } = await supabase
    .from("parts_new_public")
    .select("*")
    .ilike("compatible_vehicles", `%${opts.brand}%`)
    .ilike("compatible_vehicles", `%${opts.model}%`)
    .limit(200);

  const items = (data || []).map((row) =>
    normalizeRow(row, "mopar")
  );

  return {
    items: deduplicateParts(items),
    total: items.length,
  };
}