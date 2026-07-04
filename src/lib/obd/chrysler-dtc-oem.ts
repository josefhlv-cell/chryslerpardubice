/**
 * Chrysler/Mopar DTC OEM databáze — nejvyšší priorita v DTC lookupu.
 * Data pochází z přiloženého souboru chrysler_dtc_new.xlsx (1000 kódů).
 * Struktura JSON: { CODE: { d: český popis závady, c: pravděpodobná příčina, f: první kontrola / řešení } }.
 */

import raw from "./chrysler-dtc-database.json";

export type ChryslerOemDtcEntry = {
  code: string;
  description: string;   // český popis
  possibleCause: string; // pravděpodobná příčina
  firstCheck: string;    // první kontrola / doporučené řešení
  source: "Chrysler/Mopar";
};

type RawEntry = { d: string; c: string; f: string };
const DB = raw as Record<string, RawEntry>;

/** Vyhledání DTC kódu v Chrysler/Mopar OEM databázi. */
export function lookupChryslerOemDtc(code: string): ChryslerOemDtcEntry | null {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  const entry = DB[key];
  if (!entry) return null;
  return {
    code: key,
    description: entry.d || "",
    possibleCause: entry.c || "",
    firstCheck: entry.f || "",
    source: "Chrysler/Mopar",
  };
}

export function chryslerOemDtcCount(): number {
  return Object.keys(DB).length;
}
