/**
 * Delphi diagnostic labels — English → Czech translation and system grouping.
 * Applied when rendering catalog names/descriptions and when building the
 * system tree (Motor / Převodovka / Brzdy / Elektronika / …).
 */
import type { DiagFunction } from "./types";

/* -------------------------------------------------------------------------- */
/* Term dictionary                                                            */
/* -------------------------------------------------------------------------- */

const TERMS: Array<[RegExp, string]> = [
  // --- Multi-word phrases FIRST (longer > shorter) ---
  [/\bfault code reading\b/gi, "Čtení chybových kódů"],
  [/\bfault code(s)?\b/gi, "Chybové kódy"],
  [/\bfault memory\b/gi, "Paměť závad"],
  [/\bread(ing)? (the )?fault (memory|codes)\b/gi, "Čtení paměti závad"],
  [/\bclear(ing)? (the )?fault (memory|codes)\b/gi, "Mazání paměti závad"],
  [/\berase (the )?fault (memory|codes)\b/gi, "Smazat paměť závad"],
  [/\bself[-\s]?test\b/gi, "Autotest"],
  [/\binjector calibration\b/gi, "Kalibrace vstřikovačů"],
  [/\bcalibrate damper actuators\b/gi, "Kalibrace klapek (aktuátorů)"],
  [/\bdamper actuators?\b/gi, "Klapkové aktuátory"],
  [/\ba\/?c cooling test\b/gi, "Test chlazení klimatizace"],
  [/\ba\/?c system\b/gi, "Systém klimatizace"],
  [/\bcooling capacity\b/gi, "Chladicí výkon"],
  [/\bcold sensor\b/gi, "Snímač chladu"],
  [/\btest conditions\b/gi, "Podmínky testu"],
  [/\btest requirements\b/gi, "Požadavky testu"],
  [/\bprocedure\b/gi, "Postup"],
  [/\bstart function\b/gi, "Spustit funkci"],
  [/\bpress "?ok"?\b/gi, 'stiskněte „OK"'],
  [/\bfollow the instructions in the dialog(ue)? box\b/gi, "Postupujte podle pokynů v dialogovém okně"],
  [/\bdata parameters are displayed when the test is complete\b/gi, "Po dokončení testu se zobrazí naměřené parametry"],
  [/\bif the function fails,? check the test conditions and repair any faults\b/gi, "Pokud funkce selže, zkontrolujte podmínky testu a odstraňte případné závady"],
  [/\breset adaptation values for (the )?fuel system\b/gi, "Reset adaptačních hodnot palivového systému"],
  [/\breset adaptation values for (the )?transmission( system)?\b/gi, "Reset adaptačních hodnot převodovky"],
  [/\breset adaptation values for variable line pressure\b/gi, "Reset adaptačních hodnot variabilního tlaku"],
  [/\breset adaptation values?( for)?\b/gi, "Reset adaptačních hodnot"],
  [/\breset(s|ting)? adaptation values\b/gi, "Reset adaptačních hodnot"],
  [/\bshift count\b/gi, "Počet řazení"],
  [/\bopen[-\s]?loop\b/gi, "otevřená smyčka"],
  [/\bclosed[-\s]?loop\b/gi, "uzavřená smyčka"],
  [/\bthermo 90s(?:t)?\b/gi, "Přídavné topení Thermo 90S(T)"],
  [/\bauxiliary heating\b/gi, "Přídavné topení"],
  [/\bremove sound insulation\b/gi, "Sejměte zvukovou izolaci"],
  [/\bcontrol module\b/gi, "Řídicí jednotka"],
  [/\bcontrol unit\b/gi, "Řídicí jednotka"],
  [/\bengine (is )?on\b/gi, "Motor běží"],
  [/\bengine (is )?off\b/gi, "Motor vypnutý"],
  [/\bignition (is )?on\b/gi, "Zapalování zapnuto"],
  [/\bignition (is )?off\b/gi, "Zapalování vypnuto"],
  [/\bwarning lamp\b/gi, "Kontrolka"],
  [/\bwait for(?:\s+the)?\b/gi, "Vyčkejte na"],
  [/\bdrive the vehicle\b/gi, "Jeďte s vozidlem"],
  [/\btest drive\b/gi, "Zkušební jízda"],

  // Powertrain / engine
  [/\bengine coolant temperature\b/gi, "Teplota chladicí kapaliny"],
  [/\bcoolant temperature\b/gi, "Teplota chladicí kapaliny"],
  [/\bengine oil temperature\b/gi, "Teplota motorového oleje"],
  [/\boil temperature\b/gi, "Teplota oleje"],
  [/\boil pressure\b/gi, "Tlak oleje"],
  [/\bfuel pressure\b/gi, "Tlak paliva"],
  [/\bfuel level\b/gi, "Stav paliva"],
  [/\bfuel trim\b/gi, "Korekce paliva"],
  [/\bfuel system\b/gi, "Palivový systém"],
  [/\bshort term\b/gi, "krátkodobá"],
  [/\blong term\b/gi, "dlouhodobá"],
  [/\bengine load\b/gi, "Zatížení motoru"],
  [/\bengine speed\b/gi, "Otáčky motoru"],
  [/\bthrottle position\b/gi, "Poloha škrticí klapky"],
  [/\baccelerator pedal\b/gi, "Plynový pedál"],
  [/\bintake air temperature\b/gi, "Teplota nasávaného vzduchu"],
  [/\bintake manifold pressure\b/gi, "Tlak v sání"],
  [/\bmass air flow\b/gi, "Průtok vzduchu (MAF)"],
  [/\btiming advance\b/gi, "Předstih zážehu"],
  [/\bboost pressure\b/gi, "Plnicí tlak"],
  [/\bturbo\b/gi, "Turbo"],
  [/\begr\b/gi, "EGR ventil"],
  [/\bcatalyst temperature\b/gi, "Teplota katalyzátoru"],
  [/\blambda\b/gi, "Lambda sonda"],
  [/\bo2 sensor\b/gi, "Lambda sonda"],
  [/\bmisfire\b/gi, "Vynechávání zapalování"],
  [/\bknock sensor\b/gi, "Snímač klepání"],
  [/\bcamshaft\b/gi, "Vačkový hřídel"],
  [/\bcrankshaft\b/gi, "Klikový hřídel"],
  [/\bglow plug(s)?\b/gi, "Žhavicí svíčky"],
  [/\bspark plug(s)?\b/gi, "Zapalovací svíčky"],
  [/\bdpf\b/gi, "DPF filtr"],
  [/\bsoot\b/gi, "Saze"],
  [/\bregeneration\b/gi, "Regenerace"],
  [/\bad ?blue\b/gi, "AdBlue"],
  [/\binjector(s)?\b/gi, "Vstřikovače"],
  [/\bcalibration\b/gi, "kalibrace"],

  // Transmission
  [/\btransmission (fluid )?temperature\b/gi, "Teplota převodovky"],
  [/\btransmission oil temperature\b/gi, "Teplota oleje převodovky"],
  [/\btransmission( system)?\b/gi, "Převodovka"],
  [/\bgearbox\b/gi, "Převodovka"],
  [/\btorque converter\b/gi, "Měnič momentu"],
  [/\bcurrent gear\b/gi, "Aktuální rychlostní stupeň"],
  [/\bgear\b/gi, "Rychlostní stupeň"],
  [/\bclutch\b/gi, "Spojka"],
  [/\bline pressure\b/gi, "Tlak v hydraulice"],

  // Vehicle / chassis
  [/\bvehicle speed\b/gi, "Rychlost vozidla"],
  [/\bwheel speed\b/gi, "Rychlost kola"],
  [/\bsteering angle\b/gi, "Úhel natočení volantu"],
  [/\byaw rate\b/gi, "Úhlová rychlost (yaw)"],
  [/\blateral acceleration\b/gi, "Boční zrychlení"],
  [/\bbrake pressure\b/gi, "Tlak brzd"],
  [/\bbrake pedal\b/gi, "Brzdový pedál"],
  [/\bhandbrake\b/gi, "Ruční brzda"],
  [/\bparking brake\b/gi, "Parkovací brzda"],
  [/\btpms\b/gi, "TPMS (tlak v pneu)"],
  [/\btire pressure\b/gi, "Tlak v pneu"],
  [/\btyre pressure\b/gi, "Tlak v pneu"],

  // Electrical
  [/\bbattery voltage\b/gi, "Napětí baterie"],
  [/\bcontrol module voltage\b/gi, "Napětí řídicí jednotky"],
  [/\balternator\b/gi, "Alternátor"],
  [/\bstarter\b/gi, "Startér"],

  // HVAC / comfort
  [/\bambient temperature\b/gi, "Venkovní teplota"],
  [/\bcabin temperature\b/gi, "Teplota v kabině"],
  [/\bair conditioning\b/gi, "Klimatizace"],
  [/\bhvac\b/gi, "Klimatizace"],
  [/\bheating\b/gi, "Topení"],

  // Body / safety
  [/\bairbag\b/gi, "Airbag"],
  [/\bseat belt\b/gi, "Bezpečnostní pás"],
  [/\bdoor\b/gi, "Dveře"],
  [/\bwindow\b/gi, "Okno"],
  [/\bmirror\b/gi, "Zrcátko"],
  [/\bwiper(s)?\b/gi, "Stěrače"],
  [/\bheadlight(s)?\b/gi, "Světlomety"],

  // Generic
  [/\btemperature\b/gi, "Teplota"],
  [/\bpressure\b/gi, "Tlak"],
  [/\bspeed\b/gi, "Rychlost"],
  [/\bvoltage\b/gi, "Napětí"],
  [/\bcurrent\b/gi, "Proud"],
  [/\bstatus\b/gi, "Stav"],
  [/\bposition\b/gi, "Poloha"],
  [/\brequest\b/gi, "Požadavek"],
  [/\bactual\b/gi, "aktuální"],
  [/\btarget\b/gi, "cílový"],
  [/\bmode\b/gi, "režim"],
  [/\bsensor\b/gi, "snímač"],
  [/\breset\b/gi, "Reset"],
  [/\bread\b/gi, "Čtení"],
  [/\bclear\b/gi, "Smazat"],
  [/\berase\b/gi, "Smazat"],
  [/\bactuator test\b/gi, "Test akčního členu"],
  [/\bactuator(s)?\b/gi, "Akční člen"],
  [/\brelearn\b/gi, "Adaptace"],
  [/\badaptation\b/gi, "Adaptace"],
  [/\bcoding\b/gi, "Kódování"],
  [/\bservice\b/gi, "Servis"],
  [/\bfunction\b/gi, "funkce"],
  [/\bthis function is used to\b/gi, "Tato funkce slouží k"],
  [/\bfor the test to yield a successful result\b/gi, "Aby byl test úspěšný"],
  [/\bmust drop by\b/gi, "musí klesnout o"],
  [/\bmust reach\b/gi, "musí dosáhnout"],
  [/\bwill not start if\b/gi, "se nespustí, pokud"],
  [/\bbelow\b/gi, "pod"],
  [/\babove\b/gi, "nad"],
  [/\bduring the test\b/gi, "během testu"],
];

