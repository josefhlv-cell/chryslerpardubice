/**
 * ELM327 init profily podle Delphi-OBD:
 *   - DEBUG (ATH1 + ATL1) — pro DTC, UDS, VIN, OEM parsery (potřebují hlavičky ECU a řádky pro ISO-TP)
 *   - SIMPLE (ATH0 + ATL0) — pro zákaznický live polling (kratší odpovědi)
 */
import { elm327 } from "@/lib/obd/elm327-engine";
import { logObdDebugEvent } from "@/lib/obd/debug/obd-debug-logger";

export type ElmProfile = "debug" | "simple";

// DEBUG profil — plná ISO-TP podpora:
//   ATH1 (hlavičky), ATL1 (řádky), ATST FA (HW timeout 1000ms — VIN/DTC
//   multi-frame potřebují >400ms), ATFCSH/ATFCSD/ATFCSM (explicitní CAN
//   flow control 30 00 00 — bez toho levné ELM klony ztrácí Consecutive
//   Frames a VIN/DTC odpovědi jsou zkrácené).
// SIMPLE profil — rychlé PID polling (ATH0, ATL0, kratší HW timeout).
const PROFILES: Record<ElmProfile, string[]> = {
  debug: [
    "ATD", "ATE0", "ATL1", "ATS0", "ATH1", "ATSP0",
    "ATSTFA",       // HW timeout 1000ms pro multi-frame
    "ATFCSH7E0",    // Flow-control response header = engine ECU
    "ATFCSD300000", // FC frame: ContinueToSend, BS=0, STmin=0
    "ATFCSM1",      // Použij naši FC frame
    "0100",
  ],
  simple: [
    "ATD", "ATE0", "ATL0", "ATS0", "ATH0", "ATSP0",
    "ATST32",       // HW timeout 200ms — rychlé PID
    "0100",
  ],
};

let currentProfile: ElmProfile | null = null;

export function getActiveElmProfile(): ElmProfile | null {
  return currentProfile;
}

/** Přepne profil (pokud už je aktivní, nedělá nic). Vrací true při úspěchu. */
export async function applyElmProfile(profile: ElmProfile, force = false): Promise<boolean> {
  if (!force && currentProfile === profile) return true;
  const startedAt = Date.now();
  const errors: string[] = [];
  for (const cmd of PROFILES[profile]) {
    try {
      await elm327.sendCommand(cmd, "high");
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      errors.push(`${cmd}: ${msg}`);
      // Init je best-effort — 1 selhaný AT nezastaví celý profil.
      console.warn(`[elm-init] ${profile} step '${cmd}' failed:`, e);
    }
  }
  currentProfile = profile;
  logObdDebugEvent({
    commandType: profile === "debug" ? "elm_init_debug_ath1" : "elm_init_simple_ath0",
    command: PROFILES[profile].join(" | "),
    status: errors.length ? "warning" : "ok",
    elmProfile: profile,
    durationMs: Date.now() - startedAt,
    warnings: errors.length ? errors : null,
  });
  return true;
}

/** Krátký přepínač: proveď akci v požadovaném profilu, pak se vrať do předchozího. */
export async function withElmProfile<T>(profile: ElmProfile, fn: () => Promise<T>): Promise<T> {
  const previous = currentProfile;
  await applyElmProfile(profile);
  try {
    return await fn();
  } finally {
    if (previous && previous !== profile) {
      await applyElmProfile(previous, true).catch(() => undefined);
    }
  }
}
