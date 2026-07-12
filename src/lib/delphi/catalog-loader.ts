/**
 * Loads Delphi-OBD catalog JSON files from /vraforge-diag/catalogs/ and
 * expands them into flat DiagFunction[] entries used by the VraForge Diag UI.
 *
 * Uses manifest.json to discover the full brand list (46+ manufacturers).
 * Source of truth: vendor/delphi-obd/catalogs/ (mirrored into public/).
 */

import type {
  CatalogDid, CatalogRoutine, DiagFunction, OemCatalog,
  UdsNrcCatalog, CatalogManifest, BrandManifestEntry,
} from "./types";

const BASE = "/vraforge-diag/catalogs";

const jsonCache = new Map<string, unknown>();

async function loadJson<T>(file: string): Promise<T> {
  if (jsonCache.has(file)) return jsonCache.get(file) as T;
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`Catalog ${file} HTTP ${res.status}`);
  const json = (await res.json()) as T;
  jsonCache.set(file, json);
  return json;
}

export async function loadUdsNrcCatalog(): Promise<UdsNrcCatalog> {
  return loadJson<UdsNrcCatalog>("uds-nrc.json");
}

let manifestPromise: Promise<CatalogManifest> | null = null;
export function loadManifest(): Promise<CatalogManifest> {
  if (!manifestPromise) manifestPromise = loadJson<CatalogManifest>("manifest.json");
  return manifestPromise;
}

/** Return brands sorted by display_name. Includes an "OBD2" generic entry first. */
export async function listBrands(): Promise<BrandManifestEntry[]> {
  const m = await loadManifest();
  const generic = m.generic || [];
  const brands = m.brands || [];
  return [...generic, ...brands];
}

/** Find brand by VIN (first 3 chars = WMI). Falls back to null. */
export async function findBrandForVin(vin?: string | null): Promise<BrandManifestEntry | null> {
  if (!vin || vin.length < 3) return null;
  const wmi = vin.slice(0, 3).toUpperCase();
  const m = await loadManifest();
  return m.brands.find((b) => (b.wmis || []).includes(wmi)) || null;
}

function normHex(v: string | undefined): string {
  return (v || "").replace(/^0x/i, "").toUpperCase();
}

/**
 * Build an ELM ASCII command for a DID depending on the brand type.
 *   OBD2 mode 01/09 → "01 XX"
 *   OEM UDS         → "22 XX XX"
 * For live_pids with explicit mode field (e.g. "service01"), we honour the mode.
 */
