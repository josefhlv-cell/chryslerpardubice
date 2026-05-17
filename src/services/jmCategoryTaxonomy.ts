/**
 * J+M product taxonomy
 *
 * The Nextis/J+M endpoint returns generic article names (`gen_art_name`) as a flat
 * list. The J+M eshop presents those articles inside a fixed TecDoc-style tree.
 * This file rebuilds that tree deterministically: Main category → J+M subcategory
 * → returned J+M section. The fallback is deliberately NOT named "Ostatní", so the
 * catalog never creates the broken catch-all bucket the customer complained about.
 */

export type CanonicalParent = {
  id: string;
  label: string;
  sort: number;
  match: string[];
};

export type JmCategoryNode = CanonicalParent & {
  children?: JmCategoryNode[];
};

export type JmCategoryPathNode = {
  id: string;
  label: string;
  sort: number;
};

const stripDia = (s: string) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const n = (id: string, label: string, sort: number, match: string[] = [], children?: JmCategoryNode[]): JmCategoryNode => ({
  id,
  label,
  sort,
  match,
  children,
});

/**
 * Main categories are kept in the same user-facing order as the J+M eshop tree.
 * Children are broad J+M/TecDoc subgroups; the real API section is inserted below
 * the best matching subgroup so the UI gets true subcategories instead of a flat list.
 */
