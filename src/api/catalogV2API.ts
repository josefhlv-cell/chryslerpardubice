/**
 * CATALOG V2 API — Production-grade engine
 * 
 * OEM-first (Mopar rank 1-2) + Aftermarket J+M (rank 5)
 * Single source of truth: parts_new_public VIEW
 * 
 * Sources:
 * - OEM: Supabase parts_new_public (Mopar + CSV prices)
 * - Aftermarket: J+M API proxy via jm-proxy edge function
 * - Vehicles: nextis_vehicles table (Brand→Model→Engine)
 */

import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// TYPES
// ============================================================================

export interface CatalogPart {
  id: string;
  name: string;
  oem_number: string;
  price_with_vat: number | null;
  price_without_vat: number | null;
  availability: string | null;
  catalog_source: "mopar" | "mopar_oem" | "csv" | "jm" | "epc" | "ai" | "other";
  category: string | null;
  manufacturer: string | null;
  compatible_vehicles: string | null;
  description: string | null;
  image_urls: string[] | null;
  internal_code: string | null;
  is_oem: boolean;
}

export interface CatalogCategoryNode {
  id: string;
  label: string;
  slug: string;
  path: string[];
  keywords: string[];
  children?: CatalogCategoryNode[];
  sectionId?: string;
  count: number;
}

export interface NextisVehicle {
  id: string;
  brand: string;
  model: string;
  engine: string;
}

// ============================================================================
// GERMAN → CZECH TRANSLATION TABLE
// ============================================================================

