/**
 * DTC katalog — základní ISO-15031 kódy.
 * Rozšiřuje se postupně; parser (dtc-decoder) na katalogu nezávisí.
 */
export type DtcCatalogEntry = {
  code: string;
  en: string;
  cz: string;
  possibleCauses?: string[];
  solutions?: string[];
};

const ISO_15031: Record<string, DtcCatalogEntry> = {
  P0403: {
    code: "P0403",
    en: "Exhaust Gas Recirculation Control Circuit",
    cz: "Okruh ovládání EGR ventilu",
    possibleCauses: [
      "vadný EGR ventil",
      "zaseknutý nebo zanesený EGR ventil",
      "přerušená kabeláž EGR",
      "zkrat kabeláže EGR",
      "vadný konektor EGR",
      "problém napájení EGR",
      "problém kostry EGR",
      "vadný výstup ECU až jako poslední možnost",
    ],
    solutions: [
      "zkontrolovat konektor EGR",
      "změřit napájení EGR",
      "změřit kostru EGR",
      "proměřit kabeláž mezi ECU a EGR",
      "otestovat akční člen EGR",
      "zkontrolovat zanesení EGR a škrticí klapky",
      "vyčistit nebo vyměnit EGR podle výsledku testu",
    ],
  },
  P001D: {
    code: "P001D",
    en: "A Camshaft Profile Control Circuit/Open Bank 2",
    cz: "Okruh řízení profilu vačkové hřídele / přerušení, banka 2",
    possibleCauses: [
      "vadný ovládací ventil",
      "přerušená kabeláž",
      "vadný konektor",
      "nízký tlak oleje",
      "znečištěný olej",
      "mechanický problém ovládání vačky",
    ],
  },
};

export function lookupIso15031(code: string): DtcCatalogEntry | undefined {
  return ISO_15031[code.toUpperCase()];
}

export const iso15031Catalog = ISO_15031;
