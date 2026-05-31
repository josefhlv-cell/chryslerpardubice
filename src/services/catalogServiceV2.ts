/**
 * Catalog Service V2 — čte přímo z `jm_category_tree_v2` + `jm_part_v2`.
 * 1:1 mirror J+M (Nextis): brand → model → engine → gen_art_name → díly.
 *
 * KITOEM injekce: pro každou kategorii dohledáme odpovídající záznamy
 * v `kitoem_parts` (match podle brand+model+engine+category ↔ gen_art_name)
 * a vložíme je na ZAČÁTEK seznamu jako ORIGINÁL ⭐.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CatalogPart } from "@/api/catalogV2API";
import type { CategoryGroup } from "./catalogService";
import { mapSectionToPath } from "./jmCategoryTaxonomy";

const stripDia = (s: string) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * TecDoc gen_art_id → upřesňující suffix.
 * Více různých TecDoc článků sdílí stejný český název ("Žárovka", "Těsnění", …).
 * Tento map zachovává rozlišení v UI, aby zákazník viděl rozdíl mezi
 * žárovkou do světlometu, brzdového světla a směrovky.
 */
const TECDOC_SUFFIX: Record<number, string> = {
  // Žárovky
  105: "hlavní světlomet",
  114: "brzdové / koncové světlo",
  152: "směrovka",
  189: "mlhový světlomet",
  238: "couvací světlo",
  240: "osvětlení SPZ",
  248: "interiér",
  264: "denní svícení",
  // Těsnění (motor)
  27: "kolektor výfukových plynů",
  28: "olejová vana",
  42: "koleno sacího potrubí",
  43: "sací potrubí (jiné)",
  44: "kryt rozvodů",
  314: "vodní čerpadlo",
  318: "hlava válce",
  319: "sada – hlava válce",
  321: "kryt hlavy válce",
  322: "obecné",
  323: "dřík ventilu",
};


type TreeRow = {
  id: string;
  brand: string;
  model: string;
  engine: string;
  k_type: number;
  gen_art_id: number;
  gen_art_name: string;
  part_count: number;
};

type PartRow = {
  id: string;
  node_id: string;
  oem_number: string;
  name: string | null;
  manufacturer: string | null;
  price_with_vat: number | null;
  price_without_vat: number | null;
  stock: number | null;
  availability: string | null;
  image_url: string | null;
};

type KitoemRow = {
  id: string;
  oem_number: string;
  name: string | null;
  description: string | null;
  category: string | null;
  image_urls: string[] | null;
  technical_params: Record<string, string> | null;
  price_with_vat: number | null;
  price_without_vat: number | null;
  jm_part_code: string | null;
};

function jmRowToCatalog(row: PartRow): CatalogPart {
  const price = Number(row.price_with_vat) || 0;
  const stock = Number(row.stock) || 0;
  return {
    id: `jmv2-${row.id}`,
    oem_number: row.oem_number,
    name: row.name || row.oem_number,
    manufacturer: row.manufacturer || null,
    catalog_source: "jm",
    price_without_vat: row.price_without_vat ?? null,
    price_with_vat: price || null,
    availability: stock > 0 ? "in_stock" : price > 0 ? row.availability || "on_order" : "on_order",
    image_urls: row.image_url ? [row.image_url] : null,
    category: null,
    description: null,
    is_oem: false,
    badge_label: "NÁHRADA",
    rank: 5,
    final_price: price || null,
    markup_percent: 0,
    technical_parameters: null,
    compatible_vehicles: null,
    related_oem_number: null,
    oe_numbers: null,
    stock,
    tecdoc_section: null,
  };
}

function kitoemRowToCatalog(row: KitoemRow): CatalogPart {
  const price = Number(row.price_with_vat) || 0;
  return {
    id: `kitoem-${row.id}`,
    oem_number: row.oem_number,
    name: row.name || row.oem_number,
    manufacturer: "MOPAR / OEM",
    catalog_source: "mopar",
    price_without_vat: row.price_without_vat ?? null,
    price_with_vat: price || null,
    availability: price > 0 ? "in_stock" : "on_order",
    image_urls: Array.isArray(row.image_urls) && row.image_urls.length ? row.image_urls : null,
    category: row.category,
    description: row.description,
    is_oem: true,
    badge_label: "ORIGINÁL",
    rank: 1,
    final_price: price || null,
    markup_percent: 0,
    technical_parameters: row.technical_params || null,
    compatible_vehicles: null,
    related_oem_number: null,
    oe_numbers: null,
    stock: null,
    tecdoc_section: null,
  };
}

