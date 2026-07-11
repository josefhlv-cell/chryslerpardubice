/**
 * VraForge Diag — TypeScript bridge types for Delphi-OBD catalogs.
 * Source of truth: vendor/delphi-obd/catalogs/*.json (mirrored to /public/vraforge-diag/catalogs/).
 */

export type DecoderKind =
  | "hex" | "ascii" | "raw" | "bool"
  | "uint8" | "int8" | "uint16_be" | "int16_be" | "uint32_be" | "int32_be"
  | "bitfield" | "enum";

export interface Decoder {
  kind: DecoderKind | string;
  scale?: number;
  offset?: number;
  unit?: string;
  map?: Record<string, string>;
  values?: Record<string, string>;
  length?: number;
  size?: number;
}

export interface CatalogDid {
  did: string;              // e.g. "0x1052" or "0x000C"
  name: string;
  description?: string;
  ecu_address?: string;     // "0x7E0"
  category?: string;
  decoder?: Decoder;
  verified?: boolean;
  mode?: string;            // service01 etc for live_pids
  pid?: string;
}

export interface CatalogRoutine {
  id: string;               // e.g. "0x0206"
  name: string;
  description?: string;
  ecu_address?: string;
  category?: string;
  destructive?: boolean;
  safety_warning?: string;
  duration_ms?: number;
}

export interface CatalogEcu {
  address: string;
  name: string;
  common_name?: string;
}

export interface OemCatalog {
  version: number;
  manufacturer_key: string;
  display_name: string;
  applicable_wmis?: string[];
  default_source?: string;
  ecus?: CatalogEcu[];
  dids?: CatalogDid[];
  routines?: CatalogRoutine[];
  live_pids?: CatalogDid[];
  actuator_tests?: CatalogRoutine[];
}

/** Manifest entry served from /vraforge-diag/catalogs/manifest.json */
export interface BrandManifestEntry {
  file: string;
  key: string;
  display_name: string;
  wmis?: string[];
  ecus?: number;
  dids?: number;
  routines?: number;
  live_pids?: number;
  actuator_tests?: number;
}

export interface CatalogManifest {
  brands: BrandManifestEntry[];
  generic: BrandManifestEntry[];
}

export type FunctionKind =
  | "obd2_pid" | "did" | "live_pid" | "routine" | "actuator_test" | "dtc_scan" | "raw";

export interface DiagFunction {
  id: string;                  // unique per brand
  brandKey: string;            // manufacturer_key ("VAG", "STLA", "BMW", "OBD2"...)
  brandLabel: string;
  isOem: boolean;              // false = generic OBD-II
  ecu?: string;                // ecu name
  ecuAddress?: string;         // "0x7E0"
  ecuCommonName?: string;
  kind: FunctionKind;
  name: string;
  description?: string;
  category?: string;
  command: string;             // ASCII ELM command
  did?: string;                // hex bytes only, e.g. "1052"
  routineId?: string;          // hex bytes only
  decoder?: Decoder;
  destructive?: boolean;
  safetyWarning?: string;
  sourceFile: string;
  originalName: string;
}

export interface UdsNrcEntry {
  code: string;
  short: string;
  description: string;
  category: string;
}
export interface UdsNrcCatalog { entries: UdsNrcEntry[] }

export type RunStatus = "ok" | "error" | "no_data" | "timeout" | "nrc" | "pending";

export interface DecodedValue {
  name: string;
  value: number | string | boolean | null;
  unit?: string | null;
  description?: string | null;
}

export interface DiagRunResult {
  fn: DiagFunction;
  command: string;
  rawResponse: string;
  cleanedResponse: string;
  status: RunStatus;
  decoded: DecodedValue[];
  warnings: string[];
  error: string | null;
  durationMs: number;
  timestamp: string;
  nrc?: { sid: string; code: string; description?: string };
}

/** Active diagnostic context — mirrors Delphi's "vehicle profile" state. */
export interface ActiveDiagContext {
  brandKey: string;
  brandLabel: string;
  isOem: boolean;
  vin?: string | null;
  ecuAddress?: string;      // TX header from ECU selection
  ecuName?: string;
  responseHeader?: string;  // RX header
  manualTx?: string;        // admin-typed TX (overrides ecuAddress)
  manualRx?: string;        // admin-typed RX (overrides responseHeader)
}
