/**
 * OEM extension interface (podle Delphi-OBD OBD.OEM.*).
 * Registr umožňuje detekci značky podle VIN WMI a přístup ke značko-specifickým
 * OEM funkcím bez pevných importů v UI.
 */
import type { StellantisBasicScan, StellantisEngineLiveScan } from "./stellantis";

export type OemDidDef = {
  did: string;              // "F190"
  cmd: string;              // "22 F1 90"
  label: string;            // "VIN"
  category: "basic" | "engine";
};

export type OemProfile = {
  manufacturerKey: string;              // "STLA"
  displayName: string;                  // "Stellantis / FCA / Chrysler / Dodge / Jeep / RAM"
  applicableToVin(vin: string): boolean;
  getBasicDids(): OemDidDef[];
  getEngineLiveDids(): OemDidDef[];
  getSafeCapabilities(): string[];
  scanBasicInfo(): Promise<StellantisBasicScan>;
  scanEngineLive(): Promise<StellantisEngineLiveScan>;
};

const registry: OemProfile[] = [];

export function registerOemProfile(p: OemProfile) {
  if (!registry.find((x) => x.manufacturerKey === p.manufacturerKey)) {
    registry.push(p);
  }
}

export function getOemProfiles(): OemProfile[] {
  return [...registry];
}

export function detectOemProfileByVin(vin: string): OemProfile | undefined {
  return registry.find((p) => p.applicableToVin(vin));
}

export function getOemProfile(key: string): OemProfile | undefined {
  return registry.find((p) => p.manufacturerKey.toUpperCase() === key.toUpperCase());
}
