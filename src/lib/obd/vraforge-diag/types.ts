/**
 * VraForge Diag — TypeScript bridge types for Delphi-OBD catalogs.
 * Source of truth: vendor/delphi-obd/catalogs/*.json
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
  length?: number;
}

export interface CatalogDid {
  did: string;              // e.g. "0x1052" or OBD2 mode01 PID "0x000C"
  name: string;
  description?: string;
  ecu_address?: string;     // "0x7E0"
  category?: string;
  decoder?: Decoder;
  verified?: boolean;
}

export interface CatalogRoutine {
  id: string;               // e.g. "0x0206"
  name: string;
  description?: string;
  ecu_address?: string;
  category?: string;
  destructive?: boolean;
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
}

export type FunctionKind = "obd2_pid" | "did" | "routine" | "dtc_scan" | "raw";

export interface DiagFunction {
  id: string;                  // unique per profile
  profile: string;             // "obd2" | "vag" | "stellantis"
  manufacturer: string;
  ecu?: string;                // ecu name
  ecuAddress?: string;         // "0x7E0"
  kind: FunctionKind;
  name: string;
  description?: string;
  category?: string;
  command: string;             // ASCII command sent to ELM (e.g. "010C", "22 10 52", "31 01 02 06")
  did?: string;                // hex bytes only, e.g. "1052"
  routineId?: string;          // hex bytes only, e.g. "0206"
  decoder?: Decoder;
  destructive?: boolean;
  sourceFile: string;          // catalog file
  originalName: string;        // name in catalog
}

export interface UdsNrcEntry {
  code: string;   // "0x11"
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
}
