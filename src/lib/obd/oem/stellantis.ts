/**
 * Stellantis / FCA / Chrysler / Dodge / Jeep / RAM OEM profil.
 * Read-only. Založeno na Delphi-OBD OBD.OEM.Stellantis.pas + catalogs/stellantis.json.
 *
 * BEZPEČNOST:
 *   - žádné 2E WriteDataByIdentifier
 *   - žádné 31 RoutineControl pro zápisy
 *   - žádné 27 SecurityAccess
 *   - žádné 34/36/37 flashing
 *   - žádné Proxi coding (viz stellantis-proxi.ts — computeChecksum() throws)
 */
import { elmQueue } from "@/lib/obd/adapter/elm-queue";
import { cleanElmResponse, hexLineToBytes } from "@/lib/obd/protocol/response-cleaner";
import { parseUds } from "@/lib/obd/protocol/uds-parser";
import type { ElmStatus } from "@/lib/obd/adapter/elm-errors";
import { registerOemProfile, type OemDidDef, type OemProfile } from "./OemRegistry";

/* ------------------ VIN WMI ------------------ */

const STELLANTIS_WMI = [
  "1C3", "1C4", "1C6",
  "2C3", "2C4",
  "3C3", "3C4", "3C6",
  "1D4", "1D7", "2D4", "2D8", "3D4",
  "1J4", "1J8",
  "1RR",
  "ZFA", "ZFB", "ZFC",
  "9BD",
  "ZAR", "ZAM",
  "VF3", "VF7",
  "W0L", "VXR",
];

export function isStellantisVin(vin: string): boolean {
  if (!vin || vin.length < 3) return false;
  const wmi = vin.substring(0, 3).toUpperCase();
  return STELLANTIS_WMI.includes(wmi);
}

/* ------------------ DID katalog ------------------ */

const BASIC_DIDS: OemDidDef[] = [
  { did: "F190", cmd: "22 F1 90", label: "VIN", category: "basic" },
  { did: "F198", cmd: "22 F1 98", label: "Last workshop code", category: "basic" },
  { did: "F199", cmd: "22 F1 99", label: "Programming date", category: "basic" },
  { did: "F1A8", cmd: "22 F1 A8", label: "FCA calibration ID", category: "basic" },
  { did: "F187", cmd: "22 F1 87", label: "Spare part number", category: "basic" },
  { did: "F188", cmd: "22 F1 88", label: "ECU part number", category: "basic" },
  { did: "1A02", cmd: "22 1A 02", label: "Mileage", category: "basic" },
  { did: "1B01", cmd: "22 1B 01", label: "Fuel level", category: "basic" },
  { did: "1B02", cmd: "22 1B 02", label: "Engine run time", category: "basic" },
  { did: "1B03", cmd: "22 1B 03", label: "Battery voltage", category: "basic" },
];

const ENGINE_LIVE_DIDS: OemDidDef[] = [
  // Základní engine (7E0) — Service 22
  { did: "4000", cmd: "22 40 00", label: "Engine RPM", category: "engine" },
  { did: "4001", cmd: "22 40 01", label: "Engine torque", category: "engine" },
  { did: "4004", cmd: "22 40 04", label: "Coolant", category: "engine" },
  { did: "1B04", cmd: "22 1B 04", label: "Coolant temp", category: "engine" },
  { did: "4005", cmd: "22 40 05", label: "Engine oil temp", category: "engine" },
  { did: "4007", cmd: "22 40 07", label: "Oil pressure", category: "engine" },
  { did: "4009", cmd: "22 40 09", label: "MAF", category: "engine" },
  { did: "400B", cmd: "22 40 0B", label: "Boost", category: "engine" },
  { did: "400E", cmd: "22 40 0E", label: "Lambda B1", category: "engine" },
  { did: "4014", cmd: "22 40 14", label: "Fuel rail pressure", category: "engine" },
  { did: "4017", cmd: "22 40 17", label: "Ignition advance", category: "engine" },
  { did: "4019", cmd: "22 40 19", label: "EGR position", category: "engine" },
  { did: "4026", cmd: "22 40 26", label: "Battery voltage (engine bus)", category: "engine" },
  { did: "402E", cmd: "22 40 2E", label: "Evap purge", category: "engine" },
  // DPF / diesel — kompletní blok podle Delphi-OBD stellantis catalog
  { did: "4048", cmd: "22 40 48", label: "DPF soot load [%]", category: "engine" },
  { did: "4049", cmd: "22 40 49", label: "DPF regen count", category: "engine" },
  { did: "404A", cmd: "22 40 4A", label: "Distance since DPF regen [km]", category: "engine" },
  { did: "404B", cmd: "22 40 4B", label: "DPF active regen (bool)", category: "engine" },
  { did: "404C", cmd: "22 40 4C", label: "DEF (AdBlue) level", category: "engine" },
];

