import { elmQueue } from "@/lib/obd/adapter/elm-queue";
import { applyElmProfile } from "@/lib/obd/adapter/elm-init";
import { bleManager } from "@/lib/obd/ble-manager";
import { logObdDebugEvent } from "@/lib/obd/debug/obd-debug-logger";
import { cleanResponse, decodeDtcs, decodeValue } from "./decoder";
import { loadUdsNrcCatalog } from "./catalog-loader";
import type {
  DiagFunction,
  DiagRunResult,
  DecodedValue,
  ActiveDiagContext,
} from "./types";

interface RunContext {
  vin?: string | null;
  vehicleId?: string | null;
  userId?: string | null;
  activeContext?: ActiveDiagContext | null;

  /**
   * Musí poslat UI až po potvrzení odborného servisního režimu.
   * Pokud false/undefined, routine 31 a actuator_test se nespustí.
   */
  serviceMode?: boolean;
}

function debugCommandType(fn: DiagFunction): string {
  if (fn.kind === "dtc_scan") return "delphi_diag_dtc";
  if (fn.kind === "routine") return "delphi_diag_routine";
  if (fn.kind === "actuator_test") return "delphi_diag_actuator";
  if (fn.kind === "raw") return "delphi_diag_raw";
  return "delphi_diag_read";
}

function normalizeHeader(value?: string | null): string | null {
  if (!value) return null;
  const clean = value.replace(/^0x/i, "").replace(/\s+/g, "").toUpperCase();
  if (!/^[0-9A-F]{3,8}$/.test(clean)) return null;
  return clean;
}

function rxHeaderFromTx(tx?: string | null): string | null {
  const cleanTx = normalizeHeader(tx);
  if (!cleanTx) return null;

  const n = parseInt(cleanTx, 16);

  if (
    Number.isFinite(n) &&
    cleanTx.length === 3 &&
    cleanTx.startsWith("7E") &&
    n >= 0x7E0 &&
    n <= 0x7E7
  ) {
    return (n + 8).toString(16).toUpperCase().padStart(3, "0");
  }

  return cleanTx;
}

function isOemFunction(fn: DiagFunction): boolean {
  return fn.isOem || fn.kind === "did" || fn.kind === "routine" || fn.kind === "actuator_test";
}

function requiresEcu(fn: DiagFunction): boolean {
  return fn.kind === "did" || fn.kind === "routine" || fn.kind === "actuator_test";
}

function requiresServiceMode(fn: DiagFunction): boolean {
  return fn.kind === "routine" || fn.kind === "actuator_test" || !!fn.destructive;
}

function commandStartsWithRoutine31(fn: DiagFunction): boolean {
  return fn.command.replace(/\s+/g, "").toUpperCase().startsWith("3101");
}

function getEffectiveTxRx(fn: DiagFunction, activeContext?: ActiveDiagContext | null) {
  const manualTx = normalizeHeader(activeContext?.manualTx);
  const manualRx = normalizeHeader(activeContext?.manualRx);

  const contextTx = normalizeHeader(activeContext?.ecuAddress);
  const contextRx = normalizeHeader(activeContext?.responseHeader);

  const fnTx = normalizeHeader(fn.ecuAddress);

  const tx = manualTx || contextTx || fnTx;
  const rx = manualRx || contextRx || rxHeaderFromTx(tx);

  return { tx, rx };
}

function makeBlockedResult(
  fn: DiagFunction,
  error: string,
  warnings: string[],
): DiagRunResult {
  return {
    fn,
    command: fn.command,
    rawResponse: "",
    cleanedResponse: "",
    status: "error",
    decoded: [],
    warnings,
    error,
    durationMs: 0,
    timestamp: new Date().toISOString(),
  };
}

function logBlocked(fn: DiagFunction, res: DiagRunResult, ctx: RunContext, reason: string) {
  logObdDebugEvent({
    commandType: "delphi_diag_error",
    command: fn.command,
    status: "error",
    error: res.error,
    warnings: res.warnings,
    userId: ctx.userId ?? null,
    vehicleId: ctx.vehicleId ?? null,
    metadata: {
      source: "Delphi-OBD",
      module: "Delphi",
      reason,
      sourceFile: fn.sourceFile,
      originalName: fn.originalName,
      brand: fn.brandKey,
      ecu: fn.ecu,
      ecuAddress: ctx.activeContext?.ecuAddress || fn.ecuAddress || null,
      kind: fn.kind,
      category: fn.category,
    },
  });
}

