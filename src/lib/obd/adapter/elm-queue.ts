/**
 * ELM command queue wrapper podle Delphi-OBD (OBD.Adapter.ELM327 + OBD.Connection.Async).
 *
 * Nevytváří druhý BLE engine — obaluje existující `elm327.sendCommand`
 * (který už serializuje FIFO nad `bleManager.write`).
 *
 * Přidává:
 *   - typed status detekci (ElmStatus)
 *   - pausePolling/resumePolling event bus (live polling se musí zastavit
 *     před DTC / UDS / OEM / admin raw scanem)
 *   - `runExclusive()` mutex pro víceřádkové scany (např. UDS session + DID čtení)
 *   - přepínání profilu ATH1/ATH0 (viz elm-init.ts)
 */
import { elm327 } from "@/lib/obd/elm327-engine";
import { detectElmError, type ElmStatus } from "./elm-errors";
import { applyElmProfile, withElmProfile, getActiveElmProfile, type ElmProfile } from "./elm-init";
import { logObdDebugEvent } from "@/lib/obd/debug/obd-debug-logger";

export type ElmResult = {
  command: string;
  raw: string;
  status: ElmStatus;
  timedOut: boolean;
};

type PollingListener = (paused: boolean) => void;

class ElmCommandQueue {
  private pollingListeners: PollingListener[] = [];
  private pausedDepth = 0;
  private exclusiveDepth = 0;
  private exclusiveWaiters: Array<() => void> = [];

  /* ------------------ live polling pause/resume ------------------ */

  onPollingChange(listener: PollingListener): () => void {
    this.pollingListeners.push(listener);
    return () => {
      this.pollingListeners = this.pollingListeners.filter((l) => l !== listener);
    };
  }

  isPollingPaused(): boolean {
    return this.pausedDepth > 0;
  }

  pausePolling() {
    this.pausedDepth += 1;
    if (this.pausedDepth === 1) {
      this.pollingListeners.forEach((l) => l(true));
      logObdDebugEvent({
        commandType: "polling_pause",
        status: "info",
        elmProfile: getActiveElmProfile(),
        pollingPaused: true,
      });
    }
  }

  resumePolling() {
    if (this.pausedDepth === 0) return;
    this.pausedDepth -= 1;
    if (this.pausedDepth === 0) {
      this.pollingListeners.forEach((l) => l(false));
      logObdDebugEvent({
        commandType: "polling_resume",
        status: "info",
        elmProfile: getActiveElmProfile(),
        pollingPaused: false,
      });
    }
  }

  /* ------------------ exclusive scan lock ------------------ */

  private async acquireExclusive(): Promise<void> {
    if (this.exclusiveDepth === 0) {
      this.exclusiveDepth = 1;
      return;
    }
    await new Promise<void>((resolve) => this.exclusiveWaiters.push(resolve));
    this.exclusiveDepth = 1;
  }

  private releaseExclusive() {
    this.exclusiveDepth = 0;
    const next = this.exclusiveWaiters.shift();
    if (next) next();
  }

  /**
   * Zaručí, že mezi startem a koncem fn() neběží žádný jiný scan.
   * Live polling je automaticky pauznutý po dobu fn().
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireExclusive();
    this.pausePolling();
    try {
      return await fn();
    } finally {
      this.resumePolling();
      this.releaseExclusive();
    }
  }

  /* ------------------ command execution ------------------ */

  async send(command: string, opts: { timeoutMs?: number; commandType?: string } = {}): Promise<ElmResult> {
    const timeoutMs = opts.timeoutMs ?? 4000;
    const startedAt = Date.now();
    let raw = "";
    let timedOut = false;
    let thrown: unknown = null;
    try {
      raw = await this.withTimeout(elm327.sendCommand(command, "normal", timeoutMs), timeoutMs + 250);
    } catch (e: any) {
      thrown = e;
      const msg = String(e?.message || e || "").toUpperCase();
      if (msg.includes("TIMEOUT")) timedOut = true;
      raw = msg;
    }
    const errStatus = detectElmError(raw);
    const finalStatus: ElmStatus | "ok" = timedOut ? "timeout" : errStatus ?? "ok";
    const durationMs = Date.now() - startedAt;

    // Fire-and-forget log — nikdy nezpozdí další příkaz
    const isLive = opts.commandType === "live_poll_command";
    logObdDebugEvent({
      commandType: (opts.commandType as never) ?? (timedOut ? "elm_timeout" : errStatus ? "elm_error" : "elm_command"),
      command,
      rawResponse: raw,
      status: finalStatus,
      error: thrown ? String((thrown as Error).message ?? thrown) : (errStatus ?? null),
      durationMs,
      elmProfile: getActiveElmProfile(),
      pollingPaused: this.isPollingPaused(),
      metadata: isLive ? { live: true } : null,
    });

    // Kritické: po timeout / no_data / adapter_error (STOPPED, BUFFER FULL)
    // musí ELM327 stihnout dopsat zbytek odpovědi do BLE bufferu.
    // Bez této pauzy další příkaz (typicky ATSH) překryje běžící operaci
    // a ELM vrátí "STOPPED" → řetěz chyb. 120ms je bezpečné minimum
    // podle Delphi-OBD (OBD.Connection.Async.pas → InterCmdDelayOnFault).
    if (timedOut || finalStatus === "no_data" || finalStatus === "adapter_error") {
      await new Promise((r) => setTimeout(r, finalStatus === "adapter_error" || timedOut ? 260 : 80));
    }

    return {
      command,
      raw,
      status: finalStatus,
      timedOut,
    };
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("TIMEOUT")), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }

  /* ------------------ profile helpers ------------------ */

  applyProfile(profile: ElmProfile, force = false) {
    return applyElmProfile(profile, force);
  }

  withProfile<T>(profile: ElmProfile, fn: () => Promise<T>) {
    return withElmProfile(profile, fn);
  }
}

export const elmQueue = new ElmCommandQueue();
