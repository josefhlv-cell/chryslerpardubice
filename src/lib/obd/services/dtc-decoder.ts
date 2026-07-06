/**
 * DTC dekódér — 2 bajty → 1 kód (např. "P0403").
 * Podle Delphi-OBD Service03/07/0A. Sdíleno mezi všemi třemi službami.
 *
 * Vstup: payload OBD služby 03/07/0A bez PCI a bez pozitivního markeru 43/47/4A.
 * DŮLEŽITÉ: většina SAE/J1979 Mode 03/07/0A odpovědí po markeru NEMÁ samostatný
 * byte s počtem DTC (43 01 33 = P0133). Některé FCA/ELM multi-frame odpovědi ale
 * count byte vrací (43 03 04 20 04 06 07 6A = 3 kódy P0420/P0406/P076A).
 * Proto count přeskočíme jen tehdy, když délka přesně sedí na N dvoubajtových kódů.
 */

export type DtcLetter = "P" | "C" | "B" | "U";

export type DecodedDtc = {
  code: string;         // "P0403"
  letter: DtcLetter;
  raw: string;          // "01 04" nebo UDS "04 20 07 6A"
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

  const maybeCount = data[0] ?? 0;
  if (
    data.length >= 3 &&
    maybeCount > 0 &&
    maybeCount <= 0x10 &&
    data.length - 1 >= maybeCount * 2 &&
    ((data.length - 1 === maybeCount * 2) || data.slice(1 + maybeCount * 2).every((b) => b === 0x00))
  ) {
    warnings.push(`Detected DTC count byte (${maybeCount}) before code pairs.`);
    data = data.slice(1, 1 + maybeCount * 2);
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

/**
 * UDS Service 19 DTC = 3 bajty kódu + 1 bajt statusu.
 * Formát NENÍ stejný jako SAE Mode 03 dvoubajtový DTC. Pokud se UDS payload
 * dekóduje přes decodeDtcPair(), vznikají falešné kódy a TCM/ABS chyby se
 * v UI ztrácí. Delphi pro UDS drží tříbajtovou hodnotu a status zvlášť.
 */
export function decodeUdsDtcRecord(dtcHigh: number, dtcMid: number, dtcLow: number, status?: number): DecodedDtc | null {
  if (dtcHigh === 0 && dtcMid === 0 && dtcLow === 0) return null;

  const letter = LETTERS[(dtcHigh >> 6) & 0x03];
  const firstDigit = (dtcHigh >> 4) & 0x03;
  const secondDigit = dtcHigh & 0x0f;
  const thirdDigit = (dtcMid >> 4) & 0x0f;
  const fourthDigit = dtcMid & 0x0f;
  const failureType = dtcLow.toString(16).padStart(2, "0").toUpperCase();
  const code = `${letter}${firstDigit.toString(16).toUpperCase()}${secondDigit.toString(16).toUpperCase()}${thirdDigit.toString(16).toUpperCase()}${fourthDigit.toString(16).toUpperCase()}-${failureType}`;
  const rawBytes = [dtcHigh, dtcMid, dtcLow, status].filter((b): b is number => typeof b === "number");

  return {
    code,
    letter,
    raw: rawBytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" "),
  };
}