async function prepareElmForFunction(fn: DiagFunction, ctx: RunContext): Promise<{
  warnings: string[];
  tx: string | null;
  rx: string | null;
}> {
  const warnings: string[] = [];
  const { tx, rx } = getEffectiveTxRx(fn, ctx.activeContext);

  if (tx) {
    const setHdr = await elmQueue.send(`AT SH ${tx}`, {
      commandType: "delphi_diag_init",
      timeoutMs: 1200,
    });

    if (setHdr.status !== "ok") {
      warnings.push(`AT SH ${tx} → ${setHdr.status}`);
    }
  }

  if (rx) {
    const setCra = await elmQueue.send(`AT CRA ${rx}`, {
      commandType: "delphi_diag_init",
      timeoutMs: 1200,
    });

    if (setCra.status !== "ok") {
      warnings.push(`AT CRA ${rx} → ${setCra.status}`);
    }
  }

  if (fn.isOem && (fn.kind === "routine" || fn.kind === "actuator_test")) {
    const session = await elmQueue.send("10 03", {
      commandType: "delphi_diag_init",
      timeoutMs: 2500,
    });

    const cleaned = cleanResponse("10 03", session.raw);

    if (session.status !== "ok" || cleaned.status !== "ok") {
      warnings.push(`10 03 → ${session.status}; ${cleaned.cleanedHex || session.raw || "no response"}`);
    }
  }

  return { warnings, tx, rx };
}

/**
 * Po každé Delphi OEM operaci vrátí ELM do běžného profilu.
 * Důležité: odstraní přijímací filtr CRA, jinak další standardní PIDy
 * mohou končit jako no_data, protože adaptér stále poslouchá jen jednu ECU.
 */
async function restoreElmAfterFunction(): Promise<void> {
  try {
    // ELM327: AT CRA bez adresy vypne receive-address filter.
    await elmQueue.send("AT CRA", {
      commandType: "delphi_diag_restore",
      timeoutMs: 1200,
    });
  } catch {
    // Obnova profilu níže je důležitější; chyba resetu filtru nesmí shodit UI.
  }

  try {
    // KRITICKÉ: vrátit vysílací hlavičku zpět na CAN broadcast 7DF,
    // jinak zůstane zaseknutá na poslední OEM ECU (např. 771) a všechny
    // následné OBD-II live PIDy vrací NO_DATA → v UI "Nedostupné".
    await elmQueue.send("AT SH 7DF", {
      commandType: "delphi_diag_restore",
      timeoutMs: 1200,
    });
  } catch {
    // best-effort
  }

  try {
    await applyElmProfile("simple", true);
  } catch {
    // Chybu obnovy pouze tolerujeme, aby se neztratila původní odpověď funkce.
  }
}