const CATEGORY_MAP: Record<string, string> = {
  live: "Živá data",
  live_data: "Živá data",
  livedata: "Živá data",
  pids: "OBD-II parametry",
  pid: "OBD-II parametry",
  dtc: "Chybové kódy",
  dtcs: "Chybové kódy",
  routines: "Servisní rutiny",
  routine: "Servisní rutiny",
  actuator: "Testy akčních členů",
  actuators: "Testy akčních členů",
  actuator_test: "Testy akčních členů",
  actuator_tests: "Testy akčních členů",
  did: "Identifikační data",
  dids: "Identifikační data",
  info: "Informace",
  identification: "Identifikace",
  status: "Stav",
  ecu_info: "Informace o ECU",
  other: "Ostatní",
  "": "Ostatní",
};

/** Translate a free-form English catalog label to Czech (best-effort, safe). */
export function translateLabel(input: string | null | undefined): string {
  if (!input) return "";
  let out = String(input);
  for (const [re, cs] of TERMS) out = out.replace(re, cs);
  // Nice sentence-case: keep first letter capitalized if it was originally.
  return out;
}

export function translateCategory(input: string | null | undefined): string {
  if (!input) return "Ostatní";
  const key = String(input).trim().toLowerCase();
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
  return translateLabel(input);
}

