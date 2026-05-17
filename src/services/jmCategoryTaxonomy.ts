/**
 * J+M Section → Canonical Category Taxonomy
 *
 * Mirrors the J+M eshop main category tree. Goal: ZERO items in "Ostatní".
 * Matching is keyword-based on the section label (lowercased, diacritics-insensitive).
 *
 * Order matters: more specific parents come first. The first matching parent wins.
 */

export type CanonicalParent = {
  id: string;
  label: string;
  sort: number;
  /** substrings (lowercased, no diacritics) — match against J+M section label */
  match: string[];
};

const stripDia = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Canonical parents — mirrors the J+M eshop main categories (31+).
 * Order = matching priority. Place more specific parents BEFORE generic ones.
 */
export const CANONICAL_PARENTS: CanonicalParent[] = [
  // ─── BRZDY ────────────────────────────────────────────────────────────
  {
    id: "brakes",
    label: "Brzdové zařízení",
    sort: 10,
    match: [
      "brzd", "brake", "brems", "destick", "destič", "kotouc", "kotouč",
      "trmen", "třmen", "bubnov", "celist brzd", "čelist brzd",
      "abs", "asr", "esp", "parkovac brzd", "rucni brzd", "ruční brzd",
      "bowden", "valecek brzd", "váleček brzd", "valec brzd", "válec brzd",
      "hadick brzd", "hadice brzd", "kapalin brzd", "regulator brzd",
      "regulace jizdni", "regulace jízdní", "spinac brzdov", "spínač brzdov",
      "posilovac brzd", "posilovač brzd", "snimac otacek kola", "snímač otáček kola",
    ],
  },

  // ─── MOTOR + příslušenství motoru ─────────────────────────────────────
  {
    id: "belt-drive",
    label: "Řemenový pohon",
    sort: 15,
    match: [
      "remen", "řemen", "remenice", "řemenice", "napinak", "napínák",
      "napinaci kladk", "napínací kladk", "vodici kladk", "vodící kladk",
      "ozubeny remen", "ozubený řemen", "klin remen", "klínový řemen",
      "drazkov remen", "drážkový řemen", "poly-v",
    ],
  },
  {
    id: "ignition",
    label: "Zapalování / žhavicí zařízení",
    sort: 18,
    match: [
      "zapal", "zapalov", "svick", "svíčk", "žhav", "zhav",
      "cívk zapal", "civk zapal", "rozdelov", "rozdělov",
    ],
  },
  {
    id: "engine",
    label: "Motor",
    sort: 20,
    match: [
      "motor", "hlava motoru", "blok motoru", "vack", "vačk", "ventil",
      "rozvod", "klikov", "ojnic", "pistn", "píst", "tesneni motor",
      "těsnění motor", "olejov", "olejovy", "olejová", "olejove",
      "olejovy filtr", "olejová pumpa", "vyvazov", "vyvažov",
      "vacuum pump", "vakuove cerpad", "vakuové čerpad",
      "vyfuk ventil", "výfuk ventil", "saci ventil", "sací ventil",
      "víko hlavy", "viko hlavy", "vanovac", "vaňovac",
    ],
  },

  // ─── PALIVO ───────────────────────────────────────────────────────────
  {
    id: "fuel-pump",
    label: "Palivové čerpadlo",
    sort: 28,
    match: ["palivove cerpad", "palivové čerpad", "palivove pump", "palivová pump", "cerpadlo paliv", "čerpadlo paliv"],
  },
  {
    id: "fuel-prep",
    label: "Příprava paliva",
    sort: 29,
    match: [
      "priprava paliv", "příprava paliv", "vstrik", "vstřik", "injektor",
      "tryska vstrik", "tryska vstřik", "rampa vstrik", "rampa vstřik",
      "regulator tlak paliv", "regulátor tlaku paliv", "snimac tlaku paliv",
      "snímač tlaku paliv", "common rail", "karbur",
    ],
  },
  {
    id: "fuel",
    label: "Palivový systém",
    sort: 30,
    match: [
      "paliv", "fuel", "nadrz paliv", "nádrž paliv", "plovak", "plovák",
      "lpg", "cng", "hadice paliv", "vedeni paliv", "vedení paliv",
      "viko nadrze", "víko nádrže", "klapka paliv",
    ],
  },

  // ─── VÝFUK ────────────────────────────────────────────────────────────
  {
    id: "exhaust",
    label: "Výfuk",
    sort: 40,
    match: [
      "vyfuk", "výfuk", "exhaust", "katalyz", "lambda", "dpf", "egr",
      "tlumic vyfuku", "tlumič výfuku", "sber vyfuku", "sběr výfuku",
      "kolen vyfuk", "koleno výfuk", "filtr pevn castic", "filtr pevn částic",
    ],
  },

  // ─── CHLAZENÍ + HVAC ─────────────────────────────────────────────────
  {
    id: "cooling",
    label: "Chlazení",
    sort: 50,
    match: [
      "chlad", "chladic motoru", "chladič motoru", "ventilator chlaz",
      "ventilátor chlaz", "nadrzka chlad", "nádržka chlad", "interkul",
      "intercoolér", "intercooler", "termostat", "vodni cerpad", "vodní čerpad",
      "vodni pump", "vodní pump", "chladic oleje", "chladič oleje",
      "snimac teploty chlad", "snímač teploty chlad",
    ],
  },
  {
    id: "ac",
    label: "Klimatizace",
    sort: 60,
    match: [
      "klimat", "klima", "kompresor klima", "susic klima", "sušič klima",
      "expanzni ventil", "expanzní ventil", "vyparnik", "výparník",
      "kondenzator klima", "kondenzátor klima", "filtr kabin", "kabin filt",
      "pylov", "a/c",
    ],
  },
  {
    id: "heating",
    label: "Topení / ventilace",
    sort: 62,
    match: [
      "topen", "topení", "ventilac", "ventilátor topen", "ventilator topen",
      "radiator topen", "radiátor topen", "fukar", "fukár",
    ],
  },

  // ─── PŘEVODOVÉ ÚSTROJÍ ───────────────────────────────────────────────
  {
    id: "transmission",
    label: "Převodovka",
    sort: 70,
    match: [
      "prevodov", "převodov", "gearbox", "stupen", "stupeň", "synchron",
      "olej prevodov", "olej převodov", "razeni", "řazení", "voli razeni", "volič řazení",
      "automatick prevod", "automatická převod",
    ],
  },
  {
    id: "clutch",
    label: "Spojka / příslušenství",
    sort: 75,
    match: [
      "spojk", "lamel spojk", "presn lozisk", "přítlačný kotouč", "pritlacny kotouc",
      "vypinac spojky", "vypínací spojky", "hlavni valec spojk", "hlavní válec spojk",
      "pomocny valec spojk", "pomocný válec spojk",
    ],
  },
  {
    id: "drivetrain-wheels",
    label: "Pohon kol",
    sort: 80,
    match: ["pohon kol", "poloos", "kloub poloos", "homokinet", "manzeta pohon", "manžeta pohon"],
  },
  {
    id: "drivetrain-axle",
    label: "Pohon nápravy",
    sort: 82,
    match: ["pohon napravy", "pohon nápravy", "kardan", "diferencial", "diferenciál", "rozvodovk"],
  },

  // ─── ZAVĚŠENÍ / NÁPRAVA / KOLA ───────────────────────────────────────
  {
    id: "suspension",
    label: "Odpružení / tlumení",
    sort: 90,
    match: [
      "tlumic", "tlumič", "pruzin", "pružin", "odpruz", "odpruž",
      "vinut pruzin", "vinuté pružin", "doraz tlumic", "doraz tlumič",
      "manzeta tlumic", "manžeta tlumič", "horni uchyceni tlumic",
      "horní uchycení tlumič", "stabiliz",
    ],
  },
  {
    id: "axle",
    label: "Zavěšení nápravy / Vedení kol",
    sort: 95,
    match: [
      "naprav", "náprav", "zaveseni", "zavěšení", "rameno", "silenblok",
      "silentblok", "loziska kol", "ložiska kol", "lozisko kol", "ložisko kol",
      "naboj", "náboj", "cep kola", "čep kola", "hlavov cep", "hlavový čep",
      "kulov cep", "kulový čep", "tycka stabiliz", "tyčka stabiliz",
    ],
  },
  {
    id: "wheels",
    label: "Kola / pneu",
    sort: 110,
    match: ["kola", "pneu", "disk", "ventil pneu", "puklic", "poklic", "tpms", "snimac tlaku v pneu", "snímač tlaku v pneu"],
  },

  // ─── ŘÍZENÍ ───────────────────────────────────────────────────────────
  {
    id: "steering",
    label: "Řízení",
    sort: 100,
    match: [
      "rizeni", "řízení", "volant", "tyc rizeni", "tyč řízení",
      "servo rizen", "servočerpadl", "servocerpadl", "hrebenov rizen",
      "hřebenov řízen", "manzeta rizeni", "manžeta řízení",
    ],
  },

  // ─── FILTRY ───────────────────────────────────────────────────────────
  {
    id: "filters",
    label: "Filtry",
    sort: 120,
    match: ["filtr", "filter", "vzduchov filt", "vzduchový filt"],
  },

  // ─── ELEKTRO ──────────────────────────────────────────────────────────
  {
    id: "electrical",
    label: "Elektroinstalace",
    sort: 130,
    match: [
      "elektroin", "elektrick", "alterna", "starter", "spoust", "spoušt",
      "bateri", "akumulator", "akumulátor", "konektor", "rele", "relé",
      "pojistk", "kabel", "svazek", "ridici jednotka", "řídicí jednotka",
      "klakson", "houkac", "houkač",
    ],
  },
  {
    id: "sensors",
    label: "Snímače a čidla",
    sort: 135,
    match: ["snimac", "snímač", "cidlo", "čidlo", "sensor", "lambda sond"],
  },

  // ─── OSVĚTLENÍ ────────────────────────────────────────────────────────
  {
    id: "lighting",
    label: "Osvětlení",
    sort: 140,
    match: [
      "svetl", "světl", "osvet", "osvět", "zarov", "žárov", "lamp",
      "smerov", "směrov", "blink", "reflektor", "mlhov", "brzdov svet",
      "brzdové svět", "zadni svet", "zadní svět", "denni svicen", "denní svícen",
      "xenon", "led modul",
    ],
  },

  // ─── BEZPEČNOST ──────────────────────────────────────────────────────
  {
    id: "safety",
    label: "Bezpečnostní systém",
    sort: 150,
    match: [
      "airbag", "bezpec", "bezpeč", "pas", "pás", "srs", "asisten",
      "predepin", "předepín", "navijec pasu", "naviječ pásu",
    ],
  },

  // ─── STĚRAČE / ČIŠTĚNÍ SKEL ──────────────────────────────────────────
  {
    id: "wipers",
    label: "Stěrače",
    sort: 160,
    match: ["sterac", "stěrač", "lista stera", "lišta stěra", "rameno stera", "rameno stěra", "motor stera", "motor stěra"],
  },
  {
    id: "wash",
    label: "Čištění skel",
    sort: 162,
    match: [
      "ostrik", "ostřik", "cist skel", "čišt skel", "tryska ostrik",
      "tryska ostřik", "cerpadlo ostrik", "čerpadlo ostřik", "nadrzka ostrik",
      "nádržka ostřik", "hadice ostrik", "hadice ostřik",
    ],
  },

  // ─── KAROSERIE / DVEŘE / OKNA ────────────────────────────────────────
  {
    id: "body",
    label: "Karosérie",
    sort: 170,
    match: [
      "karos", "karoser", "kapot", "blatnik", "blatník", "naraznik", "nárazník",
      "mrizk", "mřížk", "lem blatnik", "lem blatník", "zrcatk", "zrcátk",
      "spoiler", "prah", "obklad karos", "obklad bocnice", "obklad bočnice",
      "maska chladi", "maska chladič",
    ],
  },
  {
    id: "lock",
    label: "Zamykací zařízení",
    sort: 172,
    match: ["zamyk", "zamek", "zámek", "centralni zamyk", "centrální zamyk", "klik dveri", "klika dveří", "vlozka zamku", "vložka zámku"],
  },
  {
    id: "doors",
    label: "Dveře a okna",
    sort: 175,
    match: ["dvere", "dveře", "vzpera", "vzpěra", "okno", "sklo", "stahovani okna", "stahování okna", "stahovacka", "stahovačka"],
  },

  // ─── INTERIÉR / KOMFORT ──────────────────────────────────────────────
  {
    id: "interior",
    label: "Vnitřní vybavení",
    sort: 180,
    match: ["vnitrni vyb", "vnitřní vyb", "interier", "interiér", "sedadl", "palubn", "obklad dveri", "obklad dveří", "stinitko", "stínítko"],
  },
  {
    id: "comfort",
    label: "Komfortní systémy",
    sort: 185,
    match: ["komfort", "tempomat", "parkovac sensor", "parkovací senzor", "park asisten", "vyhrev sedadel", "vyhřev sedadel"],
  },
  {
    id: "info",
    label: "Informační / komunikační systém",
    sort: 190,
    match: ["informacni", "informační", "komunikac", "komunikač", "radio", "navigac", "antena", "anténa", "reproduktor"],
  },

  // ─── PŘÍSLUŠENSTVÍ / SERVIS ──────────────────────────────────────────
  {
    id: "towing",
    label: "Příslušenství",
    sort: 200,
    match: ["tazn", "tažn", "prislu", "příslu", "nosic", "nosič", "kufr stresn", "kufr střešn"],
  },
  {
    id: "service",
    label: "Díly pro servis / kontrolu / údržbu",
    sort: 220,
    match: ["udrz", "údrž", "servis", "kontrol", "naradi", "nářadí", "specialni naradi", "speciální nářadí", "diagnost"],
  },
  {
    id: "fluids",
    label: "Náplně a kapaliny",
    sort: 230,
    match: ["olej", "kapalin", "naplne", "náplně", "mazac", "mazací", "fluid", "nemrznouc", "nemrznouc směs", "destilovan vod", "destilovaná vod"],
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
