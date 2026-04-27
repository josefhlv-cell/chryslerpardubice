/**
 * CATALOG V4 — Production-grade engine (REVISED)
 * -----------------------------------------------------
 * Fixes:
 * - Strict regex-based keyword matching (\b boundaries).
 * - J+M technical parameters mapping to description.
 * - Removed aggressive fallbacks that caused "category bleeding".
 */

import { supabase } from "@/integrations/supabase/client";

export const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia", "Jeep"] as const;
const ALLOWED_OEM_SOURCES = ["mopar", "mopar_oem", "epc-ai", "7zap", "epc-link", "ai-epc", "csv"] as const;

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
  related_oem_number?: string | null;
};

// ... (NextisVehicle a další typy zůstávají stejné)

// =============================================================
// HELPERS & TRANSLATIONS
// =============================================================

const normalize = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizeOem = (s: string): string =>
  (s || "").toUpperCase().replace(/[\s\-._/]/g, "");

const DE_TO_CS: [RegExp, string][] = [
  [/\bBREMSBELAG SATZ\b/gi, "Sada brzdových destiček"],
  [/\bBREMSBELAG\b/gi, "Brzdová destička"],
  [/\bBREMSSCHEIBE\b/gi, "Brzdový kotouč"],
  [/\bBREMSSATTEL\b/gi, "Brzdový třmen"],
  [/\bWASSERPUMPE\b/gi, "Vodní čerpadlo"],
  [/\bSTOSSDAEMPFER\b/gi, "Tlumič pérování"],
  [/\bOELFILTER\b/gi, "Olejový filtr"],
  [/\bLUFTFILTER\b/gi, "Vzduchový filtr"],
];

function sanitizeName(raw: string): string {
  if (!raw || raw === "—") return raw;
  let name = raw;
  for (const [pattern, replacement] of DE_TO_CS) {
    name = name.replace(pattern, replacement);
  }
  return name.trim();
}

/**
 * KLÍČOVÁ OPRAVA: Filtrování pomocí regulárních výrazů na hranice slov (\b).
 * Zabrání tomu, aby "olej" odpovídal "kolejnici".
 */
export function partMatchesKeywords(part: CatalogPart, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;
  const haystack = normalize(`${part.name} ${part.description || ""} ${part.category || ""}`);
  return keywords.some((kw) => {
    const nKw = normalize(kw);
    // Hledáme pouze celá slova nebo začátky slov následované mezerou/pomlčkou
    const regex = new RegExp(`(^|\\s|\\/|\\-)${nKw}`, "i");
    return regex.test(haystack);
  });
}

// =============================================================
// NORMALIZATION
// =============================================================

function normalizeRow(row: any): CatalogPart {
  const source = row?.catalog_source || "mopar";
  const pw = Number(row?.price_with_vat) || null;
  const pwoVat = Number(row?.price_without_vat) || (pw ? Math.round(pw / 1.21) : null);

  return {
    id: String(row?.id ?? `tmp:${row?.oem_number || Math.random()}`),
    oem_number: String(row?.oem_number || ""),
    name: sanitizeName(String(row?.name || row?.oem_number || "—")),
    manufacturer: row?.manufacturer ?? null,
    catalog_source: source,
    price_without_vat: pwoVat,
    price_with_vat: pw,
    availability: row?.availability ?? null,
    image_urls: Array.isArray(row?.image_urls) ? row.image_urls : null,
    category: row?.category || null,
    description: row?.description ?? null,
    is_oem: source !== "jm",
    badge_label: source === "jm" ? "NÁHRADA" : "ORIGINÁL",
    rank: source === "jm" ? 5 : 1,
  };
}

/**
 * OPRAVA J+M NORMALIZACE: Vytahuje technické parametry do popisu.
 */
function jmNormalize(it: any): CatalogPart {
  const base = normalizeRow(it);
  
  // Vytáhneme parametry jako "přední náprava", "tloušťka" atd.
  const techParams = it.technical_parameters 
    ? Object.entries(it.technical_parameters)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ")
    : "";

  return {
    ...base,
    id: `jm:${it.oem_number}`,
    catalog_source: "jm",
    description: it.description || techParams || null,
    related_oem_number: it.related_oem_number || null,
  };
}

// =============================================================
// FETCHING
// =============================================================

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
  
  return { items: parts, total: parts.length };
}

export async function fetchJmForVehicle(opts: any) {
  try {
    const { data, error } = await supabase.functions.invoke("jm-proxy", {
      body: { 
        action: "searchByVehicle", 
        payload: {
          nextisVehicleId: opts.nextisVehicleId,
          brand: opts.brand,
          model: opts.model,
          engine: opts.engine
        } 
      },
    });

    if (error || !data?.success) return { items: [] };
    
    const raw = Array.isArray(data?.data?.items) ? data.data.items : [];
    
    // Zde probíhá ta klíčová čistka - zahodíme vše, co nesedí na klíčová slova
    const filtered = raw
      .map(jmNormalize)
      .filter(p => partMatchesKeywords(p, opts.categoryKeywords || []));

    return { items: filtered };
  } catch (e) {
    return { items: [] };
  }
}

export function mergeWithJm(oem: CatalogPart[], jm: CatalogPart[]): CatalogPart[] {
  const oemKeys = new Set(oem.map((p) => normalizeOem(p.oem_number)));
  const filteredJm = jm.filter((p) => !oemKeys.has(normalizeOem(p.oem_number)));
  return [...oem, ...filteredJm].sort((a, b) => a.rank - b.rank);
}
