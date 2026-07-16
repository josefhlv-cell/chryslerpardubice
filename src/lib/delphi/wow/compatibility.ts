import type { WowProtocolRecord } from "./types";

export interface WowCompatibilityDecision {
  executable: boolean;
  state: "metadata" | "candidate" | "blocked";
  reason: string;
}

/** Conservative gate: WOW metadata must never directly enable a command. */
export function evaluateWowElmCompatibility(row: WowProtocolRecord): WowCompatibilityDecision {
  if (row.elmSupport === "not_for_elm_without_validation") {
    return { executable: false, state: "blocked", reason: "Legacy/proprietary transport is not verified for ELM/Vgate." };
  }
  if (row.elmSupport === "candidate_requires_validation") {
    return { executable: false, state: "candidate", reason: "Possible OBD/ISO transport, but request/response bytes are not verified." };
  }
  return { executable: false, state: "metadata", reason: "Catalog metadata only; no executable diagnostic sequence was imported." };
}
