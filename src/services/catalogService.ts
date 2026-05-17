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
import { CANONICAL_PARENTS, mapSectionToPath, normalizeSectionLabel } from "./jmCategoryTaxonomy";

export type CategoryGroup = {
  id: string;
  label: string;
  count: number;
  parts: CatalogPart[];
  children?: CategoryGroup[];
};

const stripBrandPrefix = (s: string) => {
  const idx = s.lastIndexOf(":");
  return idx >= 0 ? s.slice(idx + 1) : s;
};
const stripLeadingZeros = (s: string) => s.replace(/^0+(?=.)/, "");
// Kanonická forma OEM klíče pro Map lookup — sjednocuje varianty
// "0000077366718", "00K68243338AA", "K68243338AA", "5142560AB" tak, aby
// se trefily na stejný klíč. Pravidla: strip brand prefix → uppercase →
// remove separators → strip leading zeros → odstraň "00K" prefix (= K).
const canonicalOem = (raw: string): string => {
  let s = stripBrandPrefix(raw || "").toUpperCase().replace(/[\s\-._/]/g, "");
  s = s.replace(/^00K/, "K");
  s = stripLeadingZeros(s);
  return s;
};
const normalizeOem = canonicalOem;
// Vrátí všechny varianty OEM, které pošleme do .in() dotazu na parts_new.
// Cílem je přežít: padding nulami, K-prefix, 00K-prefix, čistou formu.
const oemMatchVariants = (raw: string): string[] => {
  const stripped = stripBrandPrefix(String(raw || "")).trim();
  if (!stripped) return [];
  const upper = stripped.toUpperCase().replace(/[\s\-._/]/g, "");
  const noZeros = stripLeadingZeros(upper);
  const no00K = upper.replace(/^00K/, "K");
  const set = new Set<string>([stripped, upper, noZeros, no00K, stripLeadingZeros(no00K)]);
  // Také zkusit K-variantu a bezKvariantu pro Mopar katalog
  const core = noZeros.replace(/^K/, "");
  if (core) {
    set.add(core);
    set.add(`K${core}`);
    set.add(`00K${core}`);
    set.add(`0000${core}`);
  }
  return [...set].filter(Boolean);
};

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

// Z J+M dílu odvodí specifikátor (přední/zadní/levá/pravá/horní/dolní),
// kterým obohatí generický OEM název ("Brzdové destičky" → "... přední").
function deriveOemNameQualifier(jm?: RawJmItem | null): string {
  if (!jm) return "";
  const haystack = [
    jm.tecdoc_section?.label,
    jm.name,
    jm.description,
    ...Object.values(jm.technical_parameters || {}),
  ].filter(Boolean).join(" ").toLowerCase();
  const tags: string[] = [];
  const push = (t: string) => { if (!tags.includes(t)) tags.push(t); };
  if (/p[řr]edn[ií]|front|vorne/.test(haystack)) push("přední");
  else if (/zadn[ií]|rear|hinten/.test(haystack)) push("zadní");
  if (/\blev[áéý]\b|\bleft\b|\blinks\b/.test(haystack)) push("levá");
  else if (/\bprav[áéý]\b|\bright\b|\brechts\b/.test(haystack)) push("pravá");
  if (/horn[ií]|upper/.test(haystack)) push("horní");
  else if (/doln[ií]|lower/.test(haystack)) push("dolní");
  return tags.join(" ");
}

