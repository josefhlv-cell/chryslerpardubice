/**
 * Delphi DiagnosticTransport — thin abstraction over the app's EXISTING
 * OBD transport (elmQueue + bleManager). Delphi never creates its own
 * BLE connection; it reuses whatever the app already has open — local
 * BLE session or a remote OBD relay bridge routed through the same queue.
 */
import { elmQueue } from "@/lib/obd/adapter/elm-queue";
import { bleManager } from "@/lib/obd/ble-manager";

export interface DiagnosticTransport {
  readonly kind: "local" | "remote";
  isConnected(): boolean;
  send(command: string, opts?: { timeoutMs?: number }): Promise<{ raw: string; status: string }>;
  runExclusive<T>(fn: () => Promise<T>): Promise<T>;
}

/** Uses the app's existing elmQueue / bleManager — no new connection. */
export const localTransport: DiagnosticTransport = {
  kind: "local",
  isConnected: () => bleManager.getState() === "connected",
  async send(command, opts) {
    const r = await elmQueue.send(command, {
      commandType: "delphi_diag_read" as never,
      timeoutMs: opts?.timeoutMs ?? 4000,
    });
    return { raw: r.raw, status: r.status };
  },
  runExclusive: (fn) => elmQueue.runExclusive(fn),
};

/**
 * Remote transport — piggy-backs on the SAME elmQueue. The existing
 * remote OBD session bridge forwards elmQueue commands over Supabase realtime,
 * so we don't need a second engine. If a dedicated remote adapter is later
 * introduced, only this object needs to change.
 */
export const remoteTransport: DiagnosticTransport = {
  ...localTransport,
  kind: "remote",
};

export function pickTransport(mode: "local" | "remote" = "local"): DiagnosticTransport {
  return mode === "remote" ? remoteTransport : localTransport;
}
