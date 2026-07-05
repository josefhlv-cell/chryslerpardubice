/**
 * Stellantis / FCA specifický DTC katalog.
 * Připojuje se k obecnému ISO-15031 (specifický má přednost).
 */
import type { DtcCatalogEntry } from "./iso-15031";

const STELLANTIS: Record<string, DtcCatalogEntry> = {
  // Sem se přidávají OEM-specifické popisky (P1xxx, P2xxx, U1xxx).
  // Zatím prázdné — parser + ISO katalog stačí.
};

export function lookupStellantis(code: string): DtcCatalogEntry | undefined {
  return STELLANTIS[code.toUpperCase()];
}

export const stellantisCatalog = STELLANTIS;
