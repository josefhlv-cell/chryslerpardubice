/**
 * Catalog Service v3 — single-call flow
 *
 * Flow:
 *  1. fetchAllPartsForEngine(brand, model, engine)
 *     → calls jm-proxy `partsForEngine` (1 round-trip).
 *     Returns ALL J+M parts for the vehicle, each tagged with TecDoc section.
 *  2. Builds a category tree client-side from tecdoc_section.id/label.
 *  3. For every J+M item, looks up Mopar OEM rows in parts_new
 *     via related_oem_number / oe_numbers and prepends them as ORIGINÁL.
 *
 * No catalog_categories DB tree. No scraping. No cookies.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CatalogPart } from "@/api/catalogV2API";

export type CategoryGroup = {
  id: string; // tecdoc id as string
  label: string;
  count: number;
  parts: CatalogPart[]; // OEM-first then J+M, deduped by oem_number
  children?: CategoryGroup[];
};

const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const CATEGORY_RULES: Array<{ id: string; label: string; match: RegExp }> = [
  { id: "body", label: "Karosérie", match: /karoser|zrcatk|naraznik|kapot|blatnik|dver|sklo|mrizka|zamek|klika|vzpera|svetl|osvet|mlhov|smerov|zarovka|spz/ },
  { id: "engine", label: "Motor", match: /motor|rozvod|tesnen|hlava|pist|ojnic|klik|vack|ventil|olejova pumpa|sani|turbo|egr|olejova van|motorov olej|olejovy filtr/ },
  { id: "drivetrain", label: "Přenos síly", match: /prevod|spojk|poloos|hnaci hridel|kardan|diferencial|setrvacnik|synchron|atf|prevodovy olej/ },
  { id: "filters", label: "Filtr", match: /filtr/ },
  { id: "windows", label: "Okna / čištění čelního skla", match: /sterac|ostriko|sklo|celni sklo|gumicka/ },
  { id: "fuel", label: "Příprava paliva", match: /paliv|vstrik|tryska|cerpadlo paliv|lista|vysokotlake/ },
  { id: "suspension", label: "Zavěšení", match: /odpru|tlumic|pruzin|ramen|silentblok|stabiliz|lozisk|naboj|kulov|cep|doraz|pomocny ram/ },
  { id: "brakes", label: "Brzdy", match: /brzd|abs|trmen|kotouc|destick|destic|buben|celist|valec|posilovac brzd/ },
  { id: "exhaust", label: "Výfukový systém", match: /vyfuk|katalyz|lambda|dpf|tlumic vyf/ },
  { id: "cooling_hvac", label: "Chlazení / Klimatizace", match: /chlad|vodni cerpad|termostat|radiator|expanz|ventilator chlad|intercooler|klimat|ac |kompresor|kondenz|topen|vyparnik|susic|expanzni ventil klima/ },
  { id: "steering", label: "Řízení", match: /rizen|hreben|servo|posilovac|tyce rizeni|manzeta rizeni/ },
  { id: "interior", label: "Vnitřní vybavení", match: /interier|sedad|palub|airbag|pas|volant|bezpec/ },
  { id: "electrical", label: "Elektroinstalace", match: /elektr|alternator|starter|bater|rele|pojist|snimac|senzor|spinac|konektor|regulator|magneticky/ },
  { id: "ignition", label: "Zapalování / žhavicí zařízení", match: /zapal|svick|zhavic|cevka/ },
  { id: "accessories", label: "Příslušenství", match: /prislusen|univerz|sroub|matice|spojovac|adblue|def|aditiv/ },
  { id: "service", label: "Servis", match: /servis|udrz|kapalin/ },
];

function parentForSection(label: string): { id: string; label: string } {
  const n = norm(label);
  return CATEGORY_RULES.find((r) => r.match.test(n)) || { id: "other", label: "Ostatní" };
}

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

const normalizeOem = (s: string) =>
  (s || "").toUpperCase().replace(/[\s\-._/]/g, "");

function jmToCatalogPart(it: RawJmItem): CatalogPart {
  const price = Number(it.price_with_vat) || 0;
  return {
    id: `jm-${it.oem_number}`,
    oem_number: it.oem_number,
    name: it.name || it.oem_number,
    manufacturer: it.brand || null,
    catalog_source: "jm",
    price_without_vat: it.price_without_vat || null,
    price_with_vat: price || null,
    availability: price > 0 ? it.availability || "in_stock" : "on_order",
    image_urls: it.image_urls && it.image_urls.length > 0 ? it.image_urls : (it.image ? [it.image] : null),
    category: it.category || null,
    description: it.description || null,
    is_oem: false,
    badge_label: "NÁHRADA",
    rank: 5,
    final_price: price || null,
    markup_percent: 0, // already baked-in by jm-proxy
    technical_parameters: it.technical_parameters && Object.keys(it.technical_parameters).length > 0 ? it.technical_parameters : null,
    compatible_vehicles: null,
    related_oem_number: it.related_oem_number || null,
    oe_numbers: it.oe_numbers && it.oe_numbers.length > 0 ? it.oe_numbers : null,
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
  let rawItems: RawJmItem[] = payload.items || [];
  const oemSeedsUsed: number = payload.oemSeedsUsed || 0;
  const debug = payload.debug || {};

  // EngineID flow is the exact J+M vehicle catalog. The cached OEM-seed flow often
  // contains extra J+M hits that J+M also finds by OE/crossref; merge it when cached,
  // but never trigger more API calls here.
  if (debug.flow === "engineId") {
    const { data: fallbackData } = await supabase.functions.invoke("jm-proxy", {
      body: { action: "partsForEngine", payload: { ...opts, forceOemFallback: true, cacheOnly: true } },
    });
    const fallbackPayload = (fallbackData?.data || fallbackData || {}) as any;
    const fallbackItems: RawJmItem[] = Array.isArray(fallbackPayload.items) ? fallbackPayload.items : [];
    if (fallbackItems.length > 0) {
      const seen = new Set(rawItems.map((it) => `${String(it.tecdoc_section?.id || it.category || "0")}::${normalizeOem(it.brand)}::${normalizeOem(it.oem_number)}`));
      const extra = fallbackItems.filter((it) => {
        const key = `${String(it.tecdoc_section?.id || it.category || "0")}::${normalizeOem(it.brand)}::${normalizeOem(it.oem_number)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      rawItems = [...rawItems, ...extra];
      debug.oemFallbackMerged = extra.length;
      debug.oemFallbackCachedItems = fallbackItems.length;
    }
  }


  // 1. Group J+M items by tecdoc_section.id
  const sectionMap = new Map<string, { id: string; label: string; jmItems: RawJmItem[] }>();
  for (const it of rawItems) {
    const sec = it.tecdoc_section || { id: 0, label: it.category || "Ostatní" };
    const id = String(sec.id);
    if (!sectionMap.has(id)) sectionMap.set(id, { id, label: sec.label, jmItems: [] });
    sectionMap.get(id)!.jmItems.push(it);
  }

  // 2. Collect all OEM numbers we need to look up in parts_new
  //    (related_oem_number ∪ oe_numbers ∪ the J+M oem_number itself).
  const oemNumbersToFetch = new Set<string>();
  for (const it of rawItems) {
    if (it.related_oem_number) oemNumbersToFetch.add(it.related_oem_number);
    for (const oe of it.oe_numbers || []) oemNumbersToFetch.add(oe);
  }

  let oemRows: any[] = [];
  if (oemNumbersToFetch.size > 0) {
    const list = [...oemNumbersToFetch].slice(0, 1000);
    const { data: rows } = await supabase
      .from("parts_new_public")
      .select("id, oem_number, name, manufacturer, catalog_source, price_with_vat, price_without_vat, availability, image_urls, category, description")
      .in("oem_number", list);
    oemRows = (rows || []).filter((r: any) => {
      const src = String(r.catalog_source || "").toLowerCase();
      return ["mopar", "mopar_oem", "7zap", "csv", "epc-link"].includes(src);
    });
  }
  const oemByNumber = new Map<string, any>();
  for (const row of oemRows) oemByNumber.set(normalizeOem(row.oem_number), row);

  // 2b. Vehicle-compat OEM rows (Mopar/7zap originals linked to this brand+model+engine),
  // independent of J+M crossrefs. We union across ALL nextis_vehicles with the same
  // brand/model/engine because duplicates exist (some without OEM compat rows).
  let vehicleOemRows: any[] = [];
  {
    const { data: sibVehicles } = await supabase
      .from("nextis_vehicles")
      .select("id")
      .ilike("brand", opts.brand)
      .ilike("model", opts.model)
      .ilike("engine", opts.engine || "");
    const vehicleIds = [...new Set([
      ...(opts.nextisVehicleId ? [opts.nextisVehicleId] : []),
      ...((sibVehicles || []).map((v: any) => v.id)),
    ])];
    if (vehicleIds.length > 0) {
      const { data: compatRows } = await supabase
        .from("catalog_vehicle_compatibility")
        .select("part_id")
        .in("nextis_vehicle_id", vehicleIds)
        .eq("is_oem", true)
        .limit(5000);
      const partIds = [...new Set((compatRows || []).map((r: any) => r.part_id).filter(Boolean))];
      if (partIds.length > 0) {
        // Batch the .in() query — PostgREST URL limit fails silently around ~200 UUIDs.
        const BATCH = 150;
        const allRows: any[] = [];
        for (let i = 0; i < partIds.length; i += BATCH) {
          const slice = partIds.slice(i, i + BATCH);
          const { data: rows } = await supabase
            .from("parts_new_public")
            .select("id, oem_number, name, manufacturer, catalog_source, price_with_vat, price_without_vat, availability, image_urls, category, description")
            .in("id", slice);
          if (rows) allRows.push(...rows);
        }
        vehicleOemRows = allRows.filter((r: any) => {
          const src = String(r.catalog_source || "").toLowerCase();
          return ["mopar", "mopar_oem", "7zap", "csv", "epc-link"].includes(src);
        });
      }
    }
    debug.vehicleOemRows = vehicleOemRows.length;
  }

  // 3. Build real two-level catalog: parent category → J+M/TecDoc section.
  const parentMap = new Map<string, CategoryGroup>();
  for (const [id, bucket] of sectionMap) {
    const seenOem = new Set<string>();
    const oemParts: CatalogPart[] = [];
    const jmParts: CatalogPart[] = [];

    for (const it of bucket.jmItems) {
      // Add the matching OEM (related_oem_number) once
      const relKey = it.related_oem_number ? normalizeOem(it.related_oem_number) : "";
      if (relKey && !seenOem.has(relKey)) {
        const row = oemByNumber.get(relKey);
        if (row) {
          oemParts.push(oemRowToCatalogPart(row));
          seenOem.add(relKey);
        }
      }
      jmParts.push(jmToCatalogPart(it));
    }

    // De-dup JM by oem_number
    const seenJm = new Set<string>();
    const jmDeduped: CatalogPart[] = [];
    for (const p of jmParts) {
      const k = normalizeOem(p.oem_number);
      if (!k || seenJm.has(k)) continue;
      seenJm.add(k);
      jmDeduped.push(p);
    }

    const parts = [...oemParts, ...jmDeduped];
    if (parts.length === 0) continue;

    const parent = parentForSection(bucket.label);
    if (!parentMap.has(parent.id)) parentMap.set(parent.id, { ...parent, count: 0, parts: [], children: [] });
    const parentGroup = parentMap.get(parent.id)!;
    const child: CategoryGroup = { id: `${parent.id}:${id}`, label: bucket.label, count: parts.length, parts };
    parentGroup.children!.push(child);
    parentGroup.parts.push(...parts);
    parentGroup.count += parts.length;
  }

  // 3b. Inject vehicle-compatible OEM rows that weren't already added via J+M crossref.
  // Bucket by parent category derived from the OEM row's `category` text.
  if (vehicleOemRows.length > 0) {
    // Track OEM numbers already added (per parent) to avoid duplicates with J+M-linked OEM
    const addedOemByParent = new Map<string, Set<string>>();
    for (const [pid, pg] of parentMap) {
      const set = new Set<string>();
      for (const p of pg.parts) if (p.is_oem && p.oem_number) set.add(normalizeOem(p.oem_number));
      addedOemByParent.set(pid, set);
    }

    // Group OEM rows per parent + try to slot each one into an existing tecdoc child
    // section by matching keywords from the part name to the child label.
    const oemByParentChild = new Map<string, Map<string, CatalogPart[]>>(); // parentId -> (childId|"__fallback") -> parts
    for (const row of vehicleOemRows) {
      const parent = parentForSection(row.category || "Ostatní");
      const key = normalizeOem(row.oem_number);
      const existing = addedOemByParent.get(parent.id);
      if (key && existing?.has(key)) continue;

      const oemPart = oemRowToCatalogPart(row);
      const nameNorm = norm(oemPart.name);
      let targetChildId = "__fallback";

      const parentGroup = parentMap.get(parent.id);
      if (parentGroup?.children?.length) {
        // Match against the most specific (longest) token of each child label that
        // doesn't share a prefix with the parent label (skip generic words like "brzdove").
        const parentRoot = norm(parentGroup.label).slice(0, 4);
        const candidates = parentGroup.children
          .map((c) => {
            const tokens = norm(c.label)
              .split(/\s+/)
              .filter((t) => t.length >= 5 && !t.startsWith(parentRoot));
            // Try each specific token; pick the longest that appears in the OEM name
            let bestLen = 0;
            for (const t of tokens) {
              if (nameNorm.includes(t) && t.length > bestLen) bestLen = t.length;
            }
            return bestLen > 0 ? { childId: c.id, score: bestLen } : null;
          })
          .filter(Boolean) as { childId: string; score: number }[];
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.score - a.score);
          targetChildId = candidates[0].childId;
        }
      }

      if (!oemByParentChild.has(parent.id)) oemByParentChild.set(parent.id, new Map());
      const childMap = oemByParentChild.get(parent.id)!;
      if (!childMap.has(targetChildId)) childMap.set(targetChildId, []);
      childMap.get(targetChildId)!.push(oemPart);
      if (existing && key) existing.add(key);
    }

    for (const [pid, childMap] of oemByParentChild) {
      const parentInfo = CATEGORY_RULES.find((r) => r.id === pid) || { id: pid, label: "Ostatní" };
      if (!parentMap.has(pid)) {
        parentMap.set(pid, { id: pid, label: parentInfo.label, count: 0, parts: [], children: [] });
      }
      const pg = parentMap.get(pid)!;

      for (const [childId, oemList] of childMap) {
        if (oemList.length === 0) continue;
        if (childId === "__fallback") {
          const fallbackId = `${pid}:oem-vehicle`;
          pg.children!.unshift({
            id: fallbackId,
            label: "Originální díly (Mopar)",
            count: oemList.length,
            parts: oemList,
          });
        } else {
          // Inject into existing child section
          const existingChild = pg.children!.find((c) => c.id === childId);
          if (existingChild) {
            existingChild.parts = [...oemList, ...existingChild.parts];
            existingChild.count = existingChild.parts.length;
          } else {
            pg.children!.unshift({ id: childId, label: parentInfo.label, count: oemList.length, parts: oemList });
          }
        }
        pg.parts = [...oemList, ...pg.parts];
        pg.count += oemList.length;
      }
    }
  }

  const groups = [...parentMap.values()];
  for (const group of groups) {
    group.children = (group.children || []).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "cs"));
  }

  // Sort: parent groups with most parts first, "Ostatní" at the end
  groups.sort((a, b) => {
    if (a.id === "other" && b.id !== "other") return 1;
    if (b.id === "other" && a.id !== "other") return -1;
    return b.count - a.count;
  });

  const totalParts = groups.reduce((s, g) => s + g.count, 0);
  return {
    groups,
    totalParts,
    oemSeedsUsed,
    warning: payload.warning,
    debug,
  };
}
