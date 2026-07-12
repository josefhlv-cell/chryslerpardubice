/**
 * VraForge Diag response cleaner + decoder — ported from Delphi-OBD
 * parser logic (ISO 15765-2 / SAE J1979 / UDS 22 / 31 01).
 *
 * Handles:
 *   - ELM327 whitespace / prompt / CR / LF stripping
 *   - Compact CAN frames without spaces: 7E8037F317F -> 7E8 03 7F 31 7F
 *   - Multi-line ISO-TP concatenation ("0: 10 xx yy…" + "1: 21 …")
 *   - Positive response detection (41, 43, 47, 49, 4A, 62, 71)
 *   - Negative response (7F sid nrc) with response-pending (78) awareness
 *   - Value decoding per catalog Decoder spec
 */

import type { Decoder, DecodedValue, DiagFunction, RunStatus } from "./types";
import type { UdsNrcCatalog } from "./types";

export interface CleanedResponse {
  cleanedHex: string;        // canonical payload, e.g. "62 10 52 5B" or "7F 31 7F"
  bytes: number[];           // decoded payload bytes after positive service/DID stripping; empty on NRC
  status: RunStatus;
  warnings: string[];
  nrc?: { sid: string; code: string; description?: string };
  meta?: {
    header?: string;
    pci?: string;
    payload?: string;
    service?: string;
    nrc?: string;
    nrcMeaning?: string;
  };
}

const CAN_11BIT_RESPONSE_HEADERS = [
  "7E8", "7E9", "7EA", "7EB", "7EC", "7ED", "7EE", "7EF",
];

const EXTRA_NRC_MEANINGS: Record<string, string> = {
  "10": "generalReject",
  "11": "serviceNotSupported",
  "12": "subFunctionNotSupported",
  "13": "incorrectMessageLengthOrInvalidFormat",
  "21": "busyRepeatRequest",
  "22": "conditionsNotCorrect",
  "24": "requestSequenceError",
  "31": "requestOutOfRange",
  "33": "securityAccessDenied",
  "35": "invalidKey",
  "36": "exceedNumberOfAttempts",
  "37": "requiredTimeDelayNotExpired",
  "78": "responsePending",
  "7F": "serviceNotSupportedInActiveSession",
};

function stripPrompt(raw: string): string {
  return raw
    .replace(/>/g, "")
    .replace(/\r/g, "\n")
    .replace(/SEARCHING\.\.\./gi, "")
    .replace(/BUS\s*INIT[^\n]*/gi, "")
    .trim();
}

function collapseIsotp(lines: string[]): string {
  const flat: string[] = [];

  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;

    const m = t.match(/^([0-9A-F])\s*:\s*(.+)$/i);
    if (m) flat.push(m[2]);
    else flat.push(t);
  }

  return flat.join(" ");
}

function normalizeHex(input: string): string {
  return input.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
}

