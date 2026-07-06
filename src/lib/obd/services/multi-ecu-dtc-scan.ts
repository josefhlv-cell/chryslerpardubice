/**
 * Multi-ECU DTC scan pro Stellantis / FCA (Chrysler / Dodge / Jeep / RAM / Fiat / Lancia / Alfa).
 *
 * Vzor převzat z Delphi-OBD (catalogs/stellantis.json — 157 ECU adres).
 * Iterujeme přes primární 11-bit CAN request-ID a pro každou jednotku
 * zavoláme Mode 03 (stored). Odpověď je izolovaná přes ATCRA filtr,
 * aby se do parsingu nezamíchaly cizí ECU rámce.
 *
 * Read-only. Žádné zápisy, žádná session, žádný security access.
 * Chybějící / nedostupné ECU vrací status "no_data" a scan pokračuje dál.
 */
import { elmQueue } from "@/lib/obd/adapter/elm-queue";
import { detectElmError, type ElmStatus } from "@/lib/obd/adapter/elm-errors";
import { cleanElmResponse } from "@/lib/obd/protocol/response-cleaner";
import { parseIsoTp } from "@/lib/obd/protocol/isotp-parser";
import { decodeDtcPayload, decodeDtcPair, type DecodedDtc } from "./dtc-decoder";

export type EcuTarget = {
  address: string;   // 11-bit request ID, např. "7E0"
  name: string;
  commonName: string;
};

export type EcuDtcResult = {
  ecu: EcuTarget;
  status: ElmStatus;
  codes: DecodedDtc[];
  raw: string;
  warnings: string[];
};

export type MultiEcuDtcScan = {
  totalEcusProbed: number;
  ecusResponding: number;
  ecusWithCodes: number;
  totalCodes: number;
  results: EcuDtcResult[];
  startedAt: string;
  finishedAt: string;
};

/**
 * Základní Stellantis / FCA sada ECU dostupná přes 11-bit CAN.
 * (Kompletní 157-položkový seznam je v Delphi-OBD stellantis.json,
 *  ale mnoho ECU je na jiných sběrnicích / ext. adresování; scan by
 *  se zbytečně natáhl. Zde jsou reálně dosažitelné ECU přes ELM327.)
 */
export const STELLANTIS_PRIMARY_ECUS: EcuTarget[] = [
  { address: "7E0", name: "engine", commonName: "Engine ECU (ECM)" },
  { address: "7E1", name: "trans_legacy", commonName: "Transmission (starší FCA)" },
  { address: "7E2", name: "tcm_zf", commonName: "TCM ZF 8HP/9HP" },
  { address: "7E3", name: "tcase", commonName: "Transfer case (Jeep 4WD)" },
  { address: "760", name: "abs", commonName: "ABS / ESP" },
  { address: "731", name: "srs", commonName: "SRS / Airbag" },
  { address: "793", name: "gateway", commonName: "CAN Gateway" },
  { address: "7A0", name: "cluster_fca", commonName: "FCA Instrument Cluster" },
  { address: "7A2", name: "bcm_fca", commonName: "FCA Body Computer Module" },
  { address: "652", name: "bsi", commonName: "PSA/Fiat BSI" },
  { address: "658", name: "cluster_psa", commonName: "PSA Instrument Cluster" },
  { address: "738", name: "cgw", commonName: "Central Gateway (nové)" },
  { address: "73A", name: "instrument", commonName: "Uconnect 5 Cluster" },
  { address: "728", name: "adas_master", commonName: "ADAS coordinator" },
  { address: "72A", name: "front_radar", commonName: "Forward Facing Radar" },
  { address: "729", name: "front_camera", commonName: "Forward Facing Camera" },
  { address: "710", name: "abs_alt", commonName: "ABS (alt.)" },
  { address: "712", name: "eps", commonName: "EPS — Electric Power Steering" },
  { address: "713", name: "epb", commonName: "EPB — Electric Park Brake" },
  { address: "714", name: "tpms", commonName: "TPMS" },
];

export const STELLANTIS_QUICK_ECUS: EcuTarget[] = STELLANTIS_PRIMARY_ECUS.filter((ecu) =>
  ["7E0", "7E1", "7E2", "760", "731", "793", "7A2", "652"].includes(ecu.address),
);

