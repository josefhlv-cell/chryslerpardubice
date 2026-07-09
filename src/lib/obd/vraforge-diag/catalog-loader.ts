/**
 * Loads Delphi-OBD catalog JSON files from /vraforge-diag/catalogs/ and
 * expands them into flat DiagFunction[] entries used by the VraForge Diag UI.
 *
 * Original catalogs (source of truth) live in vendor/delphi-obd/catalogs/,
 * a curated subset is served from public/vraforge-diag/catalogs/.
 */

import type {
  CatalogDid, CatalogRoutine, DiagFunction, OemCatalog, UdsNrcCatalog,
} from "./types";

const BASE = "/vraforge-diag/catalogs";

export type ProfileKey = "obd2" | "vag" | "stellantis";

interface ProfileSpec {
  key: ProfileKey;
  label: string;
  manufacturer: string;
  file: string;
  dtcFile?: string;
}

export const PROFILES: ProfileSpec[] = [
  { key: "obd2",       label: "Generic OBD-II (ISO 15031)",    manufacturer: "OBD2", file: "obd2-pids.json",  dtcFile: "dtc-iso-15031.json" },
  { key: "vag",        label: "VAG / VW / Škoda / Audi / Seat", manufacturer: "VAG",  file: "vw.json",         dtcFile: "dtc-vw.json" },
  { key: "stellantis", label: "Stellantis / Chrysler / Dodge / RAM / Jeep", manufacturer: "STLA", file: "stellantis.json", dtcFile: "dtc-stellantis.json" },
];

const cache = new Map<string, unknown>();

async function loadJson<T>(file: string): Promise<T> {
  if (cache.has(file)) return cache.get(file) as T;
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`Catalog ${file} HTTP ${res.status}`);
  const json = (await res.json()) as T;
  cache.set(file, json);
  return json;
}

export async function loadUdsNrcCatalog(): Promise<UdsNrcCatalog> {
  return loadJson<UdsNrcCatalog>("uds-nrc.json");
}

function normHex(v: string | undefined): string {
  return (v || "").replace(/^0x/i, "").toUpperCase();
}

/**
 * Convert a catalog DID + profile to an ASCII ELM327 command.
 *   OBD2 mode 01 → "01 XX"
 *   OEM (VAG/Stellantis) → "22 XX XX"
 */
function didToCommand(profile: ProfileKey, didHex: string): { command: string; didBytes: string } {
  const hex = normHex(didHex);
  if (profile === "obd2") {
    // OBD2 catalog encodes "0x000C" — last 2 hex chars = PID
    const pid = hex.padStart(4, "0").slice(-2);
    return { command: `01 ${pid}`, didBytes: pid };
  }
  const padded = hex.padStart(4, "0");
  return { command: `22 ${padded.slice(0, 2)} ${padded.slice(2, 4)}`, didBytes: padded };
}

function routineToCommand(idHex: string): { command: string; routineBytes: string } {
  const hex = normHex(idHex).padStart(4, "0");
  return { command: `31 01 ${hex.slice(0, 2)} ${hex.slice(2, 4)}`, routineBytes: hex };
}

const DESTRUCTIVE_HINTS = [/reset/i, /learn/i, /adaption/i, /adaptation/i, /clear/i, /erase/i, /test/i, /flash/i, /coding/i, /calibrat/i, /program/i];

function looksDestructive(name: string, category?: string): boolean {
  const s = `${name} ${category || ""}`;
  return DESTRUCTIVE_HINTS.some((r) => r.test(s));
}

function mapDid(profile: ProfileKey, manufacturer: string, sourceFile: string, ecuName: string | undefined, d: CatalogDid): DiagFunction {
  const { command, didBytes } = didToCommand(profile, d.did);
  return {
    id: `${profile}:did:${didBytes}:${ecuName || d.ecu_address || "x"}`,
    profile,
    manufacturer,
    ecu: ecuName,
    ecuAddress: d.ecu_address,
    kind: profile === "obd2" ? "obd2_pid" : "did",
    name: d.name,
    description: d.description,
    category: d.category || (profile === "obd2" ? "OBD-II PID" : "DID"),
    command,
    did: didBytes,
    decoder: d.decoder,
    sourceFile,
    originalName: d.name,
  };
}

function mapRoutine(profile: ProfileKey, manufacturer: string, sourceFile: string, ecuName: string | undefined, r: CatalogRoutine): DiagFunction {
  const { command, routineBytes } = routineToCommand(r.id);
  return {
    id: `${profile}:routine:${routineBytes}:${ecuName || r.ecu_address || "x"}`,
    profile,
    manufacturer,
    ecu: ecuName,
    ecuAddress: r.ecu_address,
    kind: "routine",
    name: r.name,
    description: r.description,
    category: r.category || "Servisní rutina",
    command,
    routineId: routineBytes,
    destructive: r.destructive ?? looksDestructive(r.name, r.category),
    sourceFile,
    originalName: r.name,
  };
}

const funcCache = new Map<ProfileKey, DiagFunction[]>();

export async function loadProfileFunctions(profile: ProfileKey): Promise<{
  spec: ProfileSpec;
  catalog: OemCatalog;
  functions: DiagFunction[];
}> {
  const spec = PROFILES.find((p) => p.key === profile);
  if (!spec) throw new Error(`Unknown profile ${profile}`);
  const catalog = await loadJson<OemCatalog>(spec.file);
  const cached = funcCache.get(profile);
  if (cached) return { spec, catalog, functions: cached };

  const ecuByAddr = new Map<string, string>();
  (catalog.ecus || []).forEach((e) => ecuByAddr.set(normHex(e.address), e.name));

  const fns: DiagFunction[] = [];
  (catalog.dids || []).forEach((d) => {
    const ecuName = d.ecu_address ? ecuByAddr.get(normHex(d.ecu_address)) : undefined;
    fns.push(mapDid(profile, catalog.manufacturer_key, spec.file, ecuName, d));
  });
  (catalog.routines || []).forEach((r) => {
    const ecuName = r.ecu_address ? ecuByAddr.get(normHex(r.ecu_address)) : undefined;
    fns.push(mapRoutine(profile, catalog.manufacturer_key, spec.file, ecuName, r));
  });

  // Built-in DTC scans (Mode 03 / 07 / 0A) — universal.
  if (profile === "obd2") {
    (["03", "07", "0A"] as const).forEach((mode) => {
      fns.push({
        id: `obd2:dtc:${mode}`,
        profile,
        manufacturer: "OBD2",
        kind: "dtc_scan",
        name: mode === "03" ? "Stored DTCs (Mode 03)"
             : mode === "07" ? "Pending DTCs (Mode 07)"
             : "Permanent DTCs (Mode 0A)",
        description: "Scan diagnostic trouble codes",
        category: "DTC",
        command: mode,
        sourceFile: spec.file,
        originalName: `Mode ${mode}`,
      });
    });
  }

  funcCache.set(profile, fns);
  return { spec, catalog, functions: fns };
}

export function clearCatalogCache() {
  cache.clear();
  funcCache.clear();
}