/* ------------------ Session ------------------ */

export type SessionResult = {
  sessionType: "extended";
  command: string;
  status: ElmStatus;
  raw: string;
  cleaned: string;
  warnings: string[];
};

export async function startExtendedSession(): Promise<SessionResult> {
  const res = await elmQueue.send("10 03", { timeoutMs: 4000 });
  const cleaned = cleanElmResponse(res.raw, "10 03");
  const uds = parseUds(res.raw, 0x10, [0x03]);
  return {
    sessionType: "extended",
    command: "10 03",
    status: uds.status,
    raw: res.raw,
    cleaned,
    warnings: uds.warnings,
  };
}

/* ------------------ DID read ------------------ */

export type DidResult = {
  did: string;
  command: string;
  status: ElmStatus;
  raw: string;
  cleaned: string;
  positiveMarker?: string;
  payload: string;                // hex string
  decoded?: string;
  value?: unknown;
  warnings: string[];
};

async function readDid(def: OemDidDef): Promise<DidResult> {
  const res = await elmQueue.send(def.cmd, { timeoutMs: 4500 });
  const cleaned = cleanElmResponse(res.raw, def.cmd);
  const b0 = parseInt(def.did.substring(0, 2), 16);
  const b1 = parseInt(def.did.substring(2, 4), 16);
  const uds = parseUds(res.raw, 0x22, [b0, b1]);

  const payloadHex = uds.payload
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");

  let decoded: string | undefined;
  let value: unknown;
  const warnings = [...uds.warnings];

  if (uds.status === "ok") {
    const dec = decodeDidValue(def.did, uds.payload);
    decoded = dec.decoded;
    value = dec.value;
    if (dec.warning) warnings.push(dec.warning);
  }

  return {
    did: def.did,
    command: def.cmd,
    status: uds.status,
    raw: res.raw,
    cleaned,
    positiveMarker: uds.positiveMarker,
    payload: payloadHex,
    decoded,
    value,
    warnings,
  };
}

export { readDid as readStellantisDid };

/* ------------------ decoder ------------------ */

function toAscii(bytes: number[]): string {
  return String.fromCharCode(...bytes.filter((b) => b >= 0x20 && b < 0x7f));
}

function isPrintableAscii(bytes: number[]): boolean {
  if (bytes.length === 0) return false;
  return bytes.every((b) => (b >= 0x20 && b < 0x7f) || b === 0x00);
}