async function readDtcFromEcu(ecu: EcuTarget): Promise<EcuDtcResult> {
  const warnings: string[] = [];
  const reqHex = parseInt(ecu.address, 16);
  const respHex = (reqHex + 8).toString(16).toUpperCase().padStart(3, "0");

  const setHeader = await elmQueue.send(`ATSH${ecu.address}`, { timeoutMs: 550, commandType: "full_dtc_scan" });
  if (setHeader.status === "adapter_error") {
    return { ecu, status: setHeader.status, codes: [], raw: setHeader.raw, warnings };
  }
  await elmQueue.send(`ATFCSH${ecu.address}`, { timeoutMs: 550, commandType: "full_dtc_scan" }).catch(() => undefined);
  await elmQueue.send(`ATCRA${respHex}`, { timeoutMs: 550, commandType: "full_dtc_scan" });

  // Mode 03 (stored DTC). Timeout 2200ms je dost pro CAN request+odpověď
  // s ATST64; když ECU nereaguje, dostaneme rychle "no_data".
  let res = await elmQueue.send("03", { timeoutMs: 1600, commandType: "raw_dtc_03" });
  const cleaned = cleanElmResponse(res.raw, "03");

  // "adapter_error" (STOPPED / BUFFER FULL) znamená, že adaptér ještě
  // nebyl klidný; UDS fallback by ho jen zahltil. Nech ho dýchat a hlas
  // no_data — další ECU se probou samostatně.
  if (res.status === "adapter_error" || res.status === "no_data" || res.status === "timeout") {
    return { ecu, status: res.status, codes: [], raw: res.raw, warnings };
  }

  if (res.status !== "ok") {
    // Karosářské / gateway jednotky často nepodporují OBD Mode 03, ale podporují
    // UDS Service 19 ReadDTCInformation. Zkusíme read-only fallback 19 02 FF.
    res = await elmQueue.send("1902FF", { timeoutMs: 1800, commandType: "full_dtc_scan" });
    return decodeUds19Result(ecu, res.raw, res.status, warnings);
  }
  const elmErr = detectElmError(cleaned);
  if (elmErr) {
    if (elmErr === "no_data" || elmErr === "timeout" || elmErr === "adapter_error") {
      return { ecu, status: elmErr, codes: [], raw: res.raw, warnings };
    }
    res = await elmQueue.send("1902FF", { timeoutMs: 1800, commandType: "full_dtc_scan" });
    return decodeUds19Result(ecu, res.raw, res.status, warnings);
  }

  const msg = parseIsoTp(cleaned);
  warnings.push(...msg.warnings);
  const bytes = msg.payload;
  if (bytes.length === 0 || bytes[0] !== 0x43) {
    return {
      ecu,
      status: "invalid_response",
      codes: [],
      raw: res.raw,
      warnings: [...warnings, "Missing positive marker 0x43"],
    };
  }
  const decoded = decodeDtcPayload(bytes.slice(1));
  warnings.push(...decoded.warnings);
  return { ecu, status: "ok", codes: decoded.codes, raw: res.raw, warnings };
}

function decodeUds19Result(
  ecu: EcuTarget,
  raw: string,
  status: ElmStatus,
  baseWarnings: string[],
): EcuDtcResult {
  const warnings = [...baseWarnings];
  if (status !== "ok") return { ecu, status, codes: [], raw, warnings };
  const cleaned = cleanElmResponse(raw, "1902FF");
  const elmErr = detectElmError(cleaned);
  if (elmErr) return { ecu, status: elmErr, codes: [], raw, warnings };
  const msg = parseIsoTp(cleaned);
  warnings.push(...msg.warnings);
  const bytes = msg.payload;
  if (bytes.length < 3 || bytes[0] !== 0x59 || bytes[1] !== 0x02) {
    return { ecu, status: "invalid_response", codes: [], raw, warnings: [...warnings, "Missing UDS 59 02 marker"] };
  }

  // 59 02 <availabilityMask> [DTC_H DTC_M DTC_L status]...
  const data = bytes.slice(3);
  const codes: DecodedDtc[] = [];
  const seen = new Set<string>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const dec = decodeDtcPair(data[i], data[i + 1]);
    if (!dec) continue;
    const failureType = data[i + 2].toString(16).padStart(2, "0").toUpperCase();
    const code = `${dec.code}-${failureType}`;
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push({ ...dec, code, raw: `${dec.raw} ${failureType}` });
  }
  return { ecu, status: "ok", codes, raw, warnings };
}

export async function runMultiEcuDtcScanUnlocked(
  ecus: EcuTarget[] = STELLANTIS_PRIMARY_ECUS,
): Promise<MultiEcuDtcScan> {
  await elmQueue.applyProfile("debug", true);
  await elmQueue.send("ATST32", { timeoutMs: 550, commandType: "full_dtc_scan" }).catch(() => undefined);
  const startedAt = new Date().toISOString();
  const results: EcuDtcResult[] = [];

  for (const ecu of ecus) {
    try {
      results.push(await readDtcFromEcu(ecu));
    } catch (e) {
      results.push({
        ecu,
        status: "error",
        codes: [],
        raw: String((e as Error)?.message ?? e),
        warnings: [],
      });
    }
  }

  // reset filtrů, aby další scan / polling nezůstal navázaný na poslední ECU
  try {
    await elmQueue.send("ATAR", { timeoutMs: 650, commandType: "full_dtc_scan" });
    await elmQueue.send("ATSH7DF", { timeoutMs: 650, commandType: "full_dtc_scan" });
    await elmQueue.send("ATFCSH7E0", { timeoutMs: 650, commandType: "full_dtc_scan" });
  } catch {
    /* ignore */
  }

  const responding = results.filter((r) => r.status === "ok").length;
  const withCodes = results.filter((r) => r.status === "ok" && r.codes.length > 0).length;
  const totalCodes = results.reduce((sum, r) => sum + r.codes.length, 0);

  return {
    totalEcusProbed: results.length,
    ecusResponding: responding,
    ecusWithCodes: withCodes,
    totalCodes,
    results,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

export async function runMultiEcuDtcScan(
  ecus: EcuTarget[] = STELLANTIS_PRIMARY_ECUS,
): Promise<MultiEcuDtcScan> {
  return elmQueue.runExclusive(async () => {
    return runMultiEcuDtcScanUnlocked(ecus);
  });
}
