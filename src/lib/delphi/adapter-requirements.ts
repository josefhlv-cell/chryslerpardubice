/**
 * Určení požadavku na diagnostický adaptér pro každou Delphi funkci.
 *
 * Cíl: technik vidí u funkce hned, jestli ji zvládne běžný ELM327/Vgate BLE,
 * nebo jestli je potřeba profesionální J2534 / CDP+ rozhraní.
 *
 * Nic nevykonává — pouze klasifikuje.
 */

import type { DiagFunction } from "./types";

export type AdapterTier = "elm" | "elm_limited" | "j2534";

export type AdapterRequirement = {
  tier: AdapterTier;
  /** Krátký štítek do seznamu funkcí. */
  label: string;
  /** Delší vysvětlení do detailu funkce. */
  explanation: string;
  /** Zvládne to ELM327 / Vgate? */
  elmCapable: boolean;
};

const ELM_OK: AdapterRequirement = {
  tier: "elm",
  label: "ELM / Vgate",
  explanation:
    "Čtení standardními službami OBD-II / UDS (Mode 01/03/09, služba 22). " +
    "Běžný ELM327 nebo Vgate BLE tuto funkci zvládne bez omezení.",
  elmCapable: true,
};

const ELM_LIMITED: AdapterRequirement = {
  tier: "elm_limited",
  label: "ELM / Vgate (omezeně)",
  explanation:
    "Funkce používá delší ISO-TP přenos nebo rozšířenou diagnostickou relaci (10 03). " +
    "ELM327/Vgate ji obvykle spustí, ale u pomalých klonů může dojít k timeoutu nebo " +
    "neúplné odpovědi (chybí flow-control / CAN-FD). Doporučen kvalitní adaptér (OBDLink EX).",
  elmCapable: true,
};

const J2534_REQUIRED: AdapterRequirement = {
  tier: "j2534",
  label: "J2534 / CDP+ nutný",
  explanation:
    "Zápisová nebo bezpečnostně chráněná operace. ELM327/Vgate ji NEUMÍ, protože: " +
    "(1) neumí Security Access (27 xx) se seed/key algoritmem výrobce, " +
    "(2) neumí držet tester-present relaci s přesným časováním P2/P2*, " +
    "(3) neumí SecureOnBoard / gateway odemčení (SGW u FCA/Stellantis), " +
    "(4) neumí zápis do paměti (2E / 31 / 34-36-37 flash bloky). " +
    "Potřebuješ J2534 pass-through (Delphi CDP+, DrewTech, VCM, MDI) nebo originální tester.",
  elmCapable: false,
};

const SECURITY_HINTS = [
  /coding/i, /kódování/i, /program/i, /flash/i, /immo/i, /key/i, /klíč/i,
  /variant/i, /calibrat/i, /kalibrac/i, /write/i, /zápis/i, /sgw/i, /gateway/i,
];

const ROUTINE_ELM_SAFE = [
  /reset/i, /service interval/i, /servisní interval/i, /oil/i, /olej/i,
  /clear/i, /smaz/i, /adapt/i, /learn/i, /regen/i, /bleed/i, /odvzdušn/i,
];

export function resolveAdapterRequirement(fn: DiagFunction): AdapterRequirement {
  // Čtení: DTC scan, PIDy, DIDy, live data
  if (fn.kind === "dtc_scan" || fn.kind === "obd2_pid" || fn.kind === "live_pid") {
    return ELM_OK;
  }

  if (fn.kind === "did") {
    // OEM DID přes službu 22 – ELM zvládne, ale delší rámce mohou být problém.
    return fn.isOem ? ELM_LIMITED : ELM_OK;
  }

  const text = `${fn.name} ${fn.category || ""} ${fn.description || ""}`;

  if (SECURITY_HINTS.some((r) => r.test(text))) return J2534_REQUIRED;

  if (fn.kind === "actuator_test") {
    // Aktuátor testy jdou přes RoutineControl – u většiny značek vyžadují
    // rozšířenou relaci, u chráněných modulů i Security Access.
    return ELM_LIMITED;
  }

  if (fn.kind === "routine") {
    if (ROUTINE_ELM_SAFE.some((r) => r.test(text))) return ELM_LIMITED;
    return J2534_REQUIRED;
  }

  if (fn.kind === "raw") return ELM_LIMITED;

  return ELM_LIMITED;
}

export function adapterBadgeClass(tier: AdapterTier): string {
  if (tier === "elm") return "border-emerald-500 text-emerald-700";
  if (tier === "elm_limited") return "border-amber-500 text-amber-800";
  return "border-red-500 text-red-700";
}