export async function runDiagFunction(
  fn: DiagFunction,
  ctx: RunContext = {},
): Promise<DiagRunResult> {
  const start = Date.now();
  const nrcCatalog = await loadUdsNrcCatalog().catch(() => undefined);
  const bleState = bleManager.getState();

  const activeContext = ctx.activeContext ?? null;
  const { tx, rx } = getEffectiveTxRx(fn, activeContext);

  if (bleState !== "connected") {
    const res = makeBlockedResult(fn, "BLE není připojeno", [`BLE state=${bleState}`]);
    logBlocked(fn, res, ctx, "ble_not_connected");
    return res;
  }

  if (!activeContext?.isOem && isOemFunction(fn) && fn.kind !== "dtc_scan" && fn.kind !== "raw") {
    const res = makeBlockedResult(
      fn,
      "Generic OBD-II nesmí spouštět OEM funkce",
      ["Vyber konkrétní značku a ECU. Generic OBD-II je jen pro standardní OBD funkce."],
    );
    logBlocked(fn, res, ctx, "generic_blocked_oem_function");
    return res;
  }

  if (requiresEcu(fn) && !tx) {
    const res = makeBlockedResult(
      fn,
      "Chybí ECU/TX kontext",
      ["Vyber ECU nebo zadej ruční TX/RX. Command se nesmí tiše poslat na default engine adresu."],
    );
    logBlocked(fn, res, ctx, "missing_tx_for_oem_function");
    return res;
  }

  if (fn.kind === "raw" && !tx) {
    const res = makeBlockedResult(
      fn,
      "Chybí TX/RX kontext pro RAW příkaz",
      ["RAW vyžaduje vybranou ECU nebo ruční TX/RX. Nespouštím na default engine adresu."],
    );
    logBlocked(fn, res, ctx, "raw_without_tx");
    return res;
  }

  if (requiresServiceMode(fn) || commandStartsWithRoutine31(fn)) {
    if (!ctx.serviceMode) {
      const res = makeBlockedResult(
        fn,
        "Servisní režim není aktivní",
        ["Routine/adaptace/actuator testy vyžadují potvrzený odborný režim v UI."],
      );
      logBlocked(fn, res, ctx, "service_mode_required");
      return res;
    }
  }

  return elmQueue.runExclusive(async () => {
    const warnings: string[] = [];

    try {
      await applyElmProfile(fn.isOem ? "debug" : "simple");

      const prepared = await prepareElmForFunction(fn, ctx);
      warnings.push(...prepared.warnings);

      const cmdResult = await elmQueue.send(fn.command, {
        commandType: debugCommandType(fn) as never,
        timeoutMs: fn.kind === "routine" || fn.kind === "actuator_test" ? 6000 : 4000,
      });

      const cleaned = cleanResponse(fn.command, cmdResult.raw, nrcCatalog);
      warnings.push(...cleaned.warnings);

      let decoded: DecodedValue[] = [];

      if (cleaned.status === "ok") {
        if (fn.kind === "dtc_scan") {
          const codes = decodeDtcs(cleaned.bytes);
          decoded = codes.length
            ? codes.map((c) => ({
                name: c,
                value: c,
                unit: null,
                description: null,
              }))
            : [{
                name: "no_dtc",
                value: "Žádné DTC",
                unit: null,
                description: null,
              }];
        } else {
          decoded = decodeValue(fn, cleaned.bytes);
        }
      }

      let finalStatus = cmdResult.status === "ok" ? cleaned.status : cmdResult.status;

      if (commandStartsWithRoutine31(fn)) {
        const compact = cleaned.cleanedHex.replace(/\s+/g, "").toUpperCase();
        if (!compact.startsWith("71")) {
          finalStatus = cleaned.status === "nrc" ? "nrc" : "error";
          warnings.push("RoutineControl 31 success requires positive response 71.");
        }
      }

      const result: DiagRunResult = {
        fn,
        command: fn.command,
        rawResponse: cmdResult.raw,
        cleanedResponse: cleaned.cleanedHex,
        status: finalStatus as DiagRunResult["status"],
        decoded,
        warnings,
        nrc: cleaned.nrc,
        error:
          cmdResult.status !== "ok" && cmdResult.status !== "no_data"
            ? cmdResult.raw
            : finalStatus === "error"
              ? "Command failed or response is not valid for this function"
              : null,
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
          module: "Delphi",
          sourceFile: fn.sourceFile,
          originalName: fn.originalName,
          brand: fn.brandKey,
          brandLabel: fn.brandLabel,
          kind: fn.kind,
          ecu: activeContext?.ecuName || fn.ecu || null,
          ecuAddress: activeContext?.ecuAddress || fn.ecuAddress || null,
          tx,
          rx,
          manualTx: activeContext?.manualTx || null,
          manualRx: activeContext?.manualRx || null,
          category: fn.category,
          nrc: cleaned.nrc ?? null,
          decoded: decoded as unknown,
          serviceMode: !!ctx.serviceMode,
        },
      });

      return result;
    } catch (e) {
      const err = e as Error;

      const res: DiagRunResult = {
        fn,
        command: fn.command,
        rawResponse: "",
        cleanedResponse: "",
        status: "error",
        decoded: [],
        warnings,
        error: err.message || String(e),
        durationMs: Date.now() - start,
        timestamp: new Date().toISOString(),
      };

      logObdDebugEvent({
        commandType: "delphi_diag_error",
        command: fn.command,
        status: "error",
        error: res.error,
        warnings,
        durationMs: res.durationMs,
        metadata: {
          source: "Delphi-OBD",
          module: "Delphi",
          sourceFile: fn.sourceFile,
          originalName: fn.originalName,
          brand: fn.brandKey,
          kind: fn.kind,
          tx,
          rx,
        },
      });

      return res;
    } finally {
      await restoreElmAfterFunction();
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
    ecuAddress: activeContext?.ecuAddress || activeContext?.manualTx || undefined,
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
  const { tx, rx } = getEffectiveTxRx(res.fn, ctx.activeContext);

  return {
    source: "Delphi-OBD",
    module: "Delphi",
    sourceFile: res.fn.sourceFile,
    originalName: res.fn.originalName,
    brand: res.fn.brandKey,
    brandLabel: res.fn.brandLabel,
    kind: res.fn.kind,
    ecu: ctx.activeContext?.ecuName || res.fn.ecu || null,
    ecuAddress: ctx.activeContext?.ecuAddress || res.fn.ecuAddress || null,
    tx,
    rx,
    manualTx: ctx.activeContext?.manualTx || null,
    manualRx: ctx.activeContext?.manualRx || null,
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
    serviceMode: !!ctx.serviceMode,
  };
}