/* -------------------------------------------------------------------------- */
/* System grouping — Motor / Převodovka / Brzdy / Elektronika / …             */
/* -------------------------------------------------------------------------- */

export type SystemGroupKey =
  | "engine"
  | "transmission"
  | "brakes"
  | "chassis"
  | "electrical"
  | "hvac"
  | "safety"
  | "body"
  | "infotainment"
  | "diagnostics"
  | "other";

export interface SystemGroup {
  key: SystemGroupKey;
  label: string;
  order: number;
}

const GROUPS: Record<SystemGroupKey, SystemGroup> = {
  engine:        { key: "engine",        label: "Motor a pohon",        order: 1 },
  transmission:  { key: "transmission",  label: "Převodovka",           order: 2 },
  brakes:        { key: "brakes",        label: "Brzdy a ABS",          order: 3 },
  chassis:       { key: "chassis",       label: "Podvozek a řízení",    order: 4 },
  electrical:    { key: "electrical",    label: "Elektronika a napájení", order: 5 },
  hvac:          { key: "hvac",          label: "Klimatizace a topení", order: 6 },
  safety:        { key: "safety",        label: "Bezpečnost (Airbag, ADAS)", order: 7 },
  body:          { key: "body",          label: "Karoserie a komfort",  order: 8 },
  infotainment:  { key: "infotainment",  label: "Infotainment",         order: 9 },
  diagnostics:   { key: "diagnostics",   label: "Diagnostika a identifikace", order: 10 },
  other:         { key: "other",         label: "Ostatní",              order: 99 },
};

