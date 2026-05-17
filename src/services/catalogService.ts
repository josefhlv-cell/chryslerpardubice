/**
 * Catalog Service — J+M MIRROR (1:1)
 *
 * Žádný klasifikátor. Žádné přehazování. Kategorie = co vrátí J+M API
 * (tecdoc_section / gen_art_name). Díly v kategorii = přesně co J+M
 * pro danou sekci vrátí. OEM Mopar se přidá jen pokud J+M díl má odpovídající
 * OE číslo v parts_new_public.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CatalogPart } from "@/api/catalogV2API";
import { mapSectionToParent, CANONICAL_PARENTS } from "./jmCategoryTaxonomy";

export type CategoryGroup = {
  id: string;
  label: string;
  count: number;
  parts: CatalogPart[];
  children?: CategoryGroup[];
};

const normalizeOem = (s: string) =>
  (s || "").toUpperCase().replace(/[\s\-._/]/g, "");

type RawJmItem = {
  oem_number: string;
  brand: string;
  name: string;
  description?: string;
  price_with_vat: number;
  price_without_vat: number;
  stock: number;
  availability: string;
  image: string;
  image_urls?: string[];
  oe_numbers?: string[];
  related_oem_number?: string;
  technical_parameters?: Record<string, string>;
  category: string;
  tecdoc_section?: { id: number | string; label: string };
};

function jmToCatalogPart(it: RawJmItem): CatalogPart {
  const price = Number(it.price_with_vat) || 0;
  const stock = Number(it.stock) || 0;
  return {
    id: `jm-${it.oem_number}`,
    oem_number: it.oem_number,
    name: it.name || it.oem_number,
    manufacturer: it.brand || null,
    catalog_source: "jm",
    price_without_vat: it.price_without_vat || null,
    price_with_vat: price || null,
    availability: stock > 0 ? "in_stock" : price > 0 ? it.availability || "on_order" : "on_order",
    image_urls: it.image_urls && it.image_urls.length > 0 ? it.image_urls : (it.image ? [it.image] : null),
    category: it.category || it.tecdoc_section?.label || null,
    description: it.description || null,
    is_oem: false,
    badge_label: "NÁHRADA",
    rank: 5,
    final_price: price || null,
    markup_percent: 0,
    technical_parameters: it.technical_parameters && Object.keys(it.technical_parameters).length > 0 ? it.technical_parameters : null,
    compatible_vehicles: null,
    related_oem_number: it.related_oem_number || null,
    oe_numbers: it.oe_numbers && it.oe_numbers.length > 0 ? it.oe_numbers : null,
    stock,
    tecdoc_section: it.tecdoc_section?.label || null,
  };
}

function oemRowToCatalogPart(row: any): CatalogPart {
  const price = Number(row.price_with_vat) || 0;
  return {
    id: String(row.id),
    oem_number: String(row.oem_number || ""),
    name: String(row.name || row.oem_number || ""),
    manufacturer: row.manufacturer || "Mopar",
    catalog_source: String(row.catalog_source || "mopar"),
    price_without_vat: Number(row.price_without_vat) || null,
    price_with_vat: price || null,
    availability: price > 0 ? row.availability || "in_stock" : "on_order",
    image_urls: Array.isArray(row.image_urls) ? row.image_urls : null,
    category: row.category || null,
    description: row.description || null,
    is_oem: true,
    badge_label: "ORIGINÁL",
    rank: 1,
    final_price: price || null,
    markup_percent: 0,
    technical_parameters: null,
    compatible_vehicles: null,
    related_oem_number: null,
    oe_numbers: null,
  };
}

export async function fetchAllPartsForEngine(opts: {
  brand: string;
  model: string;
  engine: string;
  nextisVehicleId?: string;
  vin?: string;
  year?: number;
}): Promise<{ groups: CategoryGroup[]; totalParts: number; oemSeedsUsed: number; warning?: string; debug?: any }> {
  const { data, error } = await supabase.functions.invoke("jm-proxy", {
    body: { action: "partsForEngine", payload: opts },
  });
  if (error) {
    console.error("[catalogService] partsForEngine error:", error);
    return { groups: [], totalParts: 0, oemSeedsUsed: 0, warning: error.message };
  }
  const payload = (data?.data || data || {}) as any;
  const rawItems: RawJmItem[] = payload.items || [];
  const oemSeedsUsed: number = payload.oemSeedsUsed || 0;
  const debug = payload.debug || {};

  // 1. Group J+M items by tecdoc_section (1:1 mirror)
  const sectionMap = new Map<string, { id: string; label: string; jmItems: RawJmItem[] }>();
  for (const it of rawItems) {
    const sec = it.tecdoc_section || { id: 0, label: it.category || "Ostatní" };
    const id = String(sec.id || sec.label || "0");
    const label = String(sec.label || it.category || "Ostatní").trim();
    if (!sectionMap.has(id)) sectionMap.set(id, { id, label, jmItems: [] });
    sectionMap.get(id)!.jmItems.push(it);
  }

  // 2. Collect all OE numbers we need to look up in parts_new_public
  const oemNumbersToFetch = new Set<string>();
  for (const it of rawItems) {
    if (it.related_oem_number) oemNumbersToFetch.add(it.related_oem_number);
    for (const oe of it.oe_numbers || []) oemNumbersToFetch.add(oe);
  }

  let oemRows: any[] = [];
  if (oemNumbersToFetch.size > 0) {
    const list = [...oemNumbersToFetch].slice(0, 2000);
    const BATCH = 200;
    for (let i = 0; i < list.length; i += BATCH) {
      const slice = list.slice(i, i + BATCH);
      const { data: rows } = await supabase
        .from("parts_new_public")
        .select("id, oem_number, name, manufacturer, catalog_source, price_with_vat, price_without_vat, availability, image_urls, category, description")
        .in("oem_number", slice);
      if (rows) oemRows.push(...rows);
    }
    oemRows = oemRows.filter((r: any) => {
      const src = String(r.catalog_source || "").toLowerCase();
      return ["mopar", "mopar_oem", "7zap", "csv", "epc-link"].includes(src);
    });
  }
  const oemByNumber = new Map<string, any>();
  for (const row of oemRows) oemByNumber.set(normalizeOem(row.oem_number), row);

  // 3. Build groups 1:1 from J+M sections. ORIGINÁL first per J+M item (matched by OE), then NÁHRADA.
  const groups: CategoryGroup[] = [];
  for (const [, bucket] of sectionMap) {
    const seenOem = new Set<string>();
    const oemParts: CatalogPart[] = [];
    const jmParts: CatalogPart[] = [];
    const seenJm = new Set<string>();

    for (const it of bucket.jmItems) {
      // try related_oem_number first, then any oe_numbers
      const candidates: string[] = [];
      if (it.related_oem_number) candidates.push(it.related_oem_number);
      for (const oe of it.oe_numbers || []) candidates.push(oe);
      for (const c of candidates) {
        const k = normalizeOem(c);
        if (!k || seenOem.has(k)) continue;
        const row = oemByNumber.get(k);
        if (row) {
          oemParts.push(oemRowToCatalogPart(row));
          seenOem.add(k);
          break;
        }
      }
      const jk = normalizeOem(it.oem_number);
      if (!jk || seenJm.has(jk)) continue;
      seenJm.add(jk);
      jmParts.push(jmToCatalogPart(it));
    }

    const parts = [...oemParts, ...jmParts];
    if (parts.length === 0) continue;
    groups.push({ id: bucket.id, label: bucket.label, count: parts.length, parts });
  }

  // Sort: most parts first; alphabetical on tie
  groups.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "cs"));

  const totalParts = groups.reduce((s, g) => s + g.count, 0);
  return {
    groups,
    totalParts,
    oemSeedsUsed,
    warning: payload.warning,
    debug: { ...debug, mirror: "jm-1:1", sections: groups.length },
  };
}
