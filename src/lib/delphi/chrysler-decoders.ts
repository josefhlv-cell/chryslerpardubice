/**
 * Chrysler / Mopar fallback decoders for UDS Mode 22 DIDs.
 *
 * Účel: Když katalog (public/delphi/catalogs/*.json) nemá u konkrétního DID
 * nastavený `decoder`, použijeme tento overlay tak, aby se v UI zobrazila
 * správně škálovaná fyzikální hodnota (°C, kPa, V, %, rpm, km/h)
 * místo syrové hex útržky.
 *
 * Zdroj hodnot: `src/lib/obd/chrysler-dids.ts` (F1xx identifikace, F4xx senzory).
 * Konvence Chrysler PCM/TCM/BCM pro platformy RT/RU/LX/LC (Town & Country,
 * Pacifica, Voyager, 300, Challenger, Charger, RAM, Dodge Journey, …).
 */

import type { Decoder } from "./types";
import { CHRYSLER_DIDS, type DIDDefinition } from "@/lib/obd/chrysler-dids";

function toDecoder(def: DIDDefinition): Decoder | null {
  switch (def.dataType) {
    case "ascii":
      return { kind: "ascii", length: def.length };
    case "uint8":
      return {
        kind: "uint8",
        scale: def.scaling?.factor ?? 1,
        offset: def.scaling?.offset ?? 0,
        unit: def.scaling?.unit,
      };
    case "int8":
      return {
        kind: "int8",
        scale: def.scaling?.factor ?? 1,
        offset: def.scaling?.offset ?? 0,
        unit: def.scaling?.unit,
      };
    case "uint16":
      return {
        kind: "uint16_be",
        scale: def.scaling?.factor ?? 1,
        offset: def.scaling?.offset ?? 0,
        unit: def.scaling?.unit,
      };
    case "int16":
      return {
        kind: "int16_be",
        scale: def.scaling?.factor ?? 1,
        offset: def.scaling?.offset ?? 0,
        unit: def.scaling?.unit,
      };
    case "uint32":
      return {
        kind: "uint32_be",
        scale: def.scaling?.factor ?? 1,
        offset: def.scaling?.offset ?? 0,
        unit: def.scaling?.unit,
      };
    case "float_scaled":
      return {
        kind: "uint16_be",
        scale: def.scaling?.factor ?? 1,
        offset: def.scaling?.offset ?? 0,
        unit: def.scaling?.unit,
      };
    default:
      return null; // hex / bitfield / bcd → decoder fallback stays hex
  }
}

const OVERLAY: Record<string, Decoder> = (() => {
  const out: Record<string, Decoder> = {};
  for (const [key, def] of Object.entries(CHRYSLER_DIDS)) {
    const dec = toDecoder(def);
    if (!dec) continue;
    const hex = Number(key).toString(16).toUpperCase().padStart(4, "0");
    out[hex] = dec;
  }
  return out;
})();

/** Vrátí fallback Decoder pro daný DID, pokud jde o známý Chrysler DID. */
export function chryslerDecoderForDid(didHex: string | undefined | null): Decoder | null {
  if (!didHex) return null;
  const normalized = didHex.replace(/[^0-9A-Fa-f]/g, "").toUpperCase().padStart(4, "0");
  return OVERLAY[normalized] ?? null;
}

/** Vrátí lidský název známého Chrysler DID (např. pro live gauge popis). */
export function chryslerDidName(didHex: string | undefined | null): string | null {
  if (!didHex) return null;
  const normalized = didHex.replace(/[^0-9A-Fa-f]/g, "").toUpperCase().padStart(4, "0");
  const numeric = parseInt(normalized, 16);
  return CHRYSLER_DIDS[numeric]?.name ?? null;
}

export function isChryslerBrand(brandKey?: string | null): boolean {
  if (!brandKey) return false;
  const k = brandKey.toLowerCase();
  return (
    k.includes("chrysler") ||
    k.includes("mopar") ||
    k.includes("dodge") ||
    k.includes("ram") ||
    k.includes("jeep") ||
    k.includes("stellantis") ||
    k.includes("fca") ||
    k.includes("lancia")
  );
}