const KEYWORD_TO_GROUP: Array<[RegExp, SystemGroupKey]> = [
  // Engine / powertrain
  [/\b(engine|motor|ecm|pcm|ecu.*(engine|motor)|fuel|injector|ignition|spark|coolant|intake|exhaust|turbo|boost|egr|dpf|adblue|scr|nox|lambda|o2|misfire|glow|catalyst|throttle|maf|map)\b/i, "engine"],
  // Transmission
  [/\b(transmission|gearbox|tcm|tcu|převodov|clutch|spojka|torque converter|gear|rychlostní stupe|8hp|9hp|automat|dsg|tiptronic)\b/i, "transmission"],
  // Brakes / ABS / ESP
  [/\b(brake|brzd|abs|esp|esc|stability|traction|tcs|hba|ebd)\b/i, "brakes"],
  // Chassis / steering / suspension
  [/\b(steer|volant|suspension|podvozek|damper|shock|air ride|ride height|tpms|tire|tyre|wheel speed|4wd|awd|differential|diferenciál)\b/i, "chassis"],
  // Electrical / battery / body control
  [/\b(battery|baterie|alternator|starter|generator|voltage|napět|bcm|body control|gateway|can bus|lin|network|module voltage)\b/i, "electrical"],
  // HVAC
  [/\b(hvac|air condition|klima|heater|topení|cabin temp|ambient temp|blower|ventilace)\b/i, "hvac"],
  // Safety / SRS / ADAS
  [/\b(airbag|srs|seat ?belt|pretensioner|adas|lane|collision|blind spot|acc|adaptive cruise|park.*(assist|sensor))\b/i, "safety"],
  // Body / comfort
  [/\b(door|window|mirror|wiper|light|headlight|lamp|seat|memory|central lock|zámky|okno|dveře|zrcát|stěrač|osvětlení|karoseri)\b/i, "body"],
  // Infotainment
  [/\b(radio|audio|infotainment|navigation|navi|bluetooth|telematics|amplifier|display|instrument cluster|kombi.*přístroj)\b/i, "infotainment"],
  // Diagnostics / identification
  [/\b(vin|identification|readiness|mode ?09|ecu info|scan|dtc|routine|coding|adapt|reset|kalibrace|kódování|adaptace|informace|identifikace)\b/i, "diagnostics"],
];

const ADDRESS_TO_GROUP: Record<string, SystemGroupKey> = {
  "7E0": "engine",
  "7E1": "transmission",
  "7E2": "engine",
  "7E3": "engine",
  "760": "brakes",   // ABS common
  "746": "brakes",
  "731": "safety",   // SRS common
  "6C0": "electrical",
  "758": "body",
};

function normalizeAddress(addr?: string): string {
  return (addr || "").replace(/^0x/i, "").replace(/\s+/g, "").toUpperCase();
}

export function resolveSystemGroup(fn: DiagFunction): SystemGroup {
  const haystack = [
    fn.category,
    fn.name,
    fn.description,
    fn.ecu,
    fn.ecuCommonName,
  ]
    .filter(Boolean)
    .join(" ");

  for (const [re, key] of KEYWORD_TO_GROUP) {
    if (re.test(haystack)) return GROUPS[key];
  }

  const addr = normalizeAddress(fn.ecuAddress);
  if (addr && ADDRESS_TO_GROUP[addr]) return GROUPS[ADDRESS_TO_GROUP[addr]];

  return GROUPS.other;
}

export const SYSTEM_GROUP_ORDER: SystemGroupKey[] = [
  "engine",
  "transmission",
  "brakes",
  "chassis",
  "electrical",
  "hvac",
  "safety",
  "body",
  "infotainment",
  "diagnostics",
  "other",
];

export function getSystemGroupLabel(key: SystemGroupKey): string {
  return GROUPS[key].label;
}