export const JM_CATEGORY_TREE: JmCategoryNode[] = [
  n("safety", "Bezpečnostní systém", 10, ["bezpec", "airbag", "srs", "pas", "predepin", "navijec pasu"], [
    n("safety-airbags", "Airbagy", 10, ["airbag", "srs"]),
    n("safety-belts", "Bezpečnostní pásy", 20, ["bezpecnostni pas", "bezpec pas", "pas", "predepin", "navijec pasu"]),
  ]),
  n("brakes", "Brzdové zařízení", 20, ["brzd", "brake", "abs", "esp", "asr"], [
    n("brakes-disc", "Kotoučové brzdy", 10, ["brzdove destick", "brzdovy kotouc", "brzdove kotouce", "brzdovy trmen", "trmen", "kotouc", "destick", "caliper", "rotor"]),
    n("brakes-drum", "Bubnové brzdy", 20, ["buben", "bubnov", "celist", "pakna", "brake shoe"]),
    n("brakes-hydraulic", "Hydraulika brzd", 30, ["brzdova hadic", "brzdova trub", "brzdovy valec", "hlavni brzdovy", "posilovac brzd", "regulator brzd"]),
    n("brakes-parking", "Parkovací brzda", 40, ["parkovac brzd", "rucni brzd", "lanovod", "bowden"]),
    n("brakes-abs", "ABS / regulace jízdní dynamiky", 50, ["abs", "esp", "asr", "regulace jizdni", "snimac otacek kola"]),
  ]),
  n("screen-cleaning", "Čištění skel", 30, ["ostrik", "cisteni skel", "sterac", "stiraci"], [
    n("screen-wipers", "Stěrače", 10, ["sterac", "stiraci lista", "lista sterace", "rameno sterace", "sterac gumicka"]),
    n("screen-washer", "Ostřikovače", 20, ["ostrik", "tryska ostrik", "cerpadlo ostrik", "nadrzka ostrik", "hadice ostrik"]),
  ]),
  n("service-maintenance", "Díly pro servis / kontrolu / údržbu", 40, ["servis", "kontrol", "udrz", "naradi", "sada", "oprav", "spojovac"], [
    n("service-kits", "Servisní sady", 10, ["servisni sada", "sada prislusenstvi", "montazni sada", "opravna sada"]),
    n("service-tools", "Nářadí", 20, ["naradi", "diagnost"]),
    n("service-universal", "Univerzální / montážní díly", 90, ["univerzal", "spojovac", "sroub", "matice", "prichytka", "svorka"]),
  ]),
  n("electrical", "Elektroinstalace", 50, ["elektr", "alternator", "starter", "bateri", "akumulator", "rele", "pojist", "kabel", "svazek"], [
    n("electrical-alternator", "Alternátory", 10, ["alternator", "regulator alternator", "remenice alternator"]),
    n("electrical-starter", "Startéry", 20, ["starter", "spoustec"]),
    n("electrical-battery", "Baterie", 30, ["baterie", "akumulator"]),
    n("electrical-switches", "Relé / pojistky / spínače", 40, ["rele", "pojist", "spinac", "prepinac"]),
    n("electrical-wiring", "Kabeláž / konektory", 50, ["kabel", "svazek", "konektor", "zasuvka"]),
    n("electrical-control", "Řídicí jednotky", 60, ["ridici jednot", "modul", "ecu"]),
  ]),
  n("filters", "Filtry", 60, ["filtr", "filter"], [
    n("filters-oil", "Olejové filtry", 10, ["olejovy filtr", "filtr oleje", "oil filter"]),
    n("filters-air", "Vzduchové filtry", 20, ["vzduchovy filtr", "air filter"]),
    n("filters-cabin", "Kabinové / pylové filtry", 30, ["kabinovy filtr", "pylovy filtr", "filtr kabin", "filtr vnitrniho prostoru"]),
    n("filters-fuel", "Palivové filtry", 40, ["palivovy filtr", "fuel filter"]),
    n("filters-gearbox", "Filtry převodovky", 50, ["filtr prevodov", "hydraulicky filtr"]),
  ]),
  n("cooling", "Chlazení", 70, ["chlad", "termostat", "vodni cerpad", "intercool", "ventilator chlad"], [
    n("cooling-radiator", "Chladiče vody", 10, ["chladic motoru", "vodni chladic", "radiator"]),
    n("cooling-oil", "Chladiče oleje", 20, ["chladic oleje", "olejovy chladic"]),
    n("cooling-thermostat", "Termostaty", 30, ["termostat"]),
    n("cooling-pump", "Vodní čerpadla", 40, ["vodni cerpad", "vodni pump"]),
    n("cooling-fan", "Ventilátory chlazení", 50, ["ventilator chlad", "sahara"]),
    n("cooling-hoses", "Hadice / nádržky chlazení", 60, ["hadice chlad", "nadrzka chlad", "expanzni nadob"]),
    n("cooling-intercooler", "Mezichladiče", 70, ["intercool", "interkul"]),
  ]),
  n("body", "Karosérie", 80, ["karos", "kapot", "blatnik", "naraznik", "mrizk", "maska", "zrcatk", "dvere", "okno", "sklo"], [
    n("body-bumpers", "Nárazníky / výztuhy", 10, ["naraznik", "vyztuha narazniku"]),
    n("body-front", "Přední část / maska", 20, ["mrizka chladice", "maska chladice", "predni stena"]),
    n("body-panels", "Kapoty / blatníky / prahy", 30, ["kapot", "blatnik", "lem blatniku", "prah"]),
    n("body-mirrors", "Zrcátka", 40, ["zrcatk"]),
    n("body-doors", "Dveře / víka", 50, ["dvere", "zaves dveri", "vzpera zad dveri", "viko kufru", "kapota plynov"]),
    n("body-glass", "Skla / stahování oken", 60, ["sklo", "okno", "stahovani okna", "stahovacka"]),
  ]),
  n("ac", "Klimatizace", 90, ["klimat", "klima", "a/c", "kompresor", "kondenzator", "vyparnik", "expanzni ventil"], [
    n("ac-compressor", "Kompresory klimatizace", 10, ["kompresor klimat", "kompresor klima"]),
    n("ac-condenser", "Kondenzátory", 20, ["kondenzator"]),
    n("ac-dryer", "Vysoušeče / sušiče", 30, ["vysousec", "susic"]),
    n("ac-expansion", "Expanzní ventily", 40, ["expanzni ventil"]),
    n("ac-evaporator", "Výparníky", 50, ["vyparnik"]),
    n("ac-hoses", "Hadice klimatizace", 60, ["hadice klimat", "vedeni klimat"]),
  ]),
  n("comfort", "Komfortní systémy", 100, ["komfort", "tempomat", "parkovac", "vyhrev", "elektricke ovladani"], [
    n("comfort-parking", "Parkovací asistenty", 10, ["parkovac", "pdc"]),
    n("comfort-cruise", "Tempomat", 20, ["tempomat"]),
    n("comfort-heated", "Vyhřívání", 30, ["vyhrev", "vyhrivani"]),
  ]),
  n("wheels", "Kola / pneumatiky", 110, ["kolo", "kola", "pneu", "disk", "tpms", "sroub kola"], [
    n("wheels-tyres", "Pneumatiky", 10, ["pneu", "pneumat"]),
    n("wheels-rims", "Disky kol", 20, ["disk kola", "rafek"]),
    n("wheels-tpms", "TPMS / ventilky", 30, ["tpms", "snimac tlaku v pneu", "ventil pneu"]),
    n("wheels-fasteners", "Šrouby / matice kol", 40, ["sroub kola", "matice kola"]),
  ]),
  n("engine", "Motor", 120, ["motor", "hlava valce", "tesneni", "vack", "klik", "pist", "ventil", "olejova vana", "ulozeni motoru"], [
    n("engine-gaskets", "Těsnění", 10, ["tesneni", "sada tesneni", "tesnici krouzek", "tesneni hlavy valce", "tesneni kryt hlavy", "tesneni vika", "tesneni sani"]),
    n("engine-head", "Hlava válců / ventilový rozvod", 20, ["hlava valce", "vackovy hridel", "ventil", "hydrostel", "vahadlo"]),
    n("engine-crank", "Klikový mechanismus", 30, ["klikovy hridel", "ojnice", "pist", "lozisko klik"]),
    n("engine-lubrication", "Mazání motoru", 40, ["olejova vana", "olejove cerpadlo", "merka oleje", "vypustny sroub oleje"]),
    n("engine-mounts", "Uložení motoru", 50, ["ulozeni motoru", "zaveseni motoru", "silentblok motoru", "drzak motoru"]),
    n("engine-intake", "Sání motoru", 60, ["sani", "skrtici klapka", "saci potrubi"]),
    n("engine-timing", "Rozvody", 70, ["rozvod", "rozvodovy retez", "rozvodovy remen"]),
  ]),
  n("suspension-damping", "Odpružení / tlumení", 130, ["tlumic", "pruzin", "odpruz", "doraz tlumic", "ulozeni tlumic"], [
    n("damping-shocks", "Tlumiče", 10, ["tlumic", "tlumice"]),
    n("damping-springs", "Pružiny", 20, ["pruzin"]),
    n("damping-mounts", "Uložení / dorazy tlumičů", 30, ["ulozeni tlumic", "doraz tlumic", "manzeta tlumic"]),
  ]),
  n("fuel-pump", "Palivové čerpadlo", 140, ["palivove cerpad", "cerpadlo paliv", "palivova pump"], [
    n("fuel-pump-electric", "Elektrická palivová čerpadla", 10, ["palivove cerpad", "cerpadlo paliv", "palivova pump"]),
    n("fuel-pump-module", "Moduly palivového čerpadla", 20, ["modul palivoveho cerpadla"]),
  ]),
  n("fuel-system", "Palivový systém", 150, ["paliv", "nadrz", "plovak", "lpg", "cng"], [
    n("fuel-tank", "Nádrž / víčko / klapka", 10, ["palivova nadrz", "viko nadrze", "klapka palivove nadrze", "hrdlo nadrze"]),
    n("fuel-lines", "Palivové vedení", 20, ["palivove vedeni", "palivova hadice", "potrubi paliva"]),
    n("fuel-pressure", "Regulace tlaku paliva", 30, ["regulator tlaku paliva", "tlak paliva"]),
  ]),
  n("fuel-preparation", "Příprava paliva", 160, ["vstrik", "injektor", "tryska", "karbur", "common rail", "palivova rampa"], [
    n("fuel-injectors", "Vstřikovače / trysky", 10, ["vstrik", "vstrikovac", "injektor", "tryska"]),
    n("fuel-rail", "Vstřikovací rampa", 20, ["palivova rampa", "vstrikovaci rampa", "common rail"]),
    n("fuel-carburettor", "Karburátor", 30, ["karbur"]),
  ]),
  n("wheel-drive", "Pohon kol", 170, ["poloos", "hnaci hridel", "homokinet", "kloub poloosy", "manzeta pohon"], [
    n("wheel-drive-shafts", "Hnací hřídele / poloosy", 10, ["hnaci hridel", "poloos"]),
    n("wheel-drive-joints", "Klouby / manžety poloos", 20, ["kloub poloosy", "homokinet", "manzeta pohon"]),
  ]),
  n("axle-drive", "Pohon nápravy", 180, ["kardan", "diferencial", "rozvodovka", "pohon napravy"], [
    n("axle-drive-diff", "Diferenciál", 10, ["diferencial"]),
    n("axle-drive-cardans", "Kardany", 20, ["kardan"]),
    n("axle-drive-transfer", "Rozvodovka", 30, ["rozvodovka"]),
  ]),
  n("transmission", "Převodovka", 190, ["prevodov", "razeni", "volic", "automat", "synchron", "atf", "gearbox"], [
    n("transmission-automatic", "Automatická převodovka", 10, ["automaticka prevodovka", "automat", "atf"]),
    n("transmission-manual", "Manuální převodovka", 20, ["manualni prevodovka", "synchron", "spojka radici"]),
    n("transmission-shift", "Řazení / volič", 30, ["razeni", "volic", "tahlo razeni"]),
    n("transmission-oil", "Olej převodovky", 40, ["olej prevodovky", "prevodovy olej"]),
  ]),
  n("accessories", "Příslušenství", 200, ["prislu", "tazn", "nosic", "autokoberec", "tazne lano"], [
    n("accessories-towing", "Tažné zařízení", 10, ["tazn", "tazne lano"]),
    n("accessories-carrier", "Nosiče / střešní systémy", 20, ["nosic", "stresni"]),
    n("accessories-interior", "Doplňky interiéru", 30, ["autokoberec", "koberec"]),
  ]),
  n("belt-drive", "Řemenový pohon", 210, ["remen", "remenice", "napinak", "kladk", "poly-v"], [
    n("belt-v", "Drážkové / klínové řemeny", 10, ["drazkovy remen", "klinovy remen", "remen", "poly-v"]),
    n("belt-tensioners", "Napínáky a kladky", 20, ["napinak remene", "napinaci kladka", "vodici kladka", "kladka"]),
    n("belt-pulleys", "Řemenice", 30, ["remenice"]),
  ]),
  n("steering", "Řízení", 220, ["rizeni", "ridici mechanismus", "tahlo rizeni", "manzeta rizeni", "volant", "servo"], [
    n("steering-rack", "Řídicí mechanismus", 10, ["ridici mechanismus", "hrebenove rizeni", "prevodka rizeni"]),
    n("steering-mounts", "Uložení řízení", 20, ["ulozeni ridici mechanismus", "ulozeni, ridici mechanismus", "ulozeni rizeni"]),
    n("steering-rods", "Táhla / čepy řízení", 30, ["tahlo rizeni", "cep rizeni", "tyc rizeni"]),
    n("steering-boots", "Manžety řízení", 40, ["manzeta rizeni"]),
    n("steering-servo", "Servořízení", 50, ["servo", "servocerpadlo"]),
    n("steering-wheel", "Volant", 60, ["volant"]),
  ]),
  n("clutch", "Spojka", 230, ["spojk", "setrvacnik", "vypinaci lozisko", "pritlacny talir"], [
    n("clutch-kits", "Spojkové sady", 10, ["spojkova sada", "sada spojky"]),
    n("clutch-disc", "Spojkový kotouč / přítlačný talíř", 20, ["spojkovy kotouc", "pritlacny talir", "pritlacny kotouc"]),
    n("clutch-bearing", "Vypínací ložiska", 30, ["vypinaci lozisko", "vysouseci lozisko"]),
    n("clutch-cylinders", "Spojkové válce", 40, ["spojkovy valec", "hlavni spojkovy valec", "pomocny spojkovy valec"]),
    n("clutch-flywheel", "Setrvačníky", 50, ["setrvacnik"]),
  ]),
  n("sensors", "Snímače", 240, ["snimac", "cidlo", "sensor", "sonda"], [
    n("sensors-engine", "Snímače motoru", 10, ["snimac vackoveho", "snimac klikoveho", "snimac tlaku oleje", "snimac teploty", "cidlo teploty"]),
    n("sensors-exhaust", "Lambda sondy", 20, ["lambda", "sonda"]),
    n("sensors-speed", "Snímače otáček / rychlosti", 30, ["snimac otacek", "snimac rychlosti"]),
    n("sensors-parking", "Parkovací snímače", 40, ["parkovaci snimac", "pdc"]),
  ]),
  n("heating", "Topení / ventilace", 250, ["topen", "ventilac", "fukar", "ventilator topeni", "radiator topeni"], [
    n("heating-heat-exchanger", "Radiátory topení", 10, ["radiator topeni", "vymenik topeni"]),
    n("heating-blower", "Ventilátory / odpory topení", 20, ["ventilator topeni", "fukar", "odpor topeni"]),
    n("heating-controls", "Ovládání topení", 30, ["ovladani topeni", "klapka topeni"]),
  ]),
  n("interior", "Vnitřní vybavení", 260, ["interier", "vnitrni", "sedadl", "palub", "madlo", "stinitko"], [
    n("interior-dashboard", "Palubní deska / ovladače", 10, ["palub", "ovladac", "spinac palub"]),
    n("interior-seats", "Sedadla", 20, ["sedadl"]),
    n("interior-trim", "Obložení interiéru", 30, ["oblozeni", "madlo", "stinitko", "vnitrni vybaveni"]),
  ]),
  n("exhaust", "Výfuk", 270, ["vyfuk", "katalyz", "lambda", "dpf", "egr"], [
    n("exhaust-pipes", "Výfukové potrubí", 10, ["vyfukove potrubi", "trubka vyfuku", "koleno vyfuku"]),
    n("exhaust-silencer", "Tlumiče výfuku", 20, ["tlumic vyfuku"]),
    n("exhaust-catalyst", "Katalyzátory / DPF", 30, ["katalyz", "dpf", "filtr pevnych castic"]),
    n("exhaust-gaskets", "Těsnění výfuku", 40, ["tesneni vyfuku", "tesneni vyfuk"]),
    n("exhaust-egr", "EGR", 50, ["egr"]),
  ]),
  n("locks", "Zamykací zařízení", 280, ["zamek", "zamyk", "centralni zamyk", "vlozka zamku", "klika dveri"], [
    n("locks-door", "Zámky dveří", 10, ["zamek dveri", "klika dveri"]),
    n("locks-central", "Centrální zamykání", 20, ["centralni zamyk"]),
    n("locks-cylinders", "Vložky zámků / klíče", 30, ["vlozka zamku", "klic"]),
  ]),
  n("ignition", "Zapalování / žhavicí zařízení", 290, ["zapal", "svick", "zhav", "civk", "rozdelovac"], [
    n("ignition-spark", "Zapalovací svíčky", 10, ["zapalovaci svicka", "svicka zapal"]),
    n("ignition-coils", "Zapalovací cívky", 20, ["zapalovaci civka", "civka zapal"]),
    n("ignition-glow", "Žhavicí svíčky", 30, ["zhavici svicka", "zhav"]),
    n("ignition-distributor", "Rozdělovač / kabely", 40, ["rozdelovac", "zapalovaci kabel"]),
  ]),
  n("axle-suspension", "Zavěšení nápravy / Vedení kol", 300, ["naprav", "zaveseni", "rameno", "silenblok", "silentblok", "pouzdro", "ulozeni", "naboj", "lozisko kola", "cep kola", "stabiliz"], [
    n("axle-arms", "Ramena / vedení kol", 10, ["rameno", "vodici rameno", "podelne rameno", "pricne rameno"]),
    n("axle-bushes", "Pouzdra / silentbloky", 20, ["pouzdro", "silenblok", "silentblok", "ulozeni", "ulozeni napravy"]),
    n("axle-joints", "Čepy nápravy", 30, ["kulovy cep", "hlavovy cep", "cep napravy", "cep kola"]),
    n("axle-bearings", "Náboje / ložiska kol", 40, ["naboj kola", "lozisko kola", "loziska kol"]),
    n("axle-stabilizer", "Stabilizátor", 50, ["stabiliz", "tycka stabiliz", "ulozeni stabiliz"]),
  ]),
  n("lighting", "Osvětlení", 310, ["svetl", "osvet", "zarov", "blink", "smerov", "mlhov", "reflektor", "xenon", "led"], [
    n("lighting-headlights", "Světlomety", 10, ["hlavni svetlomet", "svetlomet", "reflektor"]),
    n("lighting-rear", "Zadní světla", 20, ["zadni svetlo", "brzdove svetlo"]),
    n("lighting-indicators", "Směrovky", 30, ["blikac", "smerov"]),
    n("lighting-bulbs", "Žárovky", 40, ["zarovka", "vybojka"]),
    n("lighting-fog", "Mlhovky", 50, ["mlhov"]),
  ]),
];

