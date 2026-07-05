/**
 * UDS parser podle Delphi-OBD OBD.Protocol.UDS.pas.
 *
 * Pozitivní odpověď:  SID + 0x40 (např. 22 -> 62)
 * Negativní odpověď:  7F <SID> <NRC>
 *
 * NRC mapping (základní):
 *   0x10 generalReject
 *   0x11 serviceNotSupported
 *   0x12 subFunctionNotSupported
 *   0x13 incorrectMessageLengthOrInvalidFormat
 *   0x22 conditionsNotCorrect
 *   0x31 requestOutOfRange
 *   0x33 securityAccessDenied
 *   0x78 requestCorrectlyReceived-ResponsePending
 *   0x7E subFunctionNotSupportedInActiveSession
 *   0x7F serviceNotSupportedInActiveSession
 */
import { parseIsoTp } from "./isotp-parser";
import { cleanElmResponse } from "./response-cleaner";
import type { ElmStatus } from "@/lib/obd/adapter/elm-errors";

export type UdsResponse = {
  status: ElmStatus;
  requestSid: number;         // např. 0x22
  positiveMarker?: string;    // "62 F1 90" apod.
  payload: number[];          // payload po pozitivním markeru (u 22: data po DID)
  did?: string;               // u služby 22: 4-hex ID
  negativeCode?: number;      // NRC pokud 7F
  negativeName?: string;
  raw: string;
  cleaned: string;
  warnings: string[];
};

const NRC_MAP: Record<number, { status: ElmStatus; name: string }> = {
  0x10: { status: "error", name: "generalReject" },
  0x11: { status: "unsupported", name: "serviceNotSupported" },
  0x12: { status: "unsupported", name: "subFunctionNotSupported" },
  0x13: { status: "invalid_response", name: "incorrectMessageLengthOrInvalidFormat" },
  0x22: { status: "error", name: "conditionsNotCorrect" },
  0x31: { status: "unsupported", name: "requestOutOfRange" },
  0x33: { status: "security_denied", name: "securityAccessDenied" },
  0x78: { status: "response_pending", name: "requestCorrectlyReceived-ResponsePending" },
  0x7e: { status: "unsupported", name: "subFunctionNotSupportedInActiveSession" },
  0x7f: { status: "unsupported", name: "serviceNotSupportedInActiveSession" },
};

/**
 * Zparsuj UDS odpověď.
 *
 * @param raw          celá raw odpověď adaptéru
 * @param requestSid   SID požadavku (např. 0x22, 0x10)
 * @param requestBytes ostatní bajty požadavku pro validaci pozitivního markeru
 *                     (např. pro 22 F1 90 předáme [0xF1, 0x90])
 */
export function parseUds(raw: string, requestSid: number, requestBytes: number[] = []): UdsResponse {
  const cleaned = cleanElmResponse(raw);
  const warnings: string[] = [];

  if (!cleaned) {
    return {
      status: "no_data",
      requestSid,
      payload: [],
      raw,
      cleaned,
      warnings: ["Empty response"],
    };
  }

  const msg = parseIsoTp(cleaned);
  warnings.push(...msg.warnings);
  const bytes = msg.payload;

  if (bytes.length === 0) {
    return { status: "no_data", requestSid, payload: [], raw, cleaned, warnings };
  }

  // Negativní odpověď 7F <SID> <NRC>
  if (bytes[0] === 0x7f) {
    const respondedSid = bytes[1];
    const nrc = bytes[2];
    const info = NRC_MAP[nrc] ?? { status: "error" as ElmStatus, name: `NRC 0x${nrc.toString(16)}` };
    if (respondedSid !== requestSid) {
      warnings.push(`UDS negative response SID mismatch: expected 0x${requestSid.toString(16)}, got 0x${respondedSid.toString(16)}`);
    }
    return {
      status: info.status,
      requestSid,
      payload: [],
      negativeCode: nrc,
      negativeName: info.name,
      raw,
      cleaned,
      warnings,
    };
  }

  // Pozitivní odpověď SID + 0x40
  const expectedMarker = (requestSid + 0x40) & 0xff;
  if (bytes[0] !== expectedMarker) {
    warnings.push(`UDS positive marker mismatch: expected 0x${expectedMarker.toString(16)}, got 0x${bytes[0].toString(16)}`);
    return { status: "invalid_response", requestSid, payload: bytes, raw, cleaned, warnings };
  }

  // Zkontroluj sub-bajty (např. DID pro službu 22)
  let payloadStart = 1;
  for (let i = 0; i < requestBytes.length; i++) {
    if (bytes[1 + i] !== requestBytes[i]) {
      warnings.push(`UDS sub-byte ${i} mismatch: expected 0x${requestBytes[i].toString(16)}, got 0x${(bytes[1 + i] ?? 0).toString(16)}`);
      return { status: "invalid_response", requestSid, payload: bytes.slice(1), raw, cleaned, warnings };
    }
    payloadStart += 1;
  }

  const positiveMarker = bytes
    .slice(0, payloadStart)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");

  const did =
    requestSid === 0x22 && requestBytes.length >= 2
      ? (requestBytes[0].toString(16).padStart(2, "0") + requestBytes[1].toString(16).padStart(2, "0")).toUpperCase()
      : undefined;

  return {
    status: "ok",
    requestSid,
    positiveMarker,
    payload: bytes.slice(payloadStart),
    did,
    raw,
    cleaned,
    warnings,
  };
}
