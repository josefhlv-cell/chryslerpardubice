/**
 * ISO-TP (ISO 15765-2) parser — nová vrstva podle Delphi-OBD OBD.Protocol.CAN.pas.
 *
 * Podporuje:
 *   - Single Frame        (7E8 06 43 …)              PCI nibble 0
 *   - First + Consecutive (7E8 10 14 …, 7E8 21 …)    PCI nibble 1/2
 *   - ELM multi-line      ("0: … 1: … 2: …")         formát s indexem
 *   - Wrap sekvence       15 -> 0
 *   - Hlavičky ECU        7E8/7E9/7EA/7EB (ATH1)
 *
 * Vstupem je cleaned response (viz response-cleaner.ts).
 * Výstupem je payload UDS/OBD služby (bez PCI, bez délkových bytů).
 *
 * Poznámka: parser nezná význam bytu s počtem DTC — to řeší DTC služba
 * (viz services/dtc-decoder.ts a services/service03.ts).
 */
import { hexLineToBytes, bytesToHex } from "./response-cleaner";

export type IsoTpFrame = {
  ecu?: string;               // "7E8" atd., pokud ATH1
  pci: 0 | 1 | 2 | 3;         // SF / FF / CF / FC
  seq?: number;               // pro CF (0..15)
  totalLength?: number;       // pro FF
  payload: number[];          // datové bajty tohoto framu (bez PCI)
  raw: string;
  indexed?: boolean;          // ELM "0:" / "1:" řádky bez ISO-TP PCI
};

export type IsoTpMessage = {
  ecu?: string;
  payload: number[];          // složený payload
  frames: IsoTpFrame[];
  warnings: string[];
};

const ECU_HEADER_RE = /^([0-9A-F]{3})(?:\s|$)/i;
const ELM_INDEX_RE = /^([0-9A-F]):\s*(.*)$/i;

function parseFrame(line: string): IsoTpFrame | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // ELM multi-line "0: 10 14 …" — index frame, PCI je až v datech
  const idxMatch = ELM_INDEX_RE.exec(trimmed);
  if (idxMatch) {
    const bytes = hexLineToBytes(idxMatch[2]);
    if (bytes.length === 0) return null;
    const nibble = (bytes[0] >> 4) & 0x0f;
    if (nibble === 1) {
      const total = ((bytes[0] & 0x0f) << 8) | (bytes[1] ?? 0);
      return { pci: 1, totalLength: total, payload: bytes.slice(2), raw: trimmed };
    }
    if (nibble === 2) {
      return { pci: 2, seq: bytes[0] & 0x0f, payload: bytes.slice(1), raw: trimmed };
    }
    if (nibble === 0) {
      const len = bytes[0] & 0x0f;
      return { pci: 0, payload: bytes.slice(1, 1 + len), raw: trimmed, indexed: true };
    }
    // Některé ELM adaptéry vrací multi-line odpověď jako:
    //   0: 49 02 01 31 43 ...
    //   1: 52 4A ...
    // bez PCI bytu. Nezahazovat — poskládáme řádky níže.
    return { pci: 0, payload: bytes, raw: trimmed, indexed: true };
  }

  // Volitelná ECU hlavička (7E8 …).
  // Reálné ELM/vLinker logy často chodí kompaktně bez mezer:
  //   7E81014490201314138
  //   7E82147534834503338
  // Původní parser poznal hlavičku jen ve tvaru "7E8 10 ..." a kompaktní
  // multi-frame odpověď pak dekódoval jako payload začínající 7E 81 ...,
  // takže VIN/DTC parser nenašel marker 49/43/47. Delphi parsuje nejdřív CAN
  // ID a až potom PCI byte — proto podporujeme obě varianty.
  let ecu: string | undefined;
  let dataPart = trimmed;
  const hdr = ECU_HEADER_RE.exec(trimmed);
  if (hdr) {
    ecu = hdr[1].toUpperCase();
    dataPart = trimmed.substring(hdr[0].length).trim();
  } else {
    const compact = trimmed.replace(/\s+/g, "").toUpperCase();
    if (/^[0-9A-F]+$/.test(compact) && compact.length >= 5 && compact.length % 2 === 1) {
      const maybeHeader = compact.slice(0, 3);
      const maybeData = compact.slice(3);
      const firstDataByte = parseInt(maybeData.slice(0, 2), 16);
      const pciNibble = (firstDataByte >> 4) & 0x0f;
      // 11-bit CAN response ID + ISO-TP PCI. Headerless OBD odpovědi (410C...)
      // mají sudý počet znaků, takže sem nespadnou.
      if (!Number.isNaN(firstDataByte) && pciNibble <= 3) {
        ecu = maybeHeader;
        dataPart = maybeData;
      }
    }
  }

  const bytes = hexLineToBytes(dataPart);
  if (bytes.length === 0) return null;

  const nibble = (bytes[0] >> 4) & 0x0f;
  switch (nibble) {
    case 0: {
      const len = bytes[0] & 0x0f;
      return { ecu, pci: 0, payload: bytes.slice(1, 1 + len), raw: trimmed };
    }
    case 1: {
      const total = ((bytes[0] & 0x0f) << 8) | (bytes[1] ?? 0);
      return { ecu, pci: 1, totalLength: total, payload: bytes.slice(2), raw: trimmed };
    }
    case 2: {
      return { ecu, pci: 2, seq: bytes[0] & 0x0f, payload: bytes.slice(1), raw: trimmed };
    }
    case 3: {
      return { ecu, pci: 3, payload: [], raw: trimmed };
    }
    default:
      // pokud první byte není PCI (např. surová odpověď bez PCI), vrátíme jako SF s celým payloadem
      return { ecu, pci: 0, payload: bytes, raw: trimmed };
  }
}