function bytesFromPlainHex(hex: string): number[] {
  const clean = normalizeHex(hex);
  const out: number[] = [];

  for (let i = 0; i + 1 < clean.length; i += 2) {
    out.push(parseInt(clean.slice(i, i + 2), 16));
  }

  return out;
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

function findKnownCanHeader(hex: string): string | undefined {
  return CAN_11BIT_RESPONSE_HEADERS.find((h) => hex.startsWith(h));
}

function nrcDescription(code: string, nrcCatalog?: UdsNrcCatalog): string | undefined {
  const normalized = code.toUpperCase().replace("0X", "");
  const entry = nrcCatalog?.entries.find((e) => e.code.toUpperCase().replace("0X", "") === normalized);
  return entry?.description ?? EXTRA_NRC_MEANINGS[normalized];
}

function parseCanOrIsoTpPayload(joined: string): {
  header?: string;
  pci?: string;
  payloadBytes: number[];
  payloadHex: string;
} {
  const hex = normalizeHex(joined);

  if (!hex) {
    return { payloadBytes: [], payloadHex: "" };
  }

  const header = findKnownCanHeader(hex);

  /**
   * Important fix:
   * Compact CAN response may arrive as:
   * 7E8037F317F
   *
   * This is NOT:
   * 7E 80 37 F3 17
   *
   * Correct:
   * header = 7E8
   * pci    = 03
   * data   = 7F 31 7F
   */
  if (header) {
    const rest = hex.slice(header.length);
    const restBytes = bytesFromPlainHex(rest);

    if (restBytes.length === 0) {
      return { header, payloadBytes: [], payloadHex: "" };
    }

    const pciByte = restBytes[0];
    const pci = pciByte.toString(16).toUpperCase().padStart(2, "0");
    const frameType = pciByte & 0xF0;
    const len = pciByte & 0x0F;

    // ISO-TP single frame: 0L, where L is payload length.
    if (frameType === 0x00) {
      const payloadBytes = restBytes.slice(1, 1 + len);
      return {
        header,
        pci,
        payloadBytes,
        payloadHex: bytesToHex(payloadBytes),
      };
    }

    // ISO-TP first frame: 1L LL ...
    if (frameType === 0x10 && restBytes.length >= 2) {
      const totalLength = ((pciByte & 0x0F) << 8) | restBytes[1];
      const payloadBytes = restBytes.slice(2, 2 + totalLength);
      return {
        header,
        pci,
        payloadBytes,
        payloadHex: bytesToHex(payloadBytes),
      };
    }

    // Fallback: strip PCI and return the rest.
    const payloadBytes = restBytes.slice(1);
    return {
      header,
      pci,
      payloadBytes,
      payloadHex: bytesToHex(payloadBytes),
    };
  }

  const bytes = bytesFromPlainHex(hex);

  // ATH1 spaced style sometimes may be parsed as: 07 E8 03 7F 31 7F
  if (bytes.length >= 6 && bytes[0] === 0x07 && bytes[1] >= 0xE8 && bytes[1] <= 0xEF) {
    const hdr = `7${bytes[1].toString(16).toUpperCase()}`;
    const pciByte = bytes[2];
    const pci = pciByte.toString(16).toUpperCase().padStart(2, "0");
    const frameType = pciByte & 0xF0;
    const len = pciByte & 0x0F;

    if (frameType === 0x00) {
      const payloadBytes = bytes.slice(3, 3 + len);
      return {
        header: hdr,
        pci,
        payloadBytes,
        payloadHex: bytesToHex(payloadBytes),
      };
    }

    return {
      header: hdr,
      pci,
      payloadBytes: bytes.slice(3),
      payloadHex: bytesToHex(bytes.slice(3)),
    };
  }

  // No CAN header. Strip ISO-TP single-frame PCI if present.
  if (bytes.length >= 2) {
    const pciByte = bytes[0];
    const frameType = pciByte & 0xF0;
    const len = pciByte & 0x0F;

    if (frameType === 0x00 && len > 0 && bytes.length >= 1 + len) {
      const payloadBytes = bytes.slice(1, 1 + len);
      return {
        pci: pciByte.toString(16).toUpperCase().padStart(2, "0"),
        payloadBytes,
        payloadHex: bytesToHex(payloadBytes),
      };
    }

    if (frameType === 0x10 && bytes.length >= 2) {
      const totalLength = ((pciByte & 0x0F) << 8) | bytes[1];
      const payloadBytes = bytes.slice(2, 2 + totalLength);
      return {
        pci: pciByte.toString(16).toUpperCase().padStart(2, "0"),
        payloadBytes,
        payloadHex: bytesToHex(payloadBytes),
      };
    }
  }

  return {
    payloadBytes: bytes,
    payloadHex: bytesToHex(bytes),
  };
}

function isPositiveServiceByte(b: number, sentCommand: string): boolean {
  const svc = parseInt(sentCommand.trim().slice(0, 2), 16);
  if (Number.isNaN(svc)) return false;
  return b === (svc + 0x40);
}

/**
 * Clean & classify an ELM raw response for a given command.
 * Strips echo, framing, ISO-TP length byte, and service+ID prefix so `bytes`
 * contains only decoded payload.
 */
export function cleanResponse(sentCommand: string, raw: string, nrcCatalog?: UdsNrcCatalog): CleanedResponse {
  const warnings: string[] = [];
  const stripped = stripPrompt(raw);
  const lines = stripped.split(/\n/).map((l) => l.trim()).filter(Boolean);

  const upper = stripped.toUpperCase();

  if (/^NO DATA/m.test(upper)) {
    return { cleanedHex: "", bytes: [], status: "no_data", warnings };
  }

  if (/TIMEOUT/i.test(upper)) {
    return { cleanedHex: "", bytes: [], status: "timeout", warnings };
  }

  if (/CAN ERROR|BUS ERROR|BUFFER FULL|STOPPED|UNABLE TO CONNECT|ERROR/m.test(upper) && !upper.includes("7F")) {
    return { cleanedHex: stripped, bytes: [], status: "error", warnings: ["adapter_error"] };
  }

  const echo = sentCommand.replace(/\s+/g, "").toUpperCase();
  const filtered = lines.filter((l) => l.replace(/\s+/g, "").toUpperCase() !== echo);
  const joined = collapseIsotp(filtered);

  const parsed = parseCanOrIsoTpPayload(joined);
  let bytes = parsed.payloadBytes;

  if (bytes.length === 0) {
    return {
      cleanedHex: parsed.payloadHex || joined,
      bytes: [],
      status: "no_data",
      warnings,
      meta: {
        header: parsed.header,
        pci: parsed.pci,
        payload: parsed.payloadHex,
      },
    };
  }

  /**
   * Negative response:
   * 7F <original service> <NRC>
   *
   * Example real log:
   * raw: 7E8037F317F
   * parsed payload: 7F 31 7F
   *
   * This must NEVER be decoded as successful routine result.
   */
  if (bytes[0] === 0x7F && bytes.length >= 3) {
    const sid = bytes[1].toString(16).toUpperCase().padStart(2, "0");
    const nrc = bytes[2].toString(16).toUpperCase().padStart(2, "0");
    const description = nrcDescription(nrc, nrcCatalog);
    const isPending = nrc === "78";

    warnings.push(`NRC 7F ${sid} ${nrc}${description ? ` — ${description}` : ""}`);

    return {
      cleanedHex: bytesToHex(bytes),
      bytes: [],
      status: isPending ? "pending" : "nrc",
      warnings,
      nrc: { sid, code: nrc, description },
      meta: {
        header: parsed.header,
        pci: parsed.pci,
        payload: bytesToHex(bytes),
        service: sid,
        nrc,
        nrcMeaning: description,
      },
    };
  }

  const normalizedCommand = sentCommand.replace(/\s+/g, "").toUpperCase();

  /**
   * RoutineControl command 31 must only be success when response starts with 71.
   * Anything else is invalid or NRC.
   */
  if (normalizedCommand.startsWith("3101") && bytes[0] !== 0x71) {
    return {
      cleanedHex: bytesToHex(bytes),
      bytes: [],
      status: "error",
      warnings: ["RoutineControl success requires positive response 71."],
      meta: {
        header: parsed.header,
        pci: parsed.pci,
        payload: bytesToHex(bytes),
        service: bytes[0]?.toString(16).toUpperCase().padStart(2, "0"),
      },
    };
  }

  // Strip positive service byte and identifier prefix.
  if (bytes.length > 0 && isPositiveServiceByte(bytes[0], sentCommand)) {
    const svc = parseInt(sentCommand.trim().slice(0, 2), 16);

    bytes = bytes.slice(1);

    if (svc === 0x22 && bytes.length >= 2) {
      bytes = bytes.slice(2);          // strip DID
    } else if (svc === 0x31 && bytes.length >= 3) {
      bytes = bytes.slice(3);          // strip subfn + routine id
    } else if (svc === 0x01 && bytes.length >= 1) {
      bytes = bytes.slice(1);          // strip PID
    } else if (svc === 0x09 && bytes.length >= 1) {
      bytes = bytes.slice(1);          // strip PID
    }
  }

  const cleanedHex = bytesToHex(bytes);

  return {
    cleanedHex,
    bytes,
    status: "ok",
    warnings,
    meta: {
      header: parsed.header,
      pci: parsed.pci,
      payload: parsed.payloadHex,
    },
  };
}

/* ---------------- Decoding ---------------- */

function readUint(bytes: number[], size: number, signed: boolean): number | null {
  if (bytes.length < size) return null;

  let v = 0;
  for (let i = 0; i < size; i++) {
    v = (v << 8) | bytes[i];
  }

  if (signed) {
    const bits = size * 8;
    const sign = 1 << (bits - 1);
    if (v & sign) v = v - (1 << bits);
  }

  return v;
}

export function decodeValue(fn: DiagFunction, bytes: number[]): DecodedValue[] {
  const dec: Decoder | undefined = fn.decoder;

  if (!dec) {
    return [{
      name: fn.name,
      value: bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" "),
      unit: null,
      description: fn.description ?? null,
    }];
  }

  const scale = dec.scale ?? 1;
  const offset = dec.offset ?? 0;
  const unit = dec.unit ?? null;

  let raw: number | null = null;
  let value: DecodedValue["value"] = null;

  switch (dec.kind) {
    case "uint8":     raw = readUint(bytes, 1, false); break;
    case "int8":      raw = readUint(bytes, 1, true);  break;
    case "uint16_be": raw = readUint(bytes, 2, false); break;
    case "int16_be":  raw = readUint(bytes, 2, true);  break;
    case "uint32_be": raw = readUint(bytes, 4, false); break;
    case "int32_be":  raw = readUint(bytes, 4, true);  break;
    case "bool":
      raw = readUint(bytes, 1, false);
      value = raw !== null ? raw !== 0 : null;
      break;
    case "ascii":
      value = String.fromCharCode(...bytes).replace(/[^\x20-\x7E]/g, "").trim();
      break;
    case "hex":
    case "raw":
    default:
      value = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  }

  if (raw !== null && value === null) {
    value = Math.round((raw * scale + offset) * 1000) / 1000;

    if (dec.map) {
      const key = `0x${raw.toString(16).toUpperCase().padStart(2, "0")}`;
      if (dec.map[key]) value = dec.map[key];
    }
  }

  return [{
    name: fn.name,
    value,
    unit,
    description: fn.description ?? null,
  }];
}

/* -------------- DTC parsing Mode 03/07/0A -------------- */

export function decodeDtcs(bytes: number[]): string[] {
  const out: string[] = [];

  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const hi = bytes[i];
    const lo = bytes[i + 1];

    if (hi === 0 && lo === 0) continue;

    const sys = ["P", "C", "B", "U"][(hi >> 6) & 0x03];
    const d1 = (hi >> 4) & 0x03;
    const d2 = hi & 0x0F;
    const d3 = (lo >> 4) & 0x0F;
    const d4 = lo & 0x0F;

    out.push(`${sys}${d1}${d2.toString(16).toUpperCase()}${d3.toString(16).toUpperCase()}${d4.toString(16).toUpperCase()}`);
  }

  return out;
}