/**
 * VraForge Diag response cleaner + decoder — ported from Delphi-OBD
 * parser logic (ISO 15765-2 / SAE J1979 / UDS 22 / 31 01).
 *
 * Handles:
 *   - ELM327 whitespace / prompt / CR / LF stripping
 *   - Multi-line ISO-TP concatenation ("0: 10 xx yy…" + "1: 21 …")
 *   - Positive response detection (41, 43, 47, 49, 4A, 62, 71)
 *   - Negative response (7F sid nrc) with response-pending (78) awareness
 *   - Value decoding per catalog Decoder spec
 */

import type { Decoder, DecodedValue, DiagFunction, RunStatus } from "./types";
import type { UdsNrcCatalog } from "./types";

export interface CleanedResponse {
  cleanedHex: string;        // canonical "62 10 52 5B" (spaces every byte)
  bytes: number[];           // parsed payload bytes (already stripped of headers/framing/echo/service)
  status: RunStatus;
  warnings: string[];
  nrc?: { sid: string; code: string; description?: string };
}

function stripPrompt(raw: string): string {
  return raw.replace(/>/g, "")
            .replace(/\r/g, "\n")
            .replace(/SEARCHING\.\.\./gi, "")
            .replace(/BUS\s*INIT[^\n]*/gi, "")
            .trim();
}

function collapseIsotp(lines: string[]): string {
  // Delphi-OBD approach: if a line starts with "N: " it's an ELM
  // ISO-TP frame indicator. We drop the "N:" and join everything.
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

function bytesFromHex(hex: string): number[] {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, "");
  const out: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

function isPositiveServiceByte(b: number, sentCommand: string): boolean {
  // sentCommand: "01 0C" or "22 10 52" or "31 01 02 06"
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

  // Common ELM error tokens
  const upper = stripped.toUpperCase();
  if (/^NO DATA/m.test(upper)) return { cleanedHex: "", bytes: [], status: "no_data", warnings };
  if (/CAN ERROR|BUS ERROR|BUFFER FULL|STOPPED|UNABLE TO CONNECT|ERROR/m.test(upper) && !/^7F/.test(upper)) {
    return { cleanedHex: stripped, bytes: [], status: "error", warnings: ["adapter_error"] };
  }
  if (/TIMEOUT/i.test(upper)) return { cleanedHex: "", bytes: [], status: "timeout", warnings };

  // Filter echo of the command
  const echo = sentCommand.replace(/\s+/g, "").toUpperCase();
  const filtered = lines.filter((l) => l.replace(/\s+/g, "").toUpperCase() !== echo);
  const joined = collapseIsotp(filtered);
  let bytes = bytesFromHex(joined);
  if (bytes.length === 0) return { cleanedHex: joined, bytes: [], status: "no_data", warnings };

  // Strip CAN header if ATH1 was active (3 bytes: e.g. 7E8 → 0x07 0xE8). Heuristic:
  // if first byte looks like priority (7E8/7E9 etc.), drop 3.
  if (bytes.length > 3 && bytes[0] === 0x07 && (bytes[1] & 0xE0) === 0xE0) {
    bytes = bytes.slice(3);
  }

  // ISO-TP PCI byte: single-frame = 0x0N (N = length), first-frame = 0x1N…
  if (bytes.length > 0) {
    const pci = bytes[0] & 0xF0;
    const len = bytes[0] & 0x0F;
    if (pci === 0x00 && len > 0 && len < bytes.length) {
      bytes = bytes.slice(1, 1 + len);
    } else if (pci === 0x10) {
      // First frame of multi-frame — the collapseIsotp already merged text lines;
      // total length is ((bytes[0]&0x0F)<<8) | bytes[1]
      const total = ((bytes[0] & 0x0F) << 8) | bytes[1];
      bytes = bytes.slice(2, 2 + total);
    }
  }

  // Negative response 7F <sid> <nrc>
  if (bytes[0] === 0x7F && bytes.length >= 3) {
    const sid = bytes[1].toString(16).toUpperCase().padStart(2, "0");
    const nrc = bytes[2].toString(16).toUpperCase().padStart(2, "0");
    const entry = nrcCatalog?.entries.find((e) => e.code.toUpperCase().replace("0X", "") === nrc);
    const isPending = nrc === "78";
    warnings.push(`NRC 7F ${sid} ${nrc}${entry ? ` ${entry.short} — ${entry.description}` : ""}`);
    return {
      cleanedHex: bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" "),
      bytes: [],
      status: isPending ? "pending" : "nrc",
      warnings,
      nrc: { sid, code: nrc, description: entry?.description },
    };
  }

  // Strip positive service byte and (for 22/31) the following identifier
  if (bytes.length > 0 && isPositiveServiceByte(bytes[0], sentCommand)) {
    bytes = bytes.slice(1);
    const svc = parseInt(sentCommand.trim().slice(0, 2), 16);
    if (svc === 0x22 && bytes.length >= 2) bytes = bytes.slice(2);          // strip DID
    else if (svc === 0x31 && bytes.length >= 3) bytes = bytes.slice(3);     // strip subfn + routine id
    else if (svc === 0x01 && bytes.length >= 1) bytes = bytes.slice(1);     // strip PID
    else if (svc === 0x09 && bytes.length >= 1) bytes = bytes.slice(1);     // strip PID
  }

  const cleanedHex = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  return { cleanedHex, bytes, status: "ok", warnings };
}

/* ---------------- Decoding ---------------- */

function readUint(bytes: number[], size: number, signed: boolean): number | null {
  if (bytes.length < size) return null;
  let v = 0;
  for (let i = 0; i < size; i++) v = (v << 8) | bytes[i];
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
    return [{ name: fn.name, value: bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" "), unit: null, description: fn.description ?? null }];
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
    case "bool":      raw = readUint(bytes, 1, false); value = raw !== null ? raw !== 0 : null; break;
    case "ascii":     value = String.fromCharCode(...bytes).replace(/[^\x20-\x7E]/g, "").trim(); break;
    case "hex":
    case "raw":
    default:          value = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  }
  if (raw !== null && value === null) {
    value = Math.round((raw * scale + offset) * 1000) / 1000;
    if (dec.map) {
      const key = `0x${raw.toString(16).toUpperCase().padStart(2, "0")}`;
      if (dec.map[key]) value = dec.map[key];
    }
  }
  return [{ name: fn.name, value, unit, description: fn.description ?? null }];
}

/* -------------- DTC parsing (Mode 03/07/0A) -------------- */

export function decodeDtcs(bytes: number[]): string[] {
  // Each DTC = 2 bytes. First 2 bits = system letter (P/C/B/U), next 2 = digit1, then 3 nibbles.
  const out: string[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const hi = bytes[i], lo = bytes[i + 1];
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
