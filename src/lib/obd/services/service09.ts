/**
 * Mode 09 — VIN. Podle Delphi-OBD OBD.Service09.pas.
 * Sestaví VIN ze složeného ISO-TP payloadu (49 02 01 XX XX … ASCII).
 *
 * Fallback: pokud Mode 09/PID 02 selže (některé Stellantis/FCA moduly
 * z něj nic nevydají), zkusíme UDS Service 22 DID F190 na 7E0,
 * což je oficiální WWH-OBD identifikace VIN a v praxi funguje spolehlivěji.
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
  source?: "mode09" | "uds_f190";
};

function sanitizeVin(chars: number[]): string {
  const filtered = chars.filter((b) => b !== 0x00);
  const s = String.fromCharCode(...filtered);
  return s.replace(/[^A-HJ-NPR-Z0-9]/gi, "").toUpperCase();
}

async function tryMode09(): Promise<VinReadResult | null> {
  const res = await elmQueue.send("0902", { timeoutMs: 5000 });
  const cleaned = cleanElmResponse(res.raw, "0902");
  if (res.status !== "ok") return null;
  const msg = parseIsoTp(cleaned);
  const bytes = msg.payload;
  if (bytes.length < 3 || bytes[0] !== 0x49 || bytes[1] !== 0x02) return null;
  const vin = sanitizeVin(bytes.slice(3));
  if (vin.length < 11) return null;
  return {
    status: "ok",
    vin,
    raw: res.raw,
    cleaned,
    warnings: msg.warnings,
    source: "mode09",
  };
}

async function tryUdsF190AtHeader(header: string): Promise<VinReadResult | null> {
  // VIN může být u Stellantis/FCA/Fiat v ECM, TCM, gateway/BSI. Zkoušíme více
  // read-only adres; pro multi-frame nastavíme i flow-control header na stejný request ID.
  await elmQueue.send(`ATSH${header}`, { timeoutMs: 1500 });
  await elmQueue.send(`ATFCSH${header}`, { timeoutMs: 1500 });
  const res = await elmQueue.send("22F190", { timeoutMs: 6500 });
  const cleaned = cleanElmResponse(res.raw, "22F190");
  if (res.status !== "ok") return null;
  const msg = parseIsoTp(cleaned);
  const bytes = msg.payload;
  // Očekáváme 62 F1 90 <17 ASCII>
  if (bytes.length < 4 || bytes[0] !== 0x62 || bytes[1] !== 0xf1 || bytes[2] !== 0x90) return null;
  const vin = sanitizeVin(bytes.slice(3));
  if (vin.length < 11) return null;
  return {
    status: "ok",
    vin,
    raw: res.raw,
    cleaned,
    warnings: msg.warnings,
    source: "uds_f190",
  };
}

async function tryUdsF190(): Promise<VinReadResult | null> {
  const headers = ["7E0", "7E1", "7E2", "793", "738", "7A2", "652"];
  try {
    for (const header of headers) {
      const result = await tryUdsF190AtHeader(header);
      if (result) return result;
    }
    return null;
  } finally {
    // Reset zpět na broadcast, aby další polling nebyl vázán na poslední ECU.
    try { await elmQueue.send("ATSH7DF", { timeoutMs: 1200 }); } catch { /* ignore */ }
    try { await elmQueue.send("ATFCSH7E0", { timeoutMs: 1200 }); } catch { /* ignore */ }
  }
}

export async function readVinMode09(): Promise<VinReadResult> {
  return elmQueue.runExclusive(async () => {
    await elmQueue.applyProfile("debug");
    const primary = await tryMode09();
    if (primary) return primary;
    const fallback = await tryUdsF190();
    if (fallback) return fallback;
    // Vrať cokoli aspoň informativního
    const res = await elmQueue.send("0902", { timeoutMs: 3000 });
    const cleaned = cleanElmResponse(res.raw, "0902");
    return {
      status: "invalid_response",
      raw: res.raw,
      cleaned,
      warnings: ["Ani Mode 09 ani UDS 22 F190 nevrátily platný VIN."],
    };
  });
}
