/**
 * Mode 09 — VIN. Podle Delphi-OBD OBD.Service09.pas.
 * Sestaví VIN ze složeného ISO-TP payloadu (49 02 01 XX XX … ASCII).
 */
import { elmQueue } from "@/lib/obd/adapter/elm-queue";
import { cleanElmResponse } from "@/lib/obd/protocol/response-cleaner";
import { parseIsoTp } from "@/lib/obd/protocol/isotp-parser";
import type { ElmStatus } from "@/lib/obd/adapter/elm-errors";

export type VinReadResult = {
  status: ElmStatus;
  vin?: string;
  raw: string;
  cleaned: string;
  warnings: string[];
};

export async function readVinMode09(): Promise<VinReadResult> {
  return elmQueue.runExclusive(async () => {
    await elmQueue.applyProfile("debug");
    const res = await elmQueue.send("0902", { timeoutMs: 5000 });
    const cleaned = cleanElmResponse(res.raw, "0902");
    if (res.status !== "ok") {
      return { status: res.status, raw: res.raw, cleaned, warnings: [] };
    }
    const msg = parseIsoTp(cleaned);
    const bytes = msg.payload;
    // Očekáváme 49 02 01 <17 ASCII>
    if (bytes.length < 3 || bytes[0] !== 0x49 || bytes[1] !== 0x02) {
      return { status: "invalid_response", raw: res.raw, cleaned, warnings: msg.warnings };
    }
    const vinBytes = bytes.slice(3).filter((b) => b !== 0x00);
    const vin = String.fromCharCode(...vinBytes).replace(/[^A-HJ-NPR-Z0-9]/gi, "");
    if (vin.length < 11) {
      return { status: "invalid_response", raw: res.raw, cleaned, warnings: msg.warnings };
    }
    return { status: "ok", vin, raw: res.raw, cleaned, warnings: msg.warnings };
  });
}
