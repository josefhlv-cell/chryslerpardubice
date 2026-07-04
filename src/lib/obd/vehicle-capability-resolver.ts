/**
 * Resolver funkcí OBD dostupných pro konkrétní vozidlo.
 * Nevykonává příkazy – jen mapuje profil vozidla na seznam funkcí + rizika.
 */
import type { VehiclePidProfile } from "@/lib/obd/pid-profile-registry";

export type ObdCapabilityCategory =
  | "read"
  | "live"
  | "test"
  | "service"
  | "maintenance"
  | "coding"
  | "unsupported";

export type ObdCapabilityRisk = "safe" | "low" | "medium" | "high" | "blocked";

export type ObdCapabilityAvailability =
  | "available"
  | "maybe"
  | "requires_confirmation"
  | "requires_better_adapter"
  | "unsupported";

export type ObdCapability = {
  id: string;
  label: string;
  description: string;
  category: ObdCapabilityCategory;
  riskLevel: ObdCapabilityRisk;
  availability: ObdCapabilityAvailability;
  notes?: string;
};

export function resolveVehicleCapabilities(
  profile: VehiclePidProfile,
): ObdCapability[] {
  const base: ObdCapability[] = [
    { id: "read_vin", label: "Číst VIN", description: "Mode 09 PID 02", category: "read", riskLevel: "safe", availability: "available" },
    { id: "read_dtc", label: "Číst DTC chyby", description: "Mode 03", category: "read", riskLevel: "safe", availability: "available" },
    { id: "read_live", label: "Live data motoru", description: "Mode 01 základní PIDy", category: "live", riskLevel: "safe", availability: "available" },
    { id: "read_voltage", label: "Napětí baterie", description: "AT RV", category: "read", riskLevel: "safe", availability: "available" },
    { id: "pid_discovery", label: "PID discovery", description: "Zjištění podporovaných PIDů (0100/0120/…)", category: "read", riskLevel: "safe", availability: "available" },
    { id: "export_log", label: "Export raw OBD logu", description: "Debug pro admina", category: "read", riskLevel: "safe", availability: "available" },
    { id: "clear_dtc", label: "Smazat DTC", description: "Mode 04 – vyžaduje potvrzení", category: "service", riskLevel: "medium", availability: "requires_confirmation" },
  ];

  if (profile.id === "chrysler_can_2011_2016" || profile.id === "chrysler_62te") {
    base.push(
      { id: "tcm_data", label: "TCM data (převodovka)", description: "Chrysler 7E1 21 30 / 22 91 10", category: "read", riskLevel: "safe", availability: "maybe" },
      { id: "trans_oil_temp", label: "Teplota oleje převodovky (discovery)", description: "62TE custom PID kandidáti", category: "read", riskLevel: "safe", availability: "maybe" },
      { id: "dpf_data", label: "DPF data (pokud diesel)", description: "PIDy 017A–017E", category: "read", riskLevel: "safe", availability: "maybe" },
      { id: "chrysler_coding", label: "Kódování Chrysler modulů", description: "Vyžaduje AlfaOBD/DRB – v aplikaci blokováno", category: "coding", riskLevel: "blocked", availability: "requires_better_adapter" },
    );
  }

  if (profile.id === "vag_can") {
    base.push(
      { id: "vag_freeze_frame", label: "Freeze frame", description: "Mode 02", category: "read", riskLevel: "safe", availability: "maybe" },
      { id: "vag_service_reset", label: "Reset servisního intervalu", description: "Vyžaduje VCDS/ODIS", category: "service", riskLevel: "medium", availability: "requires_better_adapter" },
      { id: "vag_dpf_regen", label: "DPF regenerace", description: "Vyžaduje VCDS/ODIS", category: "service", riskLevel: "high", availability: "requires_better_adapter" },
      { id: "vag_egr_adaptation", label: "EGR adaptace", description: "Vyžaduje VCDS/ODIS", category: "service", riskLevel: "high", availability: "requires_better_adapter" },
      { id: "vag_coding", label: "Long coding", description: "Blokováno v aplikaci", category: "coding", riskLevel: "blocked", availability: "unsupported" },
    );
  }

  // Univerzálně blokované rizikové funkce
  base.push(
    { id: "flash_ecu", label: "Flash ECU", description: "Blokováno z bezpečnostních důvodů", category: "coding", riskLevel: "blocked", availability: "unsupported" },
    { id: "immo_keys", label: "Immobilizer / klíče", description: "Blokováno z bezpečnostních důvodů", category: "coding", riskLevel: "blocked", availability: "unsupported" },
    { id: "mileage", label: "Změna tachometru", description: "Blokováno – nelegální", category: "coding", riskLevel: "blocked", availability: "unsupported" },
    { id: "emissions_defeat", label: "Deaktivace EGR/DPF/AdBlue", description: "Blokováno – nelegální", category: "coding", riskLevel: "blocked", availability: "unsupported" },
  );

  return base;
}