const DE_TO_CS: Array<[RegExp, string]> = [
  // Multi-word phrases FIRST (greedy matching)
  [/\bBREMSBELAG\s+SATZ\b/gi, "Sada brzdových destiček"],
  [/\bBREMSBELAG\s+VORNE\b/gi, "Brzdové destičky přední"],
  [/\bBREMSBELAG\s+HINTEN\b/gi, "Brzdové destičky zadní"],
  [/\bBREMSENCHEIBE\s+VORNE\b/gi, "Brzdový kotouč přední"],
  [/\bBREMSENCHEIBE\s+HINTEN\b/gi, "Brzdový kotouč zadní"],
  [/\bZAHNRIEMEN\s+SATZ\b/gi, "Sada rozvodového řemene"],
  [/\bWASSERPUMPE\s+KOMPLETT\b/gi, "Vodní čerpadlo kompletní"],
  [/\bKUEHLER\s+KOMBI\b/gi, "Chladič kombinovaný"],
  [/\bELEKTRO\s+VENTILATOR\b/gi, "Elektrický ventilátor"],
  [/\bBREMSSATTEL\s+VORNE\b/gi, "Brzdový třmen přední"],
  [/\bBREMSSATTEL\s+HINTEN\b/gi, "Brzdový třmen zadní"],

  // Single words (alphabetical within category)
  // Brake system
  [/\bBREMSBELAG\b/gi, "Brzdová destička"],
  [/\bBREMSBELAEGE\b/gi, "Brzdová destička"],
  [/\bBREMSENCHEIBE\b/gi, "Brzdový kotouč"],
  [/\bBREMSSATTEL\b/gi, "Brzdový třmen"],
  [/\bBREMSZYLINDER\b/gi, "Brzdový válec"],
  [/\bBREMSFLUESSIGKEIT\b/gi, "Brzdová kapalina"],
  [/\bBREMSHADICKE\b/gi, "Brzdová hadice"],
  [/\bBREMSWAERTER\b/gi, "Brzdová kapalina"],
  [/\bABS\s+VENTIL\b/gi, "ABS ventil"],
  [/\bABS\s+PUMPE\b/gi, "ABS čerpadlo"],

  // Engine
  [/\bZAHNRIEMEN\b/gi, "Rozvodový řemen"],
  [/\bZYLINDERKOPF\b/gi, "Hlava válců"],
  [/\bOELWANNE\b/gi, "Olejová vana"],
  [/\bOELFILTER\b/gi, "Olejový filtr"],
  [/\bZUENDKERZE\b/gi, "Zapalovací svíčka"],
  [/\bVERBRENNUNGSMOTOR\b/gi, "Spalovací motor"],
  [/\bMOTOR\b/gi, "Motor"],

  // Cooling
  [/\bWASSERPUMPE\b/gi, "Vodní čerpadlo"],
  [/\bKUEHLER\b/gi, "Chladič"],
  [/\bKUEHLFLUESSIGKEIT\b/gi, "Chladící kapalina"],
  [/\bTHERMOSTAT\b/gi, "Termostat"],
  [/\bKUEHLMITTEL\b/gi, "Chladící medium"],
  [/\bVENTILATOR\b/gi, "Ventilátor"],
  [/\bVENTILATORVISKUS\b/gi, "Viskózní ventilátor"],
  [/\bKUEHLHADICKE\b/gi, "Chladící hadice"],

  // Suspension
  [/\bSTOSSDAEMPFER\b/gi, "Tlumič nárazů"],
  [/\bSPANNFEDER\b/gi, "Pružina"],
  [/\bFAHRWERKSBUSCHE\b/gi, "Pouzdro podvozku"],
  [/\bLENKERMANCHETTE\b/gi, "Manžeta volantu"],
  [/\bLENKGELENK\b/gi, "Volanté kloub"],
  [/\bSTABILISATORVERBINDER\b/gi, "Spojka stabilizátoru"],
  [/\bQUERLENKER\b/gi, "Příčné rameno"],
  [/\bBINSCHEN\b/gi, "Pouzdro"],

  // Electrical
  [/\bLICHTMACSCHINE\b/gi, "Alternátor"],
  [/\bANLASSER\b/gi, "Startér"],
  [/\bAKKUMULATOR\b/gi, "Baterie"],
  [/\bBATTERIE\b/gi, "Baterie"],
  [/\bRELAIS\b/gi, "Relé"],
  [/\bVERSTARKER\b/gi, "Zesilovač"],
  [/\bKONTAKT\b/gi, "Kontakt"],
  [/\bKONTAKTSTIFT\b/gi, "Kontaktní čep"],

  // Filters
  [/\bLUFTFILTER\b/gi, "Vzduchový filtr"],
  [/\bKABINENFILTER\b/gi, "Filtr kabiny"],
  [/\bOELFILTER\b/gi, "Olejový filtr"],
  [/\bKRAFTSTOFFFILTER\b/gi, "Palivový filtr"],
  [/\bALKOHOLFILTER\b/gi, "Alkoholový filtr"],
  [/\bFILTER\b/gi, "Filtr"],

  // Fuel system
  [/\bKRAFTSTOFFPUMPE\b/gi, "Palivové čerpadlo"],
  [/\bKRAFTSTOFFREGLER\b/gi, "Regulátor paliva"],
  [/\bEINSPRITZVENTIL\b/gi, "Vstřikovací ventil"],
  [/\bZERSTAEUBER\b/gi, "Rozprašovač"],
  [/\bKRAFTSTOFFHADICKE\b/gi, "Palivová hadice"],
  [/\bKRAFTSTOFF\b/gi, "Palivo"],

  // Transmission
  [/\bGETRIEBE\b/gi, "Převodovka"],
  [/\bKUPPLUNG\b/gi, "Spojka"],
  [/\bKUPPLUNGSBELAG\b/gi, "Obložení spojky"],
  [/\bKUPPLUNGSCHEIBE\b/gi, "Kotouč spojky"],
  [/\bFLUESSIGKEITSKUPPLUNG\b/gi, "Hydrodynamická spojka"],

  // Body
  [/\bTUER\b/gi, "Dveře"],
  [/\bSCHIEBETUER\b/gi, "Posuvné dveře"],
  [/\bKOFFERRAUM\b/gi, "Kufr"],
  [/\bMOTORHAUBE\b/gi, "Kapota motoru"],
  [/\bSCHEIBE\b/gi, "Okno"],
  [/\bSPIEGEL\b/gi, "Zrcadlo"],
  [/\bRUECKBLICKSPIEGEL\b/gi, "Zpětné zrcátko"],
  [/\bSEITENSPIEGEL\b/gi, "Boční zrcadlo"],
  [/\bSTOSSSTANGE\b/gi, "Nárazník"],
  [/\bANSAUGGRIFF\b/gi, "Madlo"],
  [/\bTUERGRIFF\b/gi, "Rukojeť dveří"],
  [/\bTUERGRIFFCHROM\b/gi, "Chromovaná rukojeť dveří"],

  // Interior
  [/\bSITZ\b/gi, "Sedadlo"],
  [/\bRUECKLEHNE\b/gi, "Opěradlo"],
  [/\bKOPFSTUETZE\b/gi, "Opěrka hlavy"],
  [/\bGUERTEL\b/gi, "Bezpečnostní pás"],
  [/\bAIRBAG\b/gi, "Airbag"],
  [/\bSCHALTER\b/gi, "Spínač"],
  [/\bTEPPICH\b/gi, "Koberec"],
  [/\bGUMMIMATTE\b/gi, "Gumová rohož"],

  // Liquids & Oils
  [/\bMOTOROEL\b/gi, "Motorový olej"],
  [/\bGETRIEBEOEL\b/gi, "Převodový olej"],
  [/\bDIFFERENZIALOEL\b/gi, "Diferenciálový olej"],
  [/\bKUEHLFLUESSIGKEIT\b/gi, "Chladící kapalina"],
  [/\bBREMSFLUESSIGKEIT\b/gi, "Brzdová kapalina"],
  [/\bLUFTFEDERFLUESSIGKEIT\b/gi, "Kapalina vzduchové pružiny"],

  // Common parts
  [/\bSCHRAUBE\b/gi, "Šroub"],
  [/\bMUTTER\b/gi, "Matice"],
  [/\bWASSCHER\b/gi, "Podložka"],
  [/\bKETTE\b/gi, "Řetěz"],
  [/\bRIEMEN\b/gi, "Řemen"],
  [/\bDICHTUNG\b/gi, "Těsnění"],
  [/\bDICHTRING\b/gi, "Těsnící kroužek"],
  [/\bGASKET\b/gi, "Těsnění"],
  [/\bSIEGEL\b/gi, "Těsnění"],
  [/\bKLIPS\b/gi, "Spona"],
  [/\bKLAMMER\b/gi, "Svorek"],
  [/\bROHR\b/gi, "Trubka"],
  [/\bROHRBUND\b/gi, "Potrubí"],
  [/\bHADICKE\b/gi, "Hadice"],
  [/\bKONEKTOR\b/gi, "Konektor"],
  [/\bSTECKER\b/gi, "Zástrčka"],
  [/\bVERBINDER\b/gi, "Spojka"],
  [/\bADAPTER\b/gi, "Adaptér"],
  [/\bGEHAEUSE\b/gi, "Kryt"],
  [/\bDECKEL\b/gi, "Víko"],
  [/\bLOECKEL\b/gi, "Zámek"],
  [/\bKONSOLE\b/gi, "Konzola"],
  [/\bHALTER\b/gi, "Držák"],
  [/\bMONTAGE\b/gi, "Montáž"],
  [/\bVERBINDUNG\b/gi, "Spojení"],
  [/\bSOCKEL\b/gi, "Patice"],
  [/\bSICHERUNG\b/gi, "Pojistka"],
  [/\bSICHERUNGSSATZ\b/gi, "Sada pojistek"],
  [/\bRELAIS\b/gi, "Relé"],
  [/\bKONTAKT\b/gi, "Kontakt"],
];

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

