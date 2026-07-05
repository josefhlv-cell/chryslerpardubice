/**
 * DTC dekódér — 2 bajty → 1 kód (např. "P0403").
 * Podle Delphi-OBD Service03/07/0A. Sdíleno mezi všemi třemi službami.
 *
 * Vstup: payload UDS/OBD služby (bez PCI, bez pozitivního markeru).
 * Pro službu 03/07/0A může payload začínat bytem s počtem DTC (dle vozidla).
 * Detekujeme to heuristikou: pokud první byte == floor((zbytek)/2), pravděpodobně
 * jde o počet DTC → přeskočíme ho.
 */

export type DtcLetter = "P" | "C" | "B" | "U";

export type DecodedDtc = {
  code: string;         // "P0403"
  letter: DtcLetter;
  raw: string;          // "01 04 03"
};

const LETTERS: DtcLetter[] = ["P", "C", "B", "U"];

export function decodeDtcPair(byte0: number, byte1: number): DecodedDtc | null {
  if (byte0 === 0 && byte1 === 0) return null;
  const letter = LETTERS[(byte0 >> 6) & 0x03];
  const firstDigit = (byte0 >> 4) & 0x03;
  const secondDigit = byte0 & 0x0f;
  const thirdDigit = (byte1 >> 4) & 0x0f;
  const fourthDigit = byte1 & 0x0f;
  const code =
    letter +
    firstDigit.toString(16).toUpperCase() +
    secondDigit.toString(16).toUpperCase() +
    thirdDigit.toString(16).toUpperCase() +
    fourthDigit.toString(16).toUpperCase();
  return {
    code,
    letter,
    raw: [byte0, byte1]
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(" "),
  };
}

export function decodeDtcPayload(payload: number[]): {
  codes: DecodedDtc[];
  warnings: string[];
} {
  const warnings: string[] = [];
  let data = payload.slice();

  // Heuristika: pokud první byte určuje počet a odpovídá délce, přeskočíme ho.
  if (data.length >= 1) {
    const declaredCount = data[0];
    const remaining = data.length - 1;
    if (
      declaredCount > 0 &&
      declaredCount <= 40 &&
      remaining >= declaredCount * 2 &&
      remaining < (declaredCount + 1) * 2
    ) {
      data = data.slice(1);
    }
  }

  // Sudý počet bytů; zbytek ignorujeme jako padding.
  if (data.length % 2 !== 0) data = data.slice(0, data.length - 1);

  const seen = new Set<string>();
  const codes: DecodedDtc[] = [];
  for (let i = 0; i < data.length; i += 2) {
    const dec = decodeDtcPair(data[i], data[i + 1]);
    if (dec && !seen.has(dec.code)) {
      seen.add(dec.code);
      codes.push(dec);
    }
  }
  return { codes, warnings };
}
