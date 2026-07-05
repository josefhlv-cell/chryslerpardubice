/**
 * OBD služby 03 (stored), 07 (pending), 0A (permanent) — podle Delphi-OBD.
 * Každá služba:
 *   1) pošle svůj příkaz přes elm-queue.send()
 *   2) očekává pozitivní marker (43 / 47 / 4A)
 *   3) předá payload dtc-decoder.decodeDtcPayload()
 *   4) vrátí strukturu { service, label, status, raw, cleaned, codes, warnings }
 */
import { elmQueue } from "@/lib/obd/adapter/elm-queue";
import { detectElmError, type ElmStatus } from "@/lib/obd/adapter/elm-errors";
import { cleanElmResponse } from "@/lib/obd/protocol/response-cleaner";
import { parseIsoTp } from "@/lib/obd/protocol/isotp-parser";
import { decodeDtcPayload, type DecodedDtc } from "./dtc-decoder";

export type DtcService = "03" | "07" | "0A";
export type DtcLabel = "stored" | "pending" | "permanent";

export type DtcResult = {
  service: DtcService;
  label: DtcLabel;
  status: ElmStatus;
  raw: string;
  cleaned: string;
  positiveMarker?: string;
  codes: DecodedDtc[];
  warnings: string[];
};

const CFG: Record<DtcService, { label: DtcLabel; command: string; marker: number }> = {
  "03": { label: "stored", command: "03", marker: 0x43 },
  "07": { label: "pending", command: "07", marker: 0x47 },
  "0A": { label: "permanent", command: "0A", marker: 0x4a },
};

async function runDtcService(service: DtcService): Promise<DtcResult> {
  const cfg = CFG[service];
  const warnings: string[] = [];
  const res = await elmQueue.send(cfg.command, { timeoutMs: 5000 });
  const cleaned = cleanElmResponse(res.raw, cfg.command);

  if (res.status !== "ok") {
    return {
      service,
      label: cfg.label,
      status: res.status,
      raw: res.raw,
      cleaned,
      codes: [],
      warnings,
    };
  }

  const errFromClean = detectElmError(cleaned);
  if (errFromClean) {
    return {
      service,
      label: cfg.label,
      status: errFromClean,
      raw: res.raw,
      cleaned,
      codes: [],
      warnings,
    };
  }

  const msg = parseIsoTp(cleaned);
  warnings.push(...msg.warnings);
  const bytes = msg.payload;

  if (bytes.length === 0 || bytes[0] !== cfg.marker) {
    return {
      service,
      label: cfg.label,
      status: "invalid_response",
      raw: res.raw,
      cleaned,
      codes: [],
      warnings: [...warnings, `Missing positive marker 0x${cfg.marker.toString(16)}`],
    };
  }

  const positiveMarker = cfg.marker.toString(16).padStart(2, "0").toUpperCase();
  const payload = bytes.slice(1);
  const decoded = decodeDtcPayload(payload);
  warnings.push(...decoded.warnings);

  if (decoded.codes.length === 0 && payload.length > 0) {
    warnings.push("ECU vrátila pozitivní DTC odpověď, ale parser nerozpoznal žádný kód.");
  }

  return {
    service,
    label: cfg.label,
    status: "ok",
    raw: res.raw,
    cleaned,
    positiveMarker,
    codes: decoded.codes,
    warnings,
  };
}

export const readStoredDtcs = () => runDtcService("03");
export const readPendingDtcs = () => runDtcService("07");
export const readPermanentDtcs = () => runDtcService("0A");