function sanitizeName(raw: string): string {
  if (!raw) return "—";
  
  let text = String(raw).trim();
  
  // Apply German → Czech translation
  for (const [pattern, replacement] of DE_TO_CS) {
    text = text.replace(pattern, replacement);
  }
  
  // Remove excessive special characters but keep key ones
  text = text.replace(/[«»„"]/g, '"');
  text = text.replace(/\s+/g, " "); // Normalize whitespace
  
  // Convert SCREAMING_CASE to Sentence case
  if (text === text.toUpperCase() && text.length > 3) {
    text = text.charAt(0) + text.slice(1).toLowerCase();
  }
  
  return text;
}

function sanitizeCategory(raw: string | null): string | null {
  if (!raw) return null;
  
  const text = String(raw).trim().toLowerCase();
  
  // Map English → Czech categories
  const categoryMap: Record<string, string> = {
    "brakes": "Brzdové zařízení",
    "brake system": "Brzdové zařízení",
    "disc brakes": "Kotoučové brzdy",
    "drum brakes": "Bubnové brzdy",
    "brake pads": "Brzdové destičky",
    "engine": "Motor",
    "cooling": "Chlazení",
    "cooling system": "Chlazení",
    "suspension": "Odpružení",
    "electrical": "Elektroinstalace",
    "filters": "Filtry",
    "fuel system": "Palivový systém",
    "transmission": "Převodovka",
    "gearbox": "Převodovka",
    "body": "Karoserie",
    "bodywork": "Karoserie",
    "interior": "Interiér",
    "liquids": "Kapaliny a oleje",
    "oils": "Kapaliny a oleje",
    "wheels": "Kola a pneumatiky",
    "tires": "Kola a pneumatiky",
    "steering": "Řízení",
    "exhaust": "Výfuk",
    "climate": "Klimatizace",
    "hvac": "Klimatizace",
    "other": "Ostatní",
  };
  
  for (const [en, cs] of Object.entries(categoryMap)) {
    if (text.includes(en)) return cs;
  }
  
  return null;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

export async function fetchBrands(): Promise<string[]> {
  const { data, error } = await supabase
    .from("nextis_vehicles")
    .select("brand", { count: "exact" })
    .order("brand");
  
  if (error) throw error;
  return [...new Set(data?.map((r: any) => r.brand) || [])];
}

export async function fetchModelsForBrand(brand: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("nextis_vehicles")
    .select("model")
    .eq("brand", brand)
    .order("model");
  
  if (error) throw error;
  return [...new Set(data?.map((r: any) => r.model) || [])];
}

export async function fetchEnginesForModel(brand: string, model: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("nextis_vehicles")
    .select("engine")
    .eq("brand", brand)
    .eq("model", model)
    .order("engine");
  
  if (error) throw error;
  return [...new Set(data?.map((r: any) => r.engine) || [])];
}

export async function fetchNextisVehicles(brand: string, model: string): Promise<NextisVehicle[]> {
  const { data, error } = await supabase
    .from("nextis_vehicles")
    .select("id, brand, model, engine")
    .eq("brand", brand)
    .eq("model", model)
    .order("engine");
  
  if (error) throw error;
  return data || [];
}

export async function fetchJmCategoryTree(opts: {
  nextisVehicleId: string;
  brand: string;
  model: string;
  engine: string;
}): Promise<CatalogCategoryNode[]> {
  const { data, error } = await supabase
    .from("catalog_categories")
    .select("id, slug, name_cs, keywords, path, children:catalog_categories!parent_id(id, slug, name_cs, keywords, path)")
    .is("parent_id", null)
    .order("sort_order");
  
  if (error) throw error;
  
  return (data || []).map((cat: any) => ({
    id: cat.id,
    label: cat.name_cs,
    slug: cat.slug,
    path: cat.path || [],
    keywords: (cat.keywords || []).map((k: any) => (typeof k === "string" ? k : k.keyword)),
    count: 0,
    sectionId: cat.id,
    children: (cat.children || []).map((child: any) => ({
      id: child.id,
      label: child.name_cs,
      slug: child.slug,
      path: child.path || [],
      keywords: (child.keywords || []).map((k: any) => (typeof k === "string" ? k : k.keyword)),
      count: 0,
    })),
  }));
}

export async function listPartsForVehicle(opts: {
  brand: string;
  model: string;
  engine: string;
  nextisVehicleId: string;
  canonicalCategory: string;
  categoryKeywords: string[];
  page: number;
  pageSize: number;
}): Promise<{ items: CatalogPart[]; total: number }> {
  const from = opts.page * opts.pageSize;
  const to = from + opts.pageSize - 1;
  
  const { data, error, count } = await supabase
    .from("parts_new_public")
    .select("*", { count: "exact" })
    .range(from, to);
  
  if (error) throw error;
  
  const parts = (data || []).map((p: any) => ({
    id: p.id,
    name: sanitizeName(p.name),
    oem_number: p.oem_number,
    price_with_vat: p.price_with_vat,
    price_without_vat: p.price_without_vat,
    availability: p.availability,
    catalog_source: p.catalog_source || "other",
    category: sanitizeCategory(p.category),
    manufacturer: p.manufacturer,
    compatible_vehicles: p.compatible_vehicles,
    description: p.description,
    image_urls: p.image_urls,
    internal_code: p.internal_code,
    is_oem: true,
  }));
  
  return { items: parts, total: count || 0 };
}

export async function fetchJmForVehicle(opts: {
  brand: string;
  model: string;
  engine: string;
  nextisVehicleId: string;
  sectionId: string;
  category: string;
  categoryId: string;
  categoryKeywords: string[];
  parentKeywords: string[];
}): Promise<{ items: CatalogPart[]; warning?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("jm-proxy", {
      body: {
        action: "search-vehicle",
        brand: opts.brand,
        model: opts.model,
        engine: opts.engine,
        categoryId: opts.categoryId,
        keywords: opts.categoryKeywords,
      },
    });
    
    if (error) throw error;
    
    const parts = (data?.items || []).map((p: any) => ({
      id: `jm:${p.oem_number || p.id}`,
      name: sanitizeName(p.name),
      oem_number: p.oem_number,
      price_with_vat: p.price_with_vat,
      price_without_vat: p.price_without_vat,
      availability: p.availability,
      catalog_source: "jm" as const,
      category: sanitizeCategory(p.category),
      manufacturer: p.manufacturer,
      compatible_vehicles: `${opts.brand} ${opts.model}`,
      description: p.description,
      image_urls: p.image_urls,
      internal_code: null,
      is_oem: false,
    }));
    
    return { items: parts, warning: data?.warning };
  } catch (err: any) {
    return { items: [], warning: err.message };
  }
}

export async function fetchJmByCodes(codes: string[]): Promise<CatalogPart[]> {
  if (!codes.length) return [];
  
  try {
    const { data, error } = await supabase.functions.invoke("jm-proxy", {
      body: {
        action: "search-by-oem",
        oem_numbers: codes,
      },
    });
    
    if (error) throw error;
    
    return (data?.items || []).map((p: any) => ({
      id: `jm:${p.oem_number}`,
      name: sanitizeName(p.name),
      oem_number: p.oem_number,
      price_with_vat: p.price_with_vat,
      price_without_vat: p.price_without_vat,
      availability: p.availability,
      catalog_source: "jm" as const,
      category: sanitizeCategory(p.category),
      manufacturer: p.manufacturer,
      compatible_vehicles: null,
      description: p.description,
      image_urls: p.image_urls,
      internal_code: null,
      is_oem: false,
    }));
  } catch (err) {
    return [];
  }
}

export function mergeWithJm(oemParts: CatalogPart[], jmParts: CatalogPart[]): CatalogPart[] {
  const oemMap = new Map(oemParts.map((p) => [p.oem_number, p]));
  const merged: CatalogPart[] = [...oemParts];
  
  for (const jm of jmParts) {
    if (!oemMap.has(jm.oem_number)) {
      merged.push(jm);
    }
  }
  
  return merged;
}
