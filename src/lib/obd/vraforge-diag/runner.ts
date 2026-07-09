/**
 * VraForge Diag runner — executes a DiagFunction against the vehicle using
 * the SAME infrastructure as normal customer OBD:
 *   elm327 → elmQueue (mutex + polling pause) → bleManager → ELM327 → car
 *
 * Never opens BLE directly. Never spawns a second engine. Never writes
 * OBD data outside the Delphi-OBD catalogs (no invented PIDs).
 */

import { elmQueue } from "@/lib/obd/adapter/elm-queue";
import { applyElmProfile } from "@/lib/obd/adapter/elm-init";
import { bleManager } from "@/lib/obd/ble-manager";
import { logObdDebugEvent } from "@/lib/obd/debug/obd-debug-logger";
import { cleanResponse, decodeDtcs, decodeValue } from "./decoder";
import { loadUdsNrcCatalog } from "./catalog-loader";
import type { DiagFunction, DiagRunResult, DecodedValue } from "./types";

interface RunContext {
  vin?: string | null;
  vehicleId?: string | null;
  userId?: string | null;
}

function debugCommandType(fn: DiagFunction): string {
  if (fn.kind === "dtc_scan") return "vraforge_diag_dtc";
  if (fn.kind === "routine") return "vraforge_diag_routine";
  if (fn.kind === "raw") return "vraforge_diag_raw";
  return "vraforge_diag_read";
}

/**
 * Optional session setup + header switch based on profile.
 * Uses only AT commands (no OBD writes).
 */
async function ensureSessionFor(fn: DiagFunction): Promise<string[]> {
  const warnings: string[] = [];
  if (fn.profile === "obd2") return warnings;

  // OEM DID / routine — need extended session on ecu_address
  const ecu = (fn.ecuAddress || "0x7E0").replace(/^0x/i, "").toUpperCase();
  const resp = ecu.startsWith("7E") ? (parseInt(ecu, 16) + 8).toString(16).toUpperCase() : ecu;

  // Set headers + response filter
  const setHdr = await elmQueue.send(`AT SH ${ecu}`, { commandType: "vraforge_diag_init", timeoutMs: 1200 });
  if (setHdr.status !== "ok") warnings.push(`ATSH ${ecu} → ${setHdr.status}`);
  const setCra = await elmQueue.send(`AT CRA ${resp}`, { commandType: "vraforge_diag_init", timeoutMs: 1200 });
  if (setCra.status !== "ok") warnings.push(`ATCRA ${resp} → ${setCra.status}`);

  // Extended session (10 03) — safe read/routine session
  const session = await elmQueue.send("10 03", { commandType: "vraforge_diag_init", timeoutMs: 2500 });
  if (session.status !== "ok") warnings.push(`10 03 → ${session.status}`);

  return warnings;
}