/** Načte plochý seznam kategorií + dílů pro daný vůz s KITOEM ORIGINÁL injekcí. */
export async function fetchAllPartsForEngineV2(opts: {
  brand: string;
  model: string;
  engine: string;
}): Promise<{ groups: CategoryGroup[]; totalParts: number; warning?: string; debug?: any } | null> {
  const { brand, model, engine } = opts;
  if (!brand || !model || !engine) return null;

  const [{ data: nodes, error: nodeErr }, { data: kitoem }] = await Promise.all([
    supabase
      .from("jm_category_tree_v2")
      .select("id, brand, model, engine, k_type, gen_art_id, gen_art_name, part_count")
      .eq("brand", brand)
      .eq("model", model)
      .eq("engine", engine)
      .order("gen_art_name", { ascending: true }),
    (supabase as any)
      .from("kitoem_parts")
      .select("id, oem_number, name, description, category, image_urls, technical_params, price_with_vat, price_without_vat, jm_part_code")
      .eq("brand", brand)
      .eq("model", model)
      .eq("engine", engine)
      .limit(5000),
  ]);

  if (nodeErr) {
    console.warn("[catalogServiceV2] node load failed:", nodeErr.message);
    return null;
  }
  const rows = (nodes || []) as TreeRow[];
  if (rows.length === 0) return null;

  const nodeIds = rows.map((r) => r.id);
  const { data: parts, error: partsErr } = await supabase
    .from("jm_part_v2")
    .select("id, node_id, oem_number, name, manufacturer, price_with_vat, price_without_vat, stock, availability, image_url")
    .in("node_id", nodeIds);

  if (partsErr) {
    console.warn("[catalogServiceV2] parts load failed:", partsErr.message);
    return null;
  }

  const byNode = new Map<string, PartRow[]>();
  for (const p of (parts || []) as PartRow[]) {
    const arr = byNode.get(p.node_id) || [];
    arr.push(p);
    byNode.set(p.node_id, arr);
  }

  // KITOEM podle kategorie (gen_art_name) — case insensitive normalizace.
  const norm = (s?: string | null) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const kitoemByCat = new Map<string, KitoemRow[]>();
  for (const k of ((kitoem || []) as KitoemRow[])) {
    const key = norm(k.category);
    if (!key) continue;
    const arr = kitoemByCat.get(key) || [];
    arr.push(k);
    kitoemByCat.set(key, arr);
  }

  let kitoemInjected = 0;

  // 1) Sloučení duplicit: stejný český gen_art_name (různé TecDoc IDs) → jedna kategorie.
  const leafByName = new Map<string, { label: string; parts: CatalogPart[]; oemSet: Set<string> }>();
  for (const r of rows) {
    const jmItems = (byNode.get(r.id) || []).map(jmRowToCatalog);
    const key = stripDia(r.gen_art_name);
    const bucket = leafByName.get(key) || { label: r.gen_art_name, parts: [], oemSet: new Set<string>() };
    for (const p of jmItems) {
      const oemKey = p.oem_number.toUpperCase();
      if (!bucket.oemSet.has(oemKey)) {
        bucket.oemSet.add(oemKey);
        bucket.parts.push(p);
      }
    }
    leafByName.set(key, bucket);
  }

  // 2) Injekce KITOEM ORIGINÁL na začátek odpovídající kategorie.
  for (const [key, bucket] of leafByName) {
    const matching = kitoemByCat.get(key) || [];
    if (matching.length === 0) continue;
    const kitoemOems = new Set(matching.map((k) => k.oem_number.toUpperCase()));
    bucket.parts = bucket.parts.filter((j) => !kitoemOems.has(j.oem_number.toUpperCase()));
    const originals = matching.map(kitoemRowToCatalog);
    kitoemInjected += originals.length;
    bucket.parts = [...originals, ...bucket.parts];
  }

  // 3) Sestavení hierarchie root → sub → leaf přes mapSectionToPath.
  type LeafGroup = CategoryGroup;
  const subBuckets = new Map<string, { rootId: string; rootLabel: string; rootSort: number; subId: string; subLabel: string; subSort: number; leaves: LeafGroup[] }>();

  for (const [key, bucket] of leafByName) {
    if (bucket.parts.length === 0) continue;
    const path = mapSectionToPath(bucket.label);
    const root = path[0];
    const sub = path[1] || path[0];
    const subKey = `${root.id}::${sub.id}`;
    const slot = subBuckets.get(subKey) || {
      rootId: root.id, rootLabel: root.label, rootSort: root.sort,
      subId: sub.id, subLabel: sub.label, subSort: sub.sort,
      leaves: [],
    };
    slot.leaves.push({
      id: `jmv2:leaf:${key}`,
      label: bucket.label,
      count: bucket.parts.length,
      parts: bucket.parts,
      // gen_art_ids pass-through pro deduplikaci popisků
      // (CategoryGroup type je tolerantní k extra polím)
      ...({ genArtIds: Array.from(bucket.genArtIds) } as any),
    } as any);
    subBuckets.set(subKey, slot);
  }

  // 4) Seskup sub-kategorie pod root.
  const rootMap = new Map<string, { id: string; label: string; sort: number; subs: Map<string, { id: string; label: string; sort: number; leaves: LeafGroup[] }> }>();
  for (const slot of subBuckets.values()) {
    const r = rootMap.get(slot.rootId) || { id: slot.rootId, label: slot.rootLabel, sort: slot.rootSort, subs: new Map() };
    const s = r.subs.get(slot.subId) || { id: slot.subId, label: slot.subLabel, sort: slot.subSort, leaves: [] };
    s.leaves.push(...slot.leaves);
    r.subs.set(slot.subId, s);
    rootMap.set(slot.rootId, r);
  }

  const groups: CategoryGroup[] = [...rootMap.values()]
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "cs"))
    .map((root) => {
      const subs = [...root.subs.values()]
        .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "cs"))
        .map((sub) => {
          // ── Disambiguace duplicitních popisků v rámci jedné sub-kategorie ──
          // Když má víc leafů stejný label (např. "Žárovka" 8×), doplníme
          // upřesnění z TECDOC_SUFFIX, nebo „(č. {id})" jako fallback.
          const labelCounts = new Map<string, number>();
          for (const l of sub.leaves) {
            const k = stripDia(l.label);
            labelCounts.set(k, (labelCounts.get(k) || 0) + 1);
          }
          for (const l of sub.leaves) {
            const k = stripDia(l.label);
            if ((labelCounts.get(k) || 0) > 1) {
              const ids: number[] = (l as any).genArtIds || [];
              const suffixParts = ids
                .map((id) => TECDOC_SUFFIX[id] || `č. ${id}`)
                .filter(Boolean);
              if (suffixParts.length > 0) {
                l.label = `${l.label} (${suffixParts.join(", ")})`;
              }
            }
          }
          const leaves = sub.leaves.sort((a, b) => a.label.localeCompare(b.label, "cs"));
          const subCount = leaves.reduce((s, l) => s + l.count, 0);
          // Pokud sub má jen jeden leaf se stejným názvem → zjednodušit (leaf = sub).
          if (leaves.length === 1 && stripDia(leaves[0].label) === stripDia(sub.label)) {
            return leaves[0];
          }
          return {
            id: `jmv2:sub:${root.id}:${sub.id}`,
            label: sub.label,
            count: subCount,
            parts: [],
            children: leaves,
          } as CategoryGroup;
        });

      const rootCount = subs.reduce((s, c) => s + c.count, 0);
      // Pokud root má jen jednu sub se stejným názvem → zjednodušit.
      if (subs.length === 1 && stripDia(subs[0].label) === stripDia(root.label)) {
        return { ...subs[0], id: `jmv2:root:${root.id}`, label: root.label };
      }
      return {
        id: `jmv2:root:${root.id}`,
        label: root.label,
        count: rootCount,
        parts: [],
        children: subs,
      } as CategoryGroup;
    })
    .filter((g) => g.count > 0);

  const totalParts = groups.reduce((s, g) => s + g.count, 0);
  return {
    groups,
    totalParts,
    debug: {
      source: "jm_tree_v2+kitoem+hierarchy",
      nodes: rows.length,
      mergedLeaves: leafByName.size,
      rootCategories: groups.length,
      k_type: rows[0]?.k_type ?? null,
      kitoemInjected,
    },
  };
}

