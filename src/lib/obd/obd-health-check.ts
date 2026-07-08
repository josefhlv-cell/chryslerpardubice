/**
 * OBD Health Check — sekvenční sonda BLE / ELM / ECU.
 *
 * Používá VÝHRADNĚ existující API:
 *   - bleManager (žádný druhý BLE engine)
 *   - elmQueue.send / runExclusive (žádný raw write)
 *   - readVinMode09 (Mode 09 + UDS 22 F190 fallback)
 *
 * Nezapisuje do ECU, neposílá 04 (mazání DTC), 27 (SecurityAccess),
 * 2E (WriteDID), 31 (RoutineControl write) — jen čtení.
 */
import { bleManager } from "@/lib/obd/ble-manager";
import { elmQueue } from "@/lib/obd/adapter/elm-queue";
import { readVinMode09 } from "@/lib/obd/services/service09";
import { logObdDebugEvent } from "@/lib/obd/debug/obd-debug-logger";
import type { ElmStatus } from "@/lib/obd/adapter/elm-errors";

export type HealthStep = {
  id: string;
  label: string;
  status: "ok" | "warn" | "error" | "skip";
  detail?: string;
  raw?: string;
  elmStatus?: ElmStatus | "ok";
  durationMs?: number;
};

export type HealthReport = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  bluetooth: "ok" | "error";
  elm: "ok" | "error";
  ecu: "ok" | "error";
  live: "ok" | "error";
  dtc: "ok" | "error";
  vin: "ok" | "error";
  recommendation: string;
  steps: HealthStep[];
};

async function probe(
  id: string,
  label: string,
  command: string,
  timeoutMs = 2500,
): Promise<HealthStep> {
  const started = Date.now();
  try {
    const res = await elmQueue.send(command, { timeoutMs, commandType: "elm_command" });
    return {
      id,
      label,
      status: res.status === "ok" ? "ok" : res.status === "no_data" || res.status === "unsupported" ? "warn" : "error",
      detail: res.status === "ok" ? undefined : res.status,
      raw: res.raw,
      elmStatus: res.status,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return {
      id,
      label,
      status: "error",
      detail: String((e as Error)?.message ?? e),
      durationMs: Date.now() - started,
    };
  }
}

export async function runObdHealthCheck(): Promise<HealthReport> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const steps: HealthStep[] = [];

  // 1) BLE state
  const bleState = bleManager.getState();
  const bluetooth: HealthReport["bluetooth"] = bleState === "connected" ? "ok" : "error";
  steps.push({
    id: "ble",
    label: "Bluetooth adaptér",
    status: bluetooth === "ok" ? "ok" : "error",
    detail: `state=${bleState}`,
  });

  if (bluetooth === "error") {
    const finishedAt = new Date().toISOString();
    return {
      startedAt, finishedAt, durationMs: Date.now() - started,
      bluetooth, elm: "error", ecu: "error", live: "error", dtc: "error", vin: "error",
      recommendation: "Adaptér není připojený přes Bluetooth. Zapni adaptér, přibliž telefon a znovu se připoj.",
      steps,
    };
  }

  // Vše, co následuje, běží pod exclusive lockem — live polling se sám pauzne.
  return await elmQueue.runExclusive(async () => {
    // 2) ELM: 0100 (supported PIDs)
    const s0100 = await probe("0100", "ELM ↔ ECU (0100 supported PIDs)", "0100", 3500);
    steps.push(s0100);
    const elmOk: HealthReport["elm"] = s0100.elmStatus === "ok" || s0100.status === "warn" ? "ok" : "error";
    const ecuOk: HealthReport["ecu"] = s0100.elmStatus === "ok" ? "ok" : "error";

    // 3) Live: 010C a 010D
    const s010C = await probe("010C", "RPM (010C)", "010C", 1500);
    const s010D = await probe("010D", "Rychlost (010D)", "010D", 1500);
    steps.push(s010C, s010D);
    const live: HealthReport["live"] = s010C.status === "ok" || s010D.status === "ok" ? "ok" : "error";

    // 4) DTC: 03 / 07 / 0A — každý nezávisle
    const s03 = await probe("03", "Uložené DTC (Mode 03)", "03", 3000);
    const s07 = await probe("07", "Pending DTC (Mode 07)", "07", 3000);
    const s0A = await probe("0A", "Permanentní DTC (Mode 0A)", "0A", 3000);
    steps.push(s03, s07, s0A);
    const dtc: HealthReport["dtc"] = [s03, s07, s0A].some((s) => s.status === "ok" || s.status === "warn") ? "ok" : "error";

    // 5) VIN: Mode 09 + UDS F190 fallback
    let vin: HealthReport["vin"] = "error";
    const vinStart = Date.now();
    try {
      const vinRes = await readVinMode09();
      const okVin = vinRes.status === "ok" && !!vinRes.vin && vinRes.vin.length === 17;
      vin = okVin ? "ok" : "error";
      steps.push({
        id: "vin",
        label: `VIN (${vinRes.source ?? "mode09/uds"})`,
        status: okVin ? "ok" : "warn",
        detail: okVin ? vinRes.vin : `${vinRes.status}${vinRes.warnings?.length ? " · " + vinRes.warnings.join("; ") : ""}`,
        raw: vinRes.cleaned,
        durationMs: Date.now() - vinStart,
      });
    } catch (e) {
      steps.push({
        id: "vin",
        label: "VIN",
        status: "warn",
        detail: String((e as Error)?.message ?? e),
        durationMs: Date.now() - vinStart,
      });
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - started;

    const recommendation = buildRecommendation({ bluetooth, elm: elmOk, ecu: ecuOk, live, dtc, vin });
    const report: HealthReport = {
      startedAt, finishedAt, durationMs,
      bluetooth, elm: elmOk, ecu: ecuOk, live, dtc, vin,
      recommendation,
      steps,
    };

    logObdDebugEvent({
      commandType: "elm_command",
      command: "OBD_HEALTH_CHECK",
      status: elmOk === "ok" && live === "ok" ? "ok" : "warning",
      metadata: { report } as never,
      durationMs,
    });

    return report;
  });
}

function buildRecommendation(x: {
  bluetooth: string; elm: string; ecu: string; live: string; dtc: string; vin: string;
}): string {
  if (x.bluetooth !== "ok") return "Připoj OBD adaptér přes Bluetooth.";
  if (x.elm !== "ok") return "ELM adaptér neodpovídá — zkus reset adaptéru (odpojit a znovu připojit).";
  if (x.ecu !== "ok") return "ELM je připojený, ale ECU neodpovídá na 0100. Zapni zapalování a zkus znovu.";
  if (x.live !== "ok") return "Základní PIDy (RPM/rychlost) neodpovídají — vozidlo pravděpodobně nemá zapnuté zapalování.";
  if (x.dtc !== "ok") return "Diagnostika DTC nedostupná — zkontroluj protokol nebo zkus znovu za pár sekund.";
  if (x.vin !== "ok") return "VIN nešel načíst — diagnostika funguje, ale vozidlo je bez identifikace.";
  return "Diagnostika je plně funkční.";
}
