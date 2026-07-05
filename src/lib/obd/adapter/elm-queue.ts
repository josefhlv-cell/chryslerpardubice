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
import { applyElmProfile, withElmProfile, type ElmProfile } from "./elm-init";

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
    if (this.pausedDepth === 1) this.pollingListeners.forEach((l) => l(true));
  }

  resumePolling() {
    if (this.pausedDepth === 0) return;
    this.pausedDepth -= 1;
    if (this.pausedDepth === 0) this.pollingListeners.forEach((l) => l(false));
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

  async send(command: string, opts: { timeoutMs?: number } = {}): Promise<ElmResult> {
    const timeoutMs = opts.timeoutMs ?? 4000;
    let raw = "";
    let timedOut = false;
    try {
      raw = await this.withTimeout(elm327.sendCommand(command, "normal"), timeoutMs);
    } catch (e: any) {
      const msg = String(e?.message || e || "").toUpperCase();
      if (msg.includes("TIMEOUT")) timedOut = true;
      raw = msg;
    }
    const errStatus = detectElmError(raw);
    return {
      command,
      raw,
      status: timedOut ? "timeout" : errStatus ?? "ok",
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
