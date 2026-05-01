// catalogV2API.ts - Unified Catalog v2 FIXED (OEM-first + J+M full ingestion)

import { supabase } from "@/lib/supabase";
import { jm_proxy } from "@/lib/jm-proxy";

/**
 * NORMALIZACE OEM
 */
const normalizeOem = (raw: string | null | undefined): string => {
  return String(raw || "")
    .toUpperCase()
    .replace(/[\s\-._/]/g, "")
    .trim();
};

/**
 * FIXED MATCHING - NEZAHOZUJE J+M BEZ CATEGORY
 */
const partMatchesNode = (part: any, category: any) => {
  const name = (part?.name || "").toLowerCase();
  const cat = (part?.category || "").toLowerCase();
  const label = (category?.label || category || "").toLowerCase();

  if (!label) return true;

  // 🔥 KEY FIX: J+M bez category NESMÍ PADNOUT
  if (!cat || cat.trim() === "") {
    return name.includes(label);
  }

  return cat.includes(label) || name.includes(label) || label.includes(name);
};

/**
 * FETCH OEM (parts_new)
 */
async function fetchOemParts(brand: string, model: string, engine: string, category: string) {
  const { data, error } = await supabase
    .from("parts_new")
    .select("*")
    .eq("brand", brand)
    .eq("model", model)
    .eq("engine", engine)
    .eq("category", category);

  if (error) throw error;
  return data || [];
}

/**
 * FETCH J+M (FULL - bez filtru!)
 */
async function fetchJmParts(brand: string, model: string, engine: string, category: string) {
  const jm = await jm_proxy.searchByVehicle({
    brand,
    model,
    engine,
    category
  });

  // ⚠️ NEFILTRUJ TADY
  return jm || [];
}

/**
 * MERGE LOGIKA OEM + J+M
 */
function mergeWithJm(oemParts: any[], jmParts: any[]) {
  const oemMap = new Map<string, any>();

  // OEM first
  for (const oem of oemParts) {
    const key = normalizeOem(oem.oem_number);
    oemMap.set(key, {
      ...oem,
      type: "OEM",
      badge: "ORIGINÁL ⭐",
      jm_matches: []
    });
  }

  const matched: any[] = [];
  const unmatched: any[] = [];

  // J+M processing
  for (const jm of jmParts) {
    const jmOem = normalizeOem(jm.oem_number);

    if (jmOem && oemMap.has(jmOem)) {
      const oem = oemMap.get(jmOem);

      const enriched = {
        ...jm,
        type: "J+M",
        badge: "NÁHRADA",
        matched_oem: jmOem
      };

      oem.jm_matches.push(enriched);
      matched.push(enriched);
    } else {
      unmatched.push({
        ...jm,
        type: "J+M",
        badge: "NÁHRADA",
        matched_oem: null
      });
    }
  }

  return {
    oem: Array.from(oemMap.values()),
    aftermarket_matched: matched,
    aftermarket_unmatched: unmatched
  };
}

/**
 * HLAVNÍ API
 */
export async function fetchCatalogProducts(opts: {
  brand: string;
  model: string;
  engine: string;
  category: any;
}) {
  const { brand, model, engine, category } = opts;

  // 1️⃣ OEM
  const oemParts = await fetchOemParts(brand, model, engine, category);

  // 2️⃣ J+M (FULL)
  const jmParts = await fetchJmParts(brand, model, engine, category);

  // 3️⃣ MERGE (BEZ FILTRU PŘEDTÍM!)
  const merged = mergeWithJm(oemParts, jmParts);

  // 4️⃣ FILTR AŽ NA KONCI
  const filteredOem = merged.oem.filter(p => partMatchesNode(p, category));
  const filteredMatched = merged.aftermarket_matched.filter(p => partMatchesNode(p, category));
  const filteredUnmatched = merged.aftermarket_unmatched.filter(p => partMatchesNode(p, category));

  return {
    success: true,
    data: {
      oem: filteredOem,
      aftermarket_matched: filteredMatched,
      aftermarket_unmatched: filteredUnmatched
    }
  };
}