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
import type { DiagFunction, DiagRunResult, DecodedValue, ActiveDiagContext } from "./types";

interface RunContext {
  vin?: string | null;
  vehicleId?: string | null;
  userId?: string | null;
  /** When set, overrides fn.ecuAddress (e.g. user selected a specific ECU tab). */
  activeContext?: ActiveDiagContext | null;
}

function debugCommandType(fn: DiagFunction): string {
  if (fn.kind === "dtc_scan") return "vraforge_diag_dtc";
  if (fn.kind === "routine") return "vraforge_diag_routine";
  if (fn.kind === "actuator_test") return "vraforge_diag_actuator";
  if (fn.kind === "raw") return "vraforge_diag_raw";
  return "vraforge_diag_read";
}

/** TX header for a given ECU address (11-bit CAN, ISO 15765-4). Returns ELM SH argument. */
function txHeader(ecuAddr?: string): string | null {
  if (!ecuAddr) return null;
  return ecuAddr.replace(/^0x/i, "").toUpperCase();
}

/** RX header — for 7Ex ECUs it's TX+8, otherwise same address. */
function rxHeader(ecuAddr?: string): string | null {
  const tx = txHeader(ecuAddr);
  if (!tx) return null;
  const n = parseInt(tx, 16);
  if (Number.isFinite(n) && tx.length === 3 && tx.startsWith("7E") && n < 0x7E8) {
    return (n + 8).toString(16).toUpperCase().padStart(3, "0");
  }
  return tx;
}

/**
 * Prepare ELM for an OEM DID / routine — set headers and extended session.
 */
async function ensureSessionFor(fn: DiagFunction, ctx: RunContext): Promise<string[]> {
  const warnings: string[] = [];

  // Priority: manual TX/RX > selected ECU > fn.ecuAddress
  const effectiveTxRaw = ctx.activeContext?.manualTx || ctx.activeContext?.ecuAddress || fn.ecuAddress;
  const effectiveRxRaw = ctx.activeContext?.manualRx || ctx.activeContext?.responseHeader;
  const tx = txHeader(effectiveTxRaw);
  const rx = effectiveRxRaw ? txHeader(effectiveRxRaw) : rxHeader(effectiveTxRaw);

  if (tx) {
    const setHdr = await elmQueue.send(`AT SH ${tx}`, { commandType: "vraforge_diag_init", timeoutMs: 1200 });
    if (setHdr.status !== "ok") warnings.push(`ATSH ${tx} → ${setHdr.status}`);
  }
  if (rx) {
    const setCra = await elmQueue.send(`AT CRA ${rx}`, { commandType: "vraforge_diag_init", timeoutMs: 1200 });
    if (setCra.status !== "ok") warnings.push(`ATCRA ${rx} → ${setCra.status}`);
  }

  // Extended session — required for most 22 / 31 reads. NEVER for raw/dtc/live_pid/obd2_pid.
  if (fn.isOem && (fn.kind === "did" || fn.kind === "routine" || fn.kind === "actuator_test")) {
    const session = await elmQueue.send("10 03", { commandType: "vraforge_diag_init", timeoutMs: 2500 });
    if (session.status !== "ok") warnings.push(`10 03 → ${session.status}`);
  }

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
      elmProfile: fn.isOem ? "debug" : "simple",
      metadata: {
        source: "Delphi-OBD", module: "VraForge Diag",
        sourceFile: fn.sourceFile, originalName: fn.originalName,
        brand: fn.brandKey, ecu: fn.ecu, category: fn.category,
      },
    });
    return res;
  }

  // RAW without any TX context must NOT silently fire at the engine default header.
  if (fn.kind === "raw") {
    const anyTx = ctx.activeContext?.manualTx || ctx.activeContext?.ecuAddress || fn.ecuAddress;
    if (!anyTx) {
      const res: DiagRunResult = {
        fn, command: fn.command, rawResponse: "", cleanedResponse: "",
        status: "error", decoded: [],
        warnings: ["RAW vyžaduje vybranou ECU nebo ruční TX/RX. Nespouštím na default engine adresu."],
        error: "Chybí TX/RX kontext pro RAW příkaz",
        durationMs: 0, timestamp: new Date().toISOString(),
      };
      logObdDebugEvent({
        commandType: "vraforge_diag_error", command: fn.command, status: "error",
        error: res.error, warnings: res.warnings,
        metadata: { source: "Delphi-OBD", module: "VraForge Diag", reason: "raw_without_tx", brand: fn.brandKey },
      });
      return res;
    }
  }

  return elmQueue.runExclusive(async () => {
    const warnings: string[] = [];
    try {
      await applyElmProfile(fn.isOem ? "debug" : "simple");
      warnings.push(...(await ensureSessionFor(fn, ctx)));

      const cmdResult = await elmQueue.send(fn.command, {
        commandType: debugCommandType(fn) as never,
        timeoutMs: (fn.kind === "routine" || fn.kind === "actuator_test") ? 6000 : 4000,
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
        nrc: cleaned.nrc,
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
        elmProfile: fn.isOem ? "debug" : "simple",
        userId: ctx.userId ?? null,
        vehicleId: ctx.vehicleId ?? null,
        metadata: {
          source: "Delphi-OBD",
          module: "VraForge Diag",
          sourceFile: fn.sourceFile,
          originalName: fn.originalName,
          brand: fn.brandKey,
          ecu: fn.ecu,
          ecuAddress: ctx.activeContext?.ecuAddress || fn.ecuAddress,
          category: fn.category,
          nrc: cleaned.nrc ?? null,
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
        metadata: { source: "Delphi-OBD", module: "VraForge Diag", sourceFile: fn.sourceFile, originalName: fn.originalName, brand: fn.brandKey },
      });
      return res;
    }
  });
}

/** Free-form command — admin raw entry. */
export async function runRawCommand(
  command: string,
  activeContext?: ActiveDiagContext | null,
  ctx: RunContext = {},
): Promise<DiagRunResult> {
  const isOem = !!activeContext?.isOem;
  const fn: DiagFunction = {
    id: `raw:${command}`,
    brandKey: activeContext?.brandKey || "OBD2",
    brandLabel: activeContext?.brandLabel || "Raw",
    isOem,
    ecuAddress: activeContext?.ecuAddress,
    ecu: activeContext?.ecuName,
    kind: "raw",
    name: `Raw: ${command}`,
    command,
    sourceFile: "raw",
    originalName: command,
  };
  return runDiagFunction(fn, { ...ctx, activeContext });
}

export function buildJsonReport(res: DiagRunResult, ctx: RunContext = {}) {
  return {
    source: "Delphi-OBD",
    module: "VraForge Diag",
    sourceFile: res.fn.sourceFile,
    originalName: res.fn.originalName,
    brand: res.fn.brandKey,
    ecu: res.fn.ecu ?? null,
    ecuAddress: ctx.activeContext?.ecuAddress || res.fn.ecuAddress || null,
    vin: ctx.vin ?? null,
    name: res.fn.name,
    command: res.command,
    status: res.status,
    rawResponse: res.rawResponse,
    cleanedResponse: res.cleanedResponse,
    decoded: res.decoded,
    warnings: res.warnings,
    nrc: res.nrc ?? null,
    durationMs: res.durationMs,
    timestamp: res.timestamp,
  };
}