function oemRowToCatalogPart(row: any, sourceJm?: RawJmItem | null): CatalogPart {
  const price = Number(row.price_with_vat) || 0;
  const baseName = String(row.name || row.oem_number || "");
  const qualifier = deriveOemNameQualifier(sourceJm);
  const enrichedName = qualifier && !baseName.toLowerCase().includes(qualifier.split(" ")[0])
    ? `${baseName} ${qualifier}`.trim()
    : baseName;
  const description = row.description || sourceJm?.description || null;
  const image_urls = Array.isArray(row.image_urls) && row.image_urls.length > 0
    ? row.image_urls
    : (sourceJm?.image_urls && sourceJm.image_urls.length > 0
        ? sourceJm.image_urls
        : (sourceJm?.image ? [sourceJm.image] : null));
  return {
    id: String(row.id),
    oem_number: String(row.oem_number || ""),
    name: enrichedName,
    manufacturer: null, // ORIGINÁL badge mluví sám za sebe — nezobrazujeme "Mopar"
    catalog_source: String(row.catalog_source || "mopar"),
    price_without_vat: Number(row.price_without_vat) || null,
    price_with_vat: price || null,
    availability: price > 0 ? row.availability || "in_stock" : "on_order",
    image_urls,
    category: row.category || sourceJm?.tecdoc_section?.label || sourceJm?.category || null,
    description,
    is_oem: true,
    badge_label: "ORIGINÁL",
    rank: 1,
    final_price: price || null,
    markup_percent: 0,
    technical_parameters: sourceJm?.technical_parameters && Object.keys(sourceJm.technical_parameters).length > 0
      ? sourceJm.technical_parameters
      : null,
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
    const sec = it.tecdoc_section || { id: 0, label: it.category || "Nezařazená J+M sekce" };
    const rawLabel = String(sec.label || it.category || "Nezařazená J+M sekce").trim();
    const label = /^ostatní$/i.test(rawLabel) ? "Nezařazená J+M sekce" : rawLabel;
    const id = normalizeSectionLabel(label);
    if (!sectionMap.has(id)) sectionMap.set(id, { id, label, jmItems: [] });
    sectionMap.get(id)!.jmItems.push(it);
  }

  // 2. Collect all OE numbers we need to look up in parts_new_public.
  // J+M může vracet OE čísla ve formátu "CHRYSLER: 5142560AB" — ořezáváme brand prefix
  // a zkoušíme i variantu s "K" prefixem (Mopar/Lancia katalog).
  const oemNumbersToFetch = new Set<string>();
  const addOem = (raw: string | null | undefined) => {
    if (!raw) return;
    const stripped = stripBrandPrefix(String(raw)).trim();
    if (!stripped) return;
    oemNumbersToFetch.add(stripped);
    const norm = stripped.toUpperCase().replace(/[\s\-._/]/g, "");
    if (norm && norm !== stripped) oemNumbersToFetch.add(norm);
    if (norm && !norm.startsWith("K")) oemNumbersToFetch.add(`K${norm}`);
    if (norm.startsWith("K")) oemNumbersToFetch.add(norm.slice(1));
  };
  for (const it of rawItems) {
    addOem(it.related_oem_number);
    for (const oe of it.oe_numbers || []) addOem(oe);
  }

  let oemRows: any[] = [];
  if (oemNumbersToFetch.size > 0) {
    // Smaller batch keeps URL well under PostgREST/Cloudflare limits (~4 KB).
    // Previously BATCH=200 produced 5 KB+ URLs and Cloudflare returned 403,
    // which silently dropped ALL OEM rows → ORIGINÁL never appeared on top.
    const list = [...oemNumbersToFetch].slice(0, 2000);
    const BATCH = 40;
    const slices: string[][] = [];
    for (let i = 0; i < list.length; i += BATCH) slices.push(list.slice(i, i + BATCH));
    const results = await Promise.all(
      slices.map((slice) =>
        supabase
          .from("parts_new_public")
          .select("id, oem_number, name, manufacturer, catalog_source, price_with_vat, price_without_vat, availability, image_urls, category, description")
          .in("oem_number", slice)
          .then(({ data, error }) => {
            if (error) console.warn("[catalogService] oem batch failed:", error.message);
            return data || [];
          })
      )
    );
    for (const rows of results) oemRows.push(...rows);
    oemRows = oemRows.filter((r: any) => {
      const src = String(r.catalog_source || "").toLowerCase();
      return ["mopar", "mopar_oem", "jm_oem", "7zap", "csv", "epc-link"].includes(src);
    });
  }
  const oemByNumber = new Map<string, any>();
  for (const row of oemRows) oemByNumber.set(normalizeOem(row.oem_number), row);

  // 3. Build flat section groups 1:1 from J+M. ORIGINÁL first per J+M item, then NÁHRADA.
  const sectionGroups: CategoryGroup[] = [];
  for (const [, bucket] of sectionMap) {
    const seenOem = new Set<string>();
    const oemParts: CatalogPart[] = [];
    const jmParts: CatalogPart[] = [];
    const seenJm = new Set<string>();

    for (const it of bucket.jmItems) {
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
    sectionGroups.push({ id: bucket.id, label: bucket.label, count: parts.length, parts });
  }

  // 4. Build J+M-like hierarchy: Main category → J+M subcategory → live J+M section.
  // This keeps the real J+M sections intact, but places them under the same product tree
  // users see in J+M instead of dumping unmatched names into "Ostatní".
  type MutableGroup = CategoryGroup & { sort: number; childMap: Map<string, MutableGroup> };
  const rootMap = new Map<string, MutableGroup>();

  const dedupeParts = (parts: CatalogPart[]) => {
    const seen = new Set<string>();
    const dedup: CatalogPart[] = [];
    for (const p of parts) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      dedup.push(p);
    }
    return dedup;
  };

  const ensureNode = (map: Map<string, MutableGroup>, id: string, label: string, sort: number): MutableGroup => {
    const existing = map.get(id);
    if (existing) return existing;
    const node: MutableGroup = { id, label, sort, count: 0, parts: [], children: [], childMap: new Map() };
    map.set(id, node);
    return node;
  };

  for (const sec of sectionGroups) {
    const path = mapSectionToPath(sec.label);
    const rootInfo = path[0];
    const root = ensureNode(rootMap, rootInfo.id, rootInfo.label, rootInfo.sort);
    root.parts.push(...sec.parts);

    let parent = root;
    for (const nodeInfo of path.slice(1)) {
      const child = ensureNode(parent.childMap, nodeInfo.id, nodeInfo.label, nodeInfo.sort);
      parent.parts.push(...sec.parts);
      child.parts.push(...sec.parts);
      parent = child;
    }

    const sectionSlug = normalizeSectionLabel(sec.label || sec.id);
    const sectionId = `${parent.id}:section:${sectionSlug}`;
    const sectionNode = ensureNode(parent.childMap, sectionId, sec.label, 10_000);
    sectionNode.parts.push(...sec.parts);
  }

  const finalize = (node: MutableGroup): CategoryGroup => {
    const parts = dedupeParts(node.parts);
    const children = [...node.childMap.values()]
      .map(finalize)
      .sort((a, c) => {
        const ma = node.childMap.get(a.id)?.sort ?? 9999;
        const mc = node.childMap.get(c.id)?.sort ?? 9999;
        return ma - mc || a.label.localeCompare(c.label, "cs");
      });
    return {
      id: node.id,
      label: node.label,
      count: parts.length,
      parts,
      children: children.length > 0 ? children : undefined,
    };
  };

  const groups: CategoryGroup[] = [...rootMap.values()]
    .map(finalize)
    .sort((a, c) => {
      const sa = CANONICAL_PARENTS.find((p) => p.id === a.id)?.sort ?? 9999;
      const sc = CANONICAL_PARENTS.find((p) => p.id === c.id)?.sort ?? 9999;
      return sa - sc || a.label.localeCompare(c.label, "cs");
    });

  const totalParts = groups.reduce((s, g) => s + g.count, 0);
  return {
    groups,
    totalParts,
    oemSeedsUsed,
    warning: payload.warning,
    debug: { ...debug, hierarchy: "jm-3level", parents: groups.length, sections: sectionGroups.length },
  };
}
