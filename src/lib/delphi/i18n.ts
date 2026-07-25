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
  // Powertrain / engine
  [/\bengine coolant temperature\b/gi, "Teplota chladicí kapaliny"],
  [/\bcoolant temperature\b/gi, "Teplota chladicí kapaliny"],
  [/\bengine oil temperature\b/gi, "Teplota motorového oleje"],
  [/\boil temperature\b/gi, "Teplota oleje"],
  [/\boil pressure\b/gi, "Tlak oleje"],
  [/\bfuel pressure\b/gi, "Tlak paliva"],
  [/\bfuel level\b/gi, "Stav paliva"],
  [/\bfuel trim\b/gi, "Korekce paliva"],
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
  [/\bglow plug\b/gi, "Žhavicí svíčky"],
  [/\bdpf\b/gi, "DPF filtr"],
  [/\bsoot\b/gi, "Saze"],
  [/\bregeneration\b/gi, "Regenerace"],
  [/\bad ?blue\b/gi, "AdBlue"],

  // Transmission
  [/\btransmission (fluid )?temperature\b/gi, "Teplota převodovky"],
  [/\btransmission oil temperature\b/gi, "Teplota oleje převodovky"],
  [/\btransmission\b/gi, "Převodovka"],
  [/\bgearbox\b/gi, "Převodovka"],
  [/\btorque converter\b/gi, "Měnič momentu"],
  [/\bcurrent gear\b/gi, "Aktuální rychlostní stupeň"],
  [/\bgear\b/gi, "Rychlostní stupeň"],
  [/\bclutch\b/gi, "Spojka"],

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
  [/\bwiper\b/gi, "Stěrače"],
  [/\bheadlight\b/gi, "Světlomety"],

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
  [/\bcalibration\b/gi, "kalibrace"],
  [/\breset\b/gi, "reset"],
  [/\bread\b/gi, "čtení"],
  [/\bclear\b/gi, "smazat"],
  [/\bactuator test\b/gi, "test akčního členu"],
  [/\brelearn\b/gi, "adaptace"],
  [/\badaptation\b/gi, "adaptace"],
  [/\bcoding\b/gi, "kódování"],
  [/\bservice\b/gi, "servis"],
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
