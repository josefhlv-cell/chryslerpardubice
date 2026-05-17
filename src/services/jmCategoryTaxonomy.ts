/**
 * J+M Section → Canonical Category Taxonomy
 *
 * J+M / Nextis API returns a FLAT list of TecDoc sections (gen_art_name).
 * This module groups those sections into a clean 2-level hierarchy
 * (Parent → Section) for display in the catalog UI.
 *
 * Matching is keyword-based on the section label (lowercased, diacritics-insensitive).
 * Sections that don't match any rule fall under "Ostatní".
 */

export type CanonicalParent = {
  id: string;
  label: string;
  /** order in the UI (lower = higher) */
  sort: number;
  /** substrings (lowercased, no diacritics) — match against J+M section label */
  match: string[];
};

const stripDia = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Canonical parents — mirrors typical J+M eshop hierarchy.
 * Order is intentional: more specific parents come first so e.g.
 * "Brzdový snímač" goes to "Brzdové zařízení" before "Snímače".
 */
export const CANONICAL_PARENTS: CanonicalParent[] = [
  {
    id: "brakes",
    label: "Brzdové zařízení",
    sort: 10,
    match: [
      "brzd", "destick", "destič", "kotouc", "kotouč", "trmen", "třmen",
      "bubnov", "abs", "asr", "parkovac brzd", "ruční brzd", "rucni brzd",
      "bowden", "valecek brzd", "váleček brzd", "hadick brzd", "kapalin brzd",
      "regulace jizdni", "regulace jízdní", "saci pump", "sací pump",
      "spinac brzdov", "spínač brzdov",
    ],
  },
  {
    id: "engine",
    label: "Motor",
    sort: 20,
    match: [
      "motor", "hlava motoru", "vack", "vačk", "ventil", "rozvod", "klikov",
      "ojnic", "pistn", "píst", "termostat", "vodni pump", "vodní pump",
      "olejov", "remenice", "řemenice", "remen", "řemen", "napinak",
      "napínák", "kliny remen", "klínový řemen", "tesneni motor", "těsnění motor",
      "svick", "svíčk", "zapal", "žhav",
    ],
  },
  {
    id: "fuel",
    label: "Palivový systém",
    sort: 30,
    match: [
      "paliv", "vstrik", "vstřik", "plovak", "plovák", "karbur", "lpg",
      "trysk", "injektor", "rampa", "regulator tlak paliv",
    ],
  },
  {
    id: "exhaust",
    label: "Výfuk",
    sort: 40,
    match: ["vyfuk", "výfuk", "katalyz", "lambda", "dpf", "egr", "tlumic vyfuku", "tlumič výfuku"],
  },
  {
    id: "cooling",
    label: "Chlazení",
    sort: 50,
    match: [
      "chlad", "chladic motoru", "chladič motoru", "ventilator chlaz",
      "ventilátor chlaz", "nadrzka chlad", "nádržka chlad", "interkul",
      "intercoolér", "intercooler",
    ],
  },
  {
    id: "hvac",
    label: "Klimatizace a topení",
    sort: 60,
    match: [
      "klimat", "klima", "topen", "ventilac", "kompresor klima",
      "susic klima", "sušič klima", "expanzni ventil", "expanzní ventil",
      "vyparnik", "výparník", "kondenzator klima", "kondenzátor klima",
      "vnitrni filtr", "vnitřní filtr", "kabin filt", "pylov",
    ],
  },
  {
    id: "transmission",
    label: "Převodovka",
    sort: 70,
    match: [
      "prevodov", "převodov", "gearbox", "stupen", "stupeň", "synchron",
      "olej prevodov", "olej převodov",
    ],
  },
  {
    id: "clutch",
    label: "Spojka",
    sort: 75,
    match: ["spojk", "lamel", "presn lozisk", "přesné ložisk", "vypinac spojky", "vypínací spojky"],
  },
  {
    id: "drivetrain",
    label: "Pohon",
    sort: 80,
    match: [
      "pohon kol", "pohon napravy", "pohon nápravy", "poloosa", "kardan",
      "diferencial", "diferenciál", "homokinet", "manzeta pohonu", "manžeta pohonu",
    ],
  },
  {
    id: "suspension",
    label: "Odpružení a tlumení",
    sort: 90,
    match: [
      "tlumic", "tlumič", "pruzin", "pružin", "odpruz", "odpruž",
      "zaveseni", "zavěšení", "rameno napravy", "rameno nápravy", "silenblok",
      "hlavov cep", "hlavový čep", "hlavovy cep",
    ],
  },
  {
    id: "axle",
    label: "Náprava a vedení kol",
    sort: 95,
    match: [
      "naprav", "náprav", "loziska kol", "ložiska kol", "lozisko kol",
      "ložisko kol", "naboj", "náboj", "cep kola", "čep kola",
    ],
  },
  {
    id: "steering",
    label: "Řízení",
    sort: 100,
    match: [
      "rizeni", "řízení", "volant", "tyc rizeni", "tyč řízení",
      "servo rizen", "servočerpadl", "kulov cep rizen", "kulový čep řízen",
    ],
  },
  {
    id: "wheels",
    label: "Kola a pneumatiky",
    sort: 110,
    match: ["kola", "pneu", "disk", "ventil pneu", "puklic", "poklic"],
  },
  {
    id: "filters",
    label: "Filtry",
    sort: 120,
    match: ["filtr", "filter"],
  },
  {
    id: "electrical",
    label: "Elektroinstalace",
    sort: 130,
    match: [
      "elektroin", "alterna", "starter", "spoust", "spoušt",
      "bateri", "konektor", "rele", "relé", "pojistk", "kabel",
      "ridici jednotka", "řídicí jednotka",
    ],
  },
  {
    id: "sensors",
    label: "Snímače a čidla",
    sort: 135,
    match: ["snimac", "snímač", "cidlo", "čidlo", "sensor"],
  },
  {
    id: "lighting",
    label: "Osvětlení",
    sort: 140,
    match: ["svetl", "světl", "osvet", "osvět", "zarov", "žárov", "lamp", "smerov", "směrov", "blink"],
  },
  {
    id: "safety",
    label: "Bezpečnostní systém",
    sort: 150,
    match: ["airbag", "bezpec syst", "bezpeč syst", "pas bezpec", "pás bezpeč", "srs", "asisten"],
  },
  {
    id: "wipers",
    label: "Stěrače a ostřikovače",
    sort: 160,
    match: ["sterac", "stěrač", "ostrik", "ostřik", "cist skel", "čišt skel", "lista sterace", "lišta stěrače"],
  },
  {
    id: "body",
    label: "Karosérie",
    sort: 170,
    match: [
      "karos", "kapot", "blatnik", "blatník", "naraznik", "nárazník",
      "mrizk", "mřížk", "lem blatnik", "lem blatník", "zrcatk", "zrcátk",
      "zamek", "zámek", "klik", "klap palivov", "klapka paliv",
      "spoiler", "prah", "obklad",
    ],
  },
  {
    id: "doors",
    label: "Dveře a okna",
    sort: 175,
    match: ["dvere", "dveře", "vzpera", "vzpěra", "okno", "sklo", "stahovani okna", "stahování okna"],
  },
  {
    id: "interior",
    label: "Vnitřní vybavení",
    sort: 180,
    match: ["vnitrni vyb", "vnitřní vyb", "interier", "interiér", "sedadl", "palubn", "obklad dveri", "obklad dveří"],
  },
  {
    id: "comfort",
    label: "Komfortní systémy",
    sort: 185,
    match: ["komfort", "centralni zamyk", "centrální zamyk", "tempomat", "parkovac sensor"],
  },
  {
    id: "info",
    label: "Informační / komunikační systém",
    sort: 190,
    match: ["informacni", "informační", "komunikac", "komunikač", "radio", "navigac", "antena", "anténa"],
  },
  {
    id: "towing",
    label: "Tažné zařízení",
    sort: 200,
    match: ["tazn", "tažn"],
  },
  {
    id: "tools",
    label: "Speciální nářadí",
    sort: 210,
    match: ["specialni naradi", "speciální nářadí", "naradi", "nářadí"],
  },
  {
    id: "maintenance",
    label: "Údržba a servis",
    sort: 220,
    match: ["udrz", "údrž", "servis", "kontrol"],
  },
  {
    id: "fluids",
    label: "Náplně a kapaliny",
    sort: 230,
    match: ["olej", "kapalin", "naplne", "náplně", "mazac", "fluid"],
  },
];

const PARENTS_PREP = CANONICAL_PARENTS.map((p) => ({
  ...p,
  _match: p.match.map(stripDia),
}));

const OTHERS: CanonicalParent = {
  id: "other",
  label: "Ostatní",
  sort: 9999,
  match: [],
};

/**
 * Map a single J+M section label (gen_art_name) to a canonical parent.
 * Returns "other" if nothing matches.
 */
export function mapSectionToParent(sectionLabel: string): CanonicalParent {
  const norm = stripDia(String(sectionLabel || ""));
  if (!norm) return OTHERS;
  for (const p of PARENTS_PREP) {
    for (const kw of p._match) {
      if (norm.includes(kw)) {
        return CANONICAL_PARENTS.find((x) => x.id === p.id)!;
      }
    }
  }
  return OTHERS;
}
