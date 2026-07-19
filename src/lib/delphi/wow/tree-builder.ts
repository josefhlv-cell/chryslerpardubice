import type { WowContentRecord } from "./full-content";
import { isHtmlRecord, isImageRecord } from "./full-content";

/** Two-level tree: Category > System > documents[]. */
export interface WowTreeSystemNode {
  system: string;
  documents: WowContentRecord[];
}
export interface WowTreeCategoryNode {
  category: string;
  total: number;
  systems: WowTreeSystemNode[];
}

const SERVICE_TERMS = [
  "service","servis","reset","bleed","odvzdušn","install","adaptation","adaptace",
  "kalibrace","calibr","learn","teach","aktivac","activation","dpf","egr","injector",
  "vstřik","pumpinst","valve","aktuator",
];
const DIAGNOSIS_TERMS = [
  "diag","selftest","self-test","fauld","fault","dtc","erase","openadp",
  "protocol","measure","ground","kabel","chyb","paralel","short",
];
const CONNECTOR_TERMS = ["obd","connector","conector","dlc","pinout","socket","zásuvka","zasuvka","port"];

function docText(rec: WowContentRecord): string {
  return `${rec.title} ${rec.fileName} ${rec.tags.join(" ")} ${rec.excerpt}`.toLowerCase();
}

/** Deterministic category derivation from the document itself (no vehicle inputs). */
export function categoryOf(rec: WowContentRecord): string {
  const t = docText(rec);
  if (isImageRecord(rec) && !isHtmlRecord(rec)) {
    if (CONNECTOR_TERMS.some((k) => t.includes(k))) return "OBD konektor";
    return "Obrázky a média";
  }
  if (rec.kind === "diagnosis") return "Diagnostické postupy";
  if (CONNECTOR_TERMS.some((k) => t.includes(k))) return "OBD konektor";
  if (DIAGNOSIS_TERMS.some((k) => t.includes(k))) return "Diagnostické postupy";
  if (SERVICE_TERMS.some((k) => t.includes(k))) return "Servisní postupy";
  return "Technická nápověda";
}

const SYSTEM_HINTS: Array<[string, string]> = [
  ["abs", "ABS/ESP"],
  ["esp", "ABS/ESP"],
  ["airbag", "Airbag"],
  ["srs", "Airbag"],
  ["egr", "Motor – EGR"],
  ["dpf", "Motor – DPF"],
  ["inject", "Motor – vstřikování"],
  ["vstřik", "Motor – vstřikování"],
  ["pump", "Motor – palivový systém"],
  ["engine", "Motor"],
  ["motor", "Motor"],
  ["gear", "Převodovka"],
  ["trans", "Převodovka"],
  ["climat", "Klimatizace"],
  ["klima", "Klimatizace"],
  ["ac_", "Klimatizace"],
  ["radio", "Infotainment"],
  ["nav", "Navigace"],
  ["park", "Parkovací asistent"],
  ["door", "Elektronika dveří"],
  ["light", "Osvětlení"],
  ["immo", "Imobilizér"],
  ["instrument", "Přístrojová deska"],
  ["tpms", "Kontrola tlaku pneumatik"],
  ["steer", "Řízení"],
];

export function systemOf(rec: WowContentRecord): string {
  const t = docText(rec);
  for (const [needle, label] of SYSTEM_HINTS) {
    if (t.includes(needle)) return label;
  }
  // fallback to first meaningful tag
  const tag = (rec.tags[0] || "").trim();
  return tag ? tag[0].toUpperCase() + tag.slice(1) : "Obecné";
}

const CATEGORY_ORDER = [
  "Servisní postupy",
  "Diagnostické postupy",
  "Technická nápověda",
  "OBD konektor",
  "Obrázky a média",
];

/**
 * Build a Category > System > Document tree from an already-filtered set of
 * records. Only categories/systems with at least one document appear.
 */
export function buildTree(records: WowContentRecord[]): WowTreeCategoryNode[] {
  const byCat = new Map<string, Map<string, WowContentRecord[]>>();
  for (const rec of records) {
    const c = categoryOf(rec);
    const s = systemOf(rec);
    let sys = byCat.get(c);
    if (!sys) { sys = new Map(); byCat.set(c, sys); }
    let list = sys.get(s);
    if (!list) { list = []; sys.set(s, list); }
    list.push(rec);
  }

  const nodes: WowTreeCategoryNode[] = [];
  for (const [category, sysMap] of byCat.entries()) {
    const systems: WowTreeSystemNode[] = [];
    let total = 0;
    for (const [system, docs] of sysMap.entries()) {
      docs.sort((a, b) => a.title.localeCompare(b.title, "cs"));
      total += docs.length;
      systems.push({ system, documents: docs });
    }
    systems.sort((a, b) => a.system.localeCompare(b.system, "cs"));
    nodes.push({ category, total, systems });
  }

  nodes.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.category.localeCompare(b.category, "cs");
  });
  return nodes;
}