/**
 * Sestaví jednu IsoTpMessage z cleaned response.
 * Pokud odpoví více ECU (7E8, 7E9, …), preferuje první ECU, další ignoruje
 * a přidá warning (u OBD/UDS scanů typicky stačí primární odpověď).
 */
export function parseIsoTp(cleaned: string): IsoTpMessage {
  const warnings: string[] = [];
  const rawLines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
  const frames: IsoTpFrame[] = [];
  for (const line of rawLines) {
    const f = parseFrame(line);
    if (f) frames.push(f);
  }

  if (frames.length === 0) return { payload: [], frames: [], warnings: ["No frames parsed"] };

  // Rozděl podle ECU — použij první nalezené
  const primaryEcu = frames.find((f) => f.ecu)?.ecu;
  const primary = primaryEcu ? frames.filter((f) => f.ecu === primaryEcu || !f.ecu) : frames;
  if (primaryEcu && frames.some((f) => f.ecu && f.ecu !== primaryEcu)) {
    const others = [...new Set(frames.map((f) => f.ecu).filter((e) => e && e !== primaryEcu))];
    warnings.push(`Ignored responses from other ECUs: ${others.join(", ")}`);
  }

  const sf = primary.find((f) => f.pci === 0);
  if (sf && !primary.some((f) => f.pci === 1)) {
    if (primary.some((f) => f.indexed) && primary.length > 1) {
      return {
        ecu: primaryEcu,
        payload: primary.filter((f) => f.pci === 0).flatMap((f) => f.payload),
        frames: primary,
        warnings,
      };
    }
    return { ecu: primaryEcu, payload: sf.payload, frames: primary, warnings };
  }

  const ff = primary.find((f) => f.pci === 1);
  if (!ff) {
    // fallback: spoj všechny SF payloady
    const payload = primary.filter((f) => f.pci === 0).flatMap((f) => f.payload);
    return { ecu: primaryEcu, payload, frames: primary, warnings };
  }

  const total = ff.totalLength ?? 0;
  const cfs = primary
    .filter((f) => f.pci === 2)
    .sort((a, b) => {
      // seřaď podle pořadí v odpovědi (frames už jsou v pořadí)
      return primary.indexOf(a) - primary.indexOf(b);
    });

  const payload = [...ff.payload];
  let expected = 1;
  for (const cf of cfs) {
    if (cf.seq !== expected) {
      warnings.push(`ISO-TP sequence mismatch: expected ${expected}, got ${cf.seq}`);
    }
    payload.push(...cf.payload);
    expected = (expected + 1) & 0x0f;
    if (payload.length >= total) break;
  }
  const truncated = payload.slice(0, total);
  if (truncated.length < total) {
    warnings.push(`ISO-TP incomplete: got ${truncated.length}/${total} bytes`);
  }
  return { ecu: primaryEcu, payload: truncated, frames: primary, warnings };
}

export function payloadToHex(bytes: number[]): string {
  return bytesToHex(bytes, " ");
}