function decodeDidValue(
  did: string,
  payload: number[],
): { decoded?: string; value?: unknown; warning?: string } {
  if (payload.length === 0) return { warning: "Prázdný payload" };

  switch (did.toUpperCase()) {
    case "F190": {
      const vin = toAscii(payload).replace(/[^A-HJ-NPR-Z0-9]/gi, "");
      return { decoded: vin, value: vin };
    }
    case "F199": {
      if (payload.length < 3) return { warning: "F199: payload < 3 B" };
      const [yy, mm, dd] = payload;
      const decoded = `20${yy.toString(16).padStart(2, "0")}-${mm.toString(16).padStart(2, "0")}-${dd.toString(16).padStart(2, "0")}`;
      return { decoded, value: decoded };
    }
    case "1A02": {
      if (payload.length < 3) return { warning: "1A02: payload < 3 B" };
      const km = (payload[0] << 16) | (payload[1] << 8) | payload[2];
      return { decoded: `${km} km`, value: km };
    }
    case "1B01": {
      const pct = payload[0];
      return { decoded: `${pct} %`, value: pct };
    }
    case "1B02": {
      if (payload.length < 4) return { warning: "1B02: payload < 4 B" };
      const s = (payload[0] << 24) | (payload[1] << 16) | (payload[2] << 8) | payload[3];
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return { decoded: `${s} s (${h} h ${m} min)`, value: s };
    }
    case "1B03": {
      if (payload.length < 2) return { warning: "1B03: payload < 2 B" };
      const v = ((payload[0] << 8) | payload[1]) / 1000;
      return { decoded: `${v.toFixed(3)} V`, value: v };
    }
    case "F187":
    case "F188":
    case "F1A8":
    case "F198": {
      if (isPrintableAscii(payload)) {
        const s = toAscii(payload);
        return { decoded: s, value: s };
      }
      const hex = payload.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
      return { decoded: hex, value: hex };
    }
    default: {
      // Engine live DIDy — bez ověřeného vzorce, vracíme raw
      const hex = payload.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
      return {
        decoded: hex,
        value: hex,
        warning: "Dekódování hodnoty není ověřené pro tento model",
      };
    }
  }
}

/* ------------------ Scans ------------------ */

export type StellantisBasicScan = {
  manufacturer: "STLA";
  displayName: string;
  vinMatched: boolean;
  session: SessionResult;
  workshopProbe?: DidResult;
  dids: DidResult[];
  warnings: string[];
};

export type StellantisEngineLiveScan = {
  manufacturer: "STLA";
  dids: DidResult[];
  warnings: string[];
};

async function scanBasicInfo(): Promise<StellantisBasicScan> {
  return elmQueue.runExclusive(async () => {
    await elmQueue.applyProfile("debug");
    await elmQueue.send("0100", { timeoutMs: 4000 });
    const session = await startExtendedSession();
    // F198 probe — 7F 22 31 je non-fatal
    const workshopProbe = await readDid(BASIC_DIDS.find((d) => d.did === "F198")!);
    const rest = BASIC_DIDS.filter((d) => d.did !== "F198");
    const dids: DidResult[] = [];
    for (const def of rest) {
      dids.push(await readDid(def));
    }
    const warnings: string[] = [];
    if (workshopProbe.status === "unsupported") {
      warnings.push("F198 workshop probe: requestOutOfRange (očekávané u FCA).");
    }
    return {
      manufacturer: "STLA",
      displayName: "Stellantis / FCA / Chrysler / Dodge / Jeep / RAM",
      vinMatched: true,
      session,
      workshopProbe,
      dids,
      warnings,
    };
  });
}

async function scanEngineLive(): Promise<StellantisEngineLiveScan> {
  return elmQueue.runExclusive(async () => {
    await elmQueue.applyProfile("debug");
    await elmQueue.send("0100", { timeoutMs: 4000 });
    await startExtendedSession();
    const dids: DidResult[] = [];
    for (const def of ENGINE_LIVE_DIDS) {
      dids.push(await readDid(def));
    }
    return { manufacturer: "STLA", dids, warnings: [] };
  });
}

/* ------------------ Registrace ------------------ */

export const stellantisProfile: OemProfile = {
  manufacturerKey: "STLA",
  displayName: "Stellantis / FCA / Chrysler / Dodge / Jeep / RAM",
  applicableToVin: isStellantisVin,
  getBasicDids: () => [...BASIC_DIDS],
  getEngineLiveDids: () => [...ENGINE_LIVE_DIDS],
  getSafeCapabilities: () => [
    "10 03 extended session",
    "22 read-by-identifier (basic + engine)",
    "03 / 07 / 0A DTC read",
    "09 VIN",
  ],
  scanBasicInfo,
  scanEngineLive,
};

registerOemProfile(stellantisProfile);

// re-export _ pro utility import v Admin UI
export { hexLineToBytes };