export async function runDiagFunction(fn: DiagFunction, ctx: RunContext = {}): Promise<DiagRunResult> {
  const start = Date.now();
  const nrcCatalog = await loadUdsNrcCatalog().catch(() => undefined);
  const bleState = bleManager.getState();
  if (bleState !== "connected") {
    const res: DiagRunResult = {
      fn, command: fn.command, rawResponse: "", cleanedResponse: "",
      status: "error", decoded: [], warnings: [`BLE state=${bleState}`],
      error: "BLE není připojeno", durationMs: 0, timestamp: new Date().toISOString(),
    };
    logObdDebugEvent({
      commandType: "vraforge_diag_error",
      command: fn.command, status: "error", error: res.error,
      elmProfile: fn.profile === "obd2" ? "simple" : "debug",
      metadata: {
        source: "Delphi-OBD", module: "VraForge Diag",
        sourceFile: fn.sourceFile, originalName: fn.originalName,
        profile: fn.profile, manufacturer: fn.manufacturer, ecu: fn.ecu, category: fn.category,
      },
    });
    return res;
  }

  return elmQueue.runExclusive(async () => {
    const warnings: string[] = [];
    try {
      // OEM profiles need ATH1 (headers) for CAN filtering + UDS parsing
      await applyElmProfile(fn.profile === "obd2" ? "simple" : "debug");

      warnings.push(...(await ensureSessionFor(fn)));

      const cmdResult = await elmQueue.send(fn.command, {
        commandType: debugCommandType(fn),
        timeoutMs: fn.kind === "routine" ? 6000 : 4000,
      });

      const cleaned = cleanResponse(fn.command, cmdResult.raw, nrcCatalog);
      warnings.push(...cleaned.warnings);

      let decoded: DecodedValue[] = [];
      if (cleaned.status === "ok") {
        if (fn.kind === "dtc_scan") {
          const codes = decodeDtcs(cleaned.bytes);
          decoded = codes.length
            ? codes.map((c) => ({ name: c, value: c, unit: null, description: null }))
            : [{ name: "no_dtc", value: "Žádné DTC", unit: null, description: null }];
        } else {
          decoded = decodeValue(fn, cleaned.bytes);
        }
      }

      const finalStatus = cmdResult.status === "ok" ? cleaned.status : cmdResult.status;
      const result: DiagRunResult = {
        fn,
        command: fn.command,
        rawResponse: cmdResult.raw,
        cleanedResponse: cleaned.cleanedHex,
        status: finalStatus as DiagRunResult["status"],
        decoded,
        warnings,
        error: cmdResult.status !== "ok" && cmdResult.status !== "no_data" ? cmdResult.raw : null,
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };

      logObdDebugEvent({
        commandType: debugCommandType(fn) as never,
        command: fn.command,
        rawResponse: cmdResult.raw,
        cleanedResponse: cleaned.cleanedHex,
        status: result.status,
        error: result.error,
        warnings,
        durationMs: result.durationMs,
        elmProfile: fn.profile === "obd2" ? "simple" : "debug",
        userId: ctx.userId ?? null,
        vehicleId: ctx.vehicleId ?? null,
        metadata: {
          source: "Delphi-OBD",
          module: "VraForge Diag",
          sourceFile: fn.sourceFile,
          originalName: fn.originalName,
          profile: fn.profile,
          manufacturer: fn.manufacturer,
          ecu: fn.ecu,
          category: fn.category,
          decoded: decoded as unknown,
        },
      });

      return result;
    } catch (e) {
      const err = e as Error;
      const res: DiagRunResult = {
        fn, command: fn.command, rawResponse: "", cleanedResponse: "",
        status: "error", decoded: [], warnings, error: err.message || String(e),
        durationMs: Date.now() - start, timestamp: new Date().toISOString(),
      };
      logObdDebugEvent({
        commandType: "vraforge_diag_error",
        command: fn.command, status: "error", error: res.error, warnings,
        durationMs: res.durationMs,
        metadata: { source: "Delphi-OBD", module: "VraForge Diag", sourceFile: fn.sourceFile, originalName: fn.originalName, profile: fn.profile },
      });
      return res;
    }
  });
}

/** Free-form command — admin raw entry. Uses same runner path. */
export async function runRawCommand(command: string, profile: "obd2" | "vag" | "stellantis" = "obd2", ctx: RunContext = {}): Promise<DiagRunResult> {
  const fn: DiagFunction = {
    id: `${profile}:raw:${command}`,
    profile, manufacturer: profile.toUpperCase(),
    kind: "raw",
    name: `Raw: ${command}`,
    command,
    sourceFile: "raw",
    originalName: command,
  };
  return runDiagFunction(fn, ctx);
}

export function buildJsonReport(res: DiagRunResult, ctx: RunContext = {}) {
  return {
    source: "Delphi-OBD",
    module: "VraForge Diag",
    sourceFile: res.fn.sourceFile,
    originalName: res.fn.originalName,
    profile: res.fn.profile,
    manufacturer: res.fn.manufacturer,
    ecu: res.fn.ecu ?? null,
    ecuAddress: res.fn.ecuAddress ?? null,
    vin: ctx.vin ?? null,
    name: res.fn.name,
    command: res.command,
    status: res.status,
    rawResponse: res.rawResponse,
    cleanedResponse: res.cleanedResponse,
    decoded: res.decoded,
    warnings: res.warnings,
    durationMs: res.durationMs,
    timestamp: res.timestamp,
  };
}
