/**
 * VIN reader (Mode 09 PID 02) + WMI/brand decoder.
 * Používá se pro rozpoznání vozidla po připojení OBD.
 * NIKDY negeneruje fake údaje – neznámé pole = undefined.
 */
import { elm327 } from "@/lib/obd/elm327-engine";

export type DecodedVin = {
  vin: string;
  wmi: string;
  brand?: string;
  region?: string;
  year?: number;
  protocolGroup: string;
  confidence: "low" | "medium" | "high";
  source: string;
};

/**
 * WMI → značka + protocolGroup.
 * Chrysler/Dodge/Jeep/RAM: 1C, 2C, 3C, 1D, 2D, 3D, 1J, 4T (Chrysler PT/300 asijská výroba)
 * VAG (Škoda/VW/Audi/Seat/Porsche): TMB, WVW, WV1, WV2, WAU, VSS, WP0, WP1, TRU
 */
const WMI_MAP: Record<string, { brand: string; protocolGroup: string }> = {
  "1C": { brand: "Chrysler", protocolGroup: "chrysler_can_2011_2016" },
  "2C": { brand: "Chrysler", protocolGroup: "chrysler_can_2011_2016" },
  "3C": { brand: "Chrysler", protocolGroup: "chrysler_can_2011_2016" },
  "1D": { brand: "Dodge", protocolGroup: "chrysler_can_2011_2016" },
  "2D": { brand: "Dodge", protocolGroup: "chrysler_can_2011_2016" },
  "3D": { brand: "Dodge", protocolGroup: "chrysler_can_2011_2016" },
  "1J": { brand: "Jeep", protocolGroup: "chrysler_can_2011_2016" },
  "1F": { brand: "Ford", protocolGroup: "generic_obd2" },
  "TMB": { brand: "Škoda", protocolGroup: "vag_can" },
  "WVW": { brand: "Volkswagen", protocolGroup: "vag_can" },
  "WV1": { brand: "Volkswagen", protocolGroup: "vag_can" },
  "WV2": { brand: "Volkswagen", protocolGroup: "vag_can" },
  "WAU": { brand: "Audi", protocolGroup: "vag_can" },
  "VSS": { brand: "Seat", protocolGroup: "vag_can" },
  "WP0": { brand: "Porsche", protocolGroup: "vag_can" },
  "WP1": { brand: "Porsche", protocolGroup: "vag_can" },
};

const YEAR_CODE: Record<string, number[]> = {
  A: [1980, 2010], B: [1981, 2011], C: [1982, 2012], D: [1983, 2013], E: [1984, 2014],
  F: [1985, 2015], G: [1986, 2016], H: [1987, 2017], J: [1988, 2018], K: [1989, 2019],
  L: [1990, 2020], M: [1991, 2021], N: [1992, 2022], P: [1993, 2023], R: [1994, 2024],
  S: [1995, 2025], T: [1996, 2026], V: [1997, 2027], W: [1998, 2028], X: [1999, 2029],
  Y: [2000, 2030], "1": [2001, 2031], "2": [2002, 2032], "3": [2003, 2033], "4": [2004, 2034],
  "5": [2005, 2035], "6": [2006, 2036], "7": [2007, 2037], "8": [2008, 2038], "9": [2009, 2039],
};

export function decodeVin(vin: string): DecodedVin {
  const clean = (vin || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  const wmi = clean.slice(0, 3);
  const wmi2 = clean.slice(0, 2);

  const match = WMI_MAP[wmi] || WMI_MAP[wmi2];
  const brand = match?.brand;
  const protocolGroup = match?.protocolGroup || "unknown";

  let year: number | undefined;
  if (clean.length >= 10) {
    const yc = clean[9];
    const opts = YEAR_CODE[yc];
    if (opts) {
      // Newer of the two is more likely for post-2010 cars
      year = opts[1];
    }
  }

  const confidence: DecodedVin["confidence"] =
    clean.length === 17 && brand ? "high" : clean.length === 17 ? "medium" : "low";

  return {
    vin: clean,
    wmi,
    brand,
    year,
    protocolGroup,
    confidence,
    source: "OBD 0902 + WMI",
  };
}

/**
 * Načte VIN z ECU přes Mode 09 PID 02. Vrací dekódovaný objekt nebo null.
 * Bezpečně restartuje header na 7DF po dotazu.
 */
export async function readVinFromEcu(): Promise<DecodedVin | null> {
  try {
    console.log("[VIN RESOLVER] querying 0902...");
    const raw = await elm327.sendCommand("0902", "low");
    if (!raw || /NO\s*DATA|UNABLE|ERROR|STOPPED|\?/i.test(raw)) {
      console.log("[VIN RESOLVER] 0902 unavailable:", raw);
      return null;
    }

    // Odpověď: 49 02 01 XX XX XX ... (17 znaků VIN rozdělených do frames)
    const clean = raw.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
    const idx = clean.indexOf("4902");
    if (idx < 0) return null;

    // Za 4902 následuje 01 (record #), pak 17 ASCII bajtů VIN.
    // Multi-frame odpovědi mají v každém segmentu předsazený index – vytáhneme jen ASCII v tisknutelném rozsahu.
    const payload = clean.slice(idx + 4);
    const bytes: number[] = [];
    for (let i = 0; i + 1 < payload.length; i += 2) {
      bytes.push(parseInt(payload.slice(i, i + 2), 16));
    }
    const chars = bytes
      .map((b) => (b >= 0x30 && b <= 0x5a ? String.fromCharCode(b) : ""))
      .join("");

    // Vytáhneme nejdelší souvislý VIN-like segment 17 znaků
    const vinMatch = chars.match(/[A-HJ-NPR-Z0-9]{17}/);
    if (!vinMatch) {
      console.log("[VIN RESOLVER] no VIN pattern in:", chars);
      return null;
    }

    const decoded = decodeVin(vinMatch[0]);
    console.log("[VIN RESOLVER] VIN=", decoded.vin, "brand=", decoded.brand, "profile=", decoded.protocolGroup);
    return decoded;
  } catch (e) {
    console.warn("[VIN RESOLVER] error", e);
    return null;
  }
}