export const CANONICAL_PARENTS: CanonicalParent[] = JM_CATEGORY_TREE.map(({ id, label, sort, match }) => ({
  id,
  label,
  sort,
  match,
}));

const FALLBACK_PATH: JmCategoryPathNode[] = [
  { id: "service-maintenance", label: "Díly pro servis / kontrolu / údržbu", sort: 40 },
  { id: "service-universal", label: "Univerzální / montážní díly", sort: 90 },
];

type Candidate = {
  score: number;
  path: JmCategoryPathNode[];
};

const scoreKeyword = (normLabel: string, keyword: string): number => {
  const kw = stripDia(keyword);
  if (!kw) return 0;
  if (normLabel === kw) return 2000 + kw.length;
  if (normLabel.startsWith(kw)) return 1200 + kw.length;
  if (normLabel.includes(kw)) return 800 + kw.length;
  return 0;
};

function walkBest(node: JmCategoryNode, normLabel: string, path: JmCategoryPathNode[]): Candidate | null {
  const currentPath = [...path, { id: node.id, label: node.label, sort: node.sort }];
  let best: Candidate | null = null;

  for (const kw of node.match || []) {
    const score = scoreKeyword(normLabel, kw);
    const weightedScore = score + currentPath.length * 50;
    if (weightedScore > 0 && (!best || weightedScore > best.score || (weightedScore === best.score && currentPath.length > best.path.length))) {
      best = { score: weightedScore, path: currentPath };
    }
  }

  for (const child of node.children || []) {
    const childBest = walkBest(child, normLabel, currentPath);
    if (childBest && (!best || childBest.score > best.score || (childBest.score === best.score && childBest.path.length > best.path.length))) best = childBest;
  }

  return best;
}

export function mapSectionToPath(sectionLabel: string): JmCategoryPathNode[] {
  const normLabel = stripDia(sectionLabel);
  if (!normLabel) return FALLBACK_PATH;

  let best: Candidate | null = null;
  for (const root of JM_CATEGORY_TREE) {
    const candidate = walkBest(root, normLabel, []);
    if (candidate && (!best || candidate.score > best.score || (candidate.score === best.score && candidate.path.length > best.path.length))) best = candidate;
  }

  return best?.path || FALLBACK_PATH;
}

/** Backward-compatible helper for old callers that only need the main parent. */
export function mapSectionToParent(sectionLabel: string): CanonicalParent {
  const root = mapSectionToPath(sectionLabel)[0];
  return CANONICAL_PARENTS.find((p) => p.id === root.id) || CANONICAL_PARENTS.find((p) => p.id === "service-maintenance")!;
}

export function normalizeSectionLabel(sectionLabel: string): string {
  return stripDia(sectionLabel).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
}