function didToCommand(isOem: boolean, d: CatalogDid): { command: string; didBytes: string } {
  const hex = normHex(d.did);
  // Live PID with explicit mode
  const mode = (d.mode || "").toLowerCase();
  if (mode.startsWith("service") || mode === "01" || mode === "09" || mode === "22") {
    if (mode === "service01" || mode === "01") {
      const pid = hex.padStart(4, "0").slice(-2);
      return { command: `01 ${pid}`, didBytes: pid };
    }
    if (mode === "service09" || mode === "09") {
      const pid = hex.padStart(4, "0").slice(-2);
      return { command: `09 ${pid}`, didBytes: pid };
    }
  }
  if (!isOem) {
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

function actuatorToCommand(idHex: string): { command: string; routineBytes: string } {
  // Actuator tests are implemented as RoutineControl start (31 01) with subfunction 0F..
  const hex = normHex(idHex).padStart(4, "0");
  return { command: `31 01 ${hex.slice(0, 2)} ${hex.slice(2, 4)}`, routineBytes: hex };
}

const DESTRUCTIVE_HINTS = [/reset/i, /learn/i, /adaption/i, /adaptation/i, /clear/i, /erase/i, /test/i, /flash/i, /coding/i, /calibrat/i, /program/i, /regen/i, /activ/i, /bleed/i];

function looksDestructive(name: string, category?: string): boolean {
  const s = `${name} ${category || ""}`;
  return DESTRUCTIVE_HINTS.some((r) => r.test(s));
}

function mapDid(
  brand: BrandManifestEntry,
  isOem: boolean,
  ecuByAddr: Map<string, { name: string; common?: string }>,
  d: CatalogDid,
  kind: "did" | "obd2_pid" | "live_pid",
): DiagFunction {
  const { command, didBytes } = didToCommand(isOem, d);
  const ecuAddr = d.ecu_address;
  const ecuInfo = ecuAddr ? ecuByAddr.get(normHex(ecuAddr)) : undefined;
  return {
    id: `${brand.key}:${kind}:${didBytes}:${ecuInfo?.name || ecuAddr || "x"}`,
    brandKey: brand.key,
    brandLabel: brand.display_name,
    isOem,
    ecu: ecuInfo?.name,
    ecuCommonName: ecuInfo?.common,
    ecuAddress: ecuAddr,
    kind,
    name: d.name,
    description: d.description,
    category: d.category || (kind === "live_pid" ? "Live data" : isOem ? "DID" : "OBD-II PID"),
    command,
    did: didBytes,
    decoder: d.decoder,
    sourceFile: brand.file,
    originalName: d.name,
  };
}

function mapRoutine(
  brand: BrandManifestEntry,
  ecuByAddr: Map<string, { name: string; common?: string }>,
  r: CatalogRoutine,
  kind: "routine" | "actuator_test",
): DiagFunction {
  const { command, routineBytes } = (kind === "routine" ? routineToCommand : actuatorToCommand)(r.id);
  const ecuInfo = r.ecu_address ? ecuByAddr.get(normHex(r.ecu_address)) : undefined;
  return {
    id: `${brand.key}:${kind}:${routineBytes}:${ecuInfo?.name || r.ecu_address || "x"}`,
    brandKey: brand.key,
    brandLabel: brand.display_name,
    isOem: true,
    ecu: ecuInfo?.name,
    ecuCommonName: ecuInfo?.common,
    ecuAddress: r.ecu_address,
    kind,
    name: r.name,
    description: r.description,
    category: r.category || (kind === "actuator_test" ? "Aktuátor test" : "Servisní rutina"),
    command,
    routineId: routineBytes,
    destructive: r.destructive ?? looksDestructive(r.name, r.category) ?? true,
    safetyWarning: r.safety_warning,
    sourceFile: brand.file,
    originalName: r.name,
  };
}

const funcCache = new Map<string, { brand: BrandManifestEntry; catalog: OemCatalog; functions: DiagFunction[] }>();

export async function loadBrandFunctions(brandKey: string): Promise<{
  brand: BrandManifestEntry;
  catalog: OemCatalog;
  functions: DiagFunction[];
}> {
  const cached = funcCache.get(brandKey);
  if (cached) return cached;
  const brands = await listBrands();
  const brand = brands.find((b) => b.key === brandKey);
  if (!brand) throw new Error(`Unknown brand ${brandKey}`);
  const catalog = await loadJson<OemCatalog>(brand.file);
  const isOem = brand.key !== "OBD2";

  const ecuByAddr = new Map<string, { name: string; common?: string }>();
  (catalog.ecus || []).forEach((e) => ecuByAddr.set(normHex(e.address), { name: e.name, common: e.common_name }));

  const fns: DiagFunction[] = [];
  (catalog.dids || []).forEach((d) => fns.push(mapDid(brand, isOem, ecuByAddr, d, isOem ? "did" : "obd2_pid")));
  (catalog.live_pids || []).forEach((d) => fns.push(mapDid(brand, isOem, ecuByAddr, d, "live_pid")));
  (catalog.routines || []).forEach((r) => fns.push(mapRoutine(brand, ecuByAddr, r, "routine")));
  (catalog.actuator_tests || []).forEach((r) => fns.push(mapRoutine(brand, ecuByAddr, r, "actuator_test")));

  // Universal DTC scans always available
  (["03", "07", "0A"] as const).forEach((mode) => {
    fns.push({
      id: `${brand.key}:dtc:${mode}`,
      brandKey: brand.key,
      brandLabel: brand.display_name,
      isOem: false,
      kind: "dtc_scan",
      name: mode === "03" ? "Stored DTCs (Mode 03)"
           : mode === "07" ? "Pending DTCs (Mode 07)"
           : "Permanent DTCs (Mode 0A)",
      description: "Scan diagnostic trouble codes (universal)",
      category: "DTC",
      command: mode,
      sourceFile: brand.file,
      originalName: `Mode ${mode}`,
    });
  });

  const out = { brand, catalog, functions: fns };
  funcCache.set(brandKey, out);
  return out;
}

/** Return the ECU list for a brand, ordered by name. */
export async function loadBrandEcus(brandKey: string) {
  const { catalog } = await loadBrandFunctions(brandKey);
  return (catalog.ecus || []).slice().sort((a, b) => a.name.localeCompare(b.name));
}

export function clearCatalogCache() {
  jsonCache.clear();
  funcCache.clear();
  manifestPromise = null;
}
