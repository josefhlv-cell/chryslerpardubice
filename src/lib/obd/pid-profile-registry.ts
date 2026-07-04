/**
 * Registry diagnostických profilů podle značky / VIN.
 * Chrysler custom PIDy se smí spustit POUZE pro Chrysler profily.
 */

export type VehiclePidProfileId =
  | "generic_obd2"
  | "chrysler_can_2011_2016"
  | "chrysler_62te"
  | "vag_can"
  | "unknown";

export type VehiclePidProfile = {
  id: VehiclePidProfileId;
  label: string;
  brands: string[];
  allowChryslerCustomPids: boolean;
  notes: string;
};

export const PID_PROFILES: Record<VehiclePidProfileId, VehiclePidProfile> = {
  generic_obd2: {
    id: "generic_obd2",
    label: "Generic OBD-II",
    brands: [],
    allowChryslerCustomPids: false,
    notes: "Standardní Mode 01/03/09.",
  },
  chrysler_can_2011_2016: {
    id: "chrysler_can_2011_2016",
    label: "Chrysler CAN 2011–2016",
    brands: ["Chrysler", "Dodge", "Jeep", "RAM"],
    allowChryslerCustomPids: true,
    notes: "Chrysler CAN, Mode 22 DIDs, TCM 7E1.",
  },
  chrysler_62te: {
    id: "chrysler_62te",
    label: "Chrysler 62TE (Pentastar)",
    brands: ["Chrysler", "Dodge"],
    allowChryslerCustomPids: true,
    notes: "Town & Country / Pacifica / Journey 3.6 Pentastar + 62TE převodovka.",
  },
  vag_can: {
    id: "vag_can",
    label: "VAG CAN (Škoda/VW/Audi)",
    brands: ["Škoda", "Volkswagen", "Audi", "Seat", "Porsche"],
    allowChryslerCustomPids: false,
    notes: "Nikdy nespouštět Chrysler PIDy.",
  },
  unknown: {
    id: "unknown",
    label: "Neznámé vozidlo",
    brands: [],
    allowChryslerCustomPids: false,
    notes: "Pouze generic OBD-II.",
  },
};

export function resolveProfileFromBrand(
  brand?: string,
  protocolGroup?: string,
): VehiclePidProfile {
  const pg = (protocolGroup || "").toLowerCase();
  if (pg === "chrysler_62te") return PID_PROFILES.chrysler_62te;
  if (pg === "chrysler_can_2011_2016") return PID_PROFILES.chrysler_can_2011_2016;
  if (pg === "vag_can") return PID_PROFILES.vag_can;

  const b = (brand || "").toLowerCase();
  if (["chrysler", "dodge", "jeep", "ram"].includes(b)) {
    return PID_PROFILES.chrysler_can_2011_2016;
  }
  if (["škoda", "skoda", "volkswagen", "audi", "seat", "porsche"].includes(b)) {
    return PID_PROFILES.vag_can;
  }
  if (b) return PID_PROFILES.generic_obd2;
  return PID_PROFILES.unknown;
}
