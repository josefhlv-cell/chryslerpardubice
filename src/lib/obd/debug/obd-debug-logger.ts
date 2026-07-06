/**
 * OBD Debug Logger — zapisuje reálné události OBD komunikace do public.obd_debug_logs.
 *
 * Zásady:
 *   - fire-and-forget (nikdy nesmí zablokovat/zpozdit OBD scan)
 *   - při chybě zápisu → console.warn a pokračovat
 *   - live_poll_command je throttlováno (1 úspěšný záznam / 8 s per command)
 *   - DTC/UDS/OEM/error události se logují vždy
 *   - druhý BLE engine ani druhá ELM queue se nevytváří
 */
import { supabase } from "@/integrations/supabase/client";

export type ObdDebugCommandType =
  | "connect_start" | "connect_success" | "connect_error"
  | "disconnect" | "reconnect_start" | "reconnect_success" | "reconnect_error"
  | "elm_init_debug_ath1" | "elm_init_simple_ath0"
  | "elm_command" | "elm_error" | "elm_timeout"
  | "raw_dtc_03" | "raw_dtc_07" | "raw_dtc_0a" | "full_dtc_scan"
  | "raw_uds" | "stellantis_session" | "stellantis_basic_scan"
  | "stellantis_engine_live_scan" | "stellantis_did"
  | "polling_pause" | "polling_resume"
  | "live_poll_command" | "live_poll_error";

export type ObdDebugStatus =
  | "ok" | "error" | "timeout" | "no_data" | "warning" | "info";

export interface ObdDebugEvent {
  userId?: string | null;
  vehicleId?: string | null;
  adapterId?: string | null;
  adapterName?: string | null;
  connectionState?: string | null;
  elmProfile?: string | null;
  pollingPaused?: boolean | null;
  commandType: ObdDebugCommandType | string;
  command?: string | null;
  rawResponse?: string | null;
  cleanedResponse?: string | null;
  status?: ObdDebugStatus | string | null;
  error?: string | null;
  warnings?: unknown;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
}

const throttleMap = new Map<string, number>();
const THROTTLE_MS = 8_000;

function shouldThrottle(ev: ObdDebugEvent): boolean {
  if (ev.commandType !== "live_poll_command") return false;
  if (ev.status === "error" || ev.error) return false; // chyby vždy
  const key = `${ev.commandType}:${ev.command ?? ""}`;
  const now = Date.now();
  const last = throttleMap.get(key) ?? 0;
  if (now - last < THROTTLE_MS) return true;
  throttleMap.set(key, now);
  return false;
}

// Nikdy nelogovat citlivé věci — pojistka na command/raw payload
const SENSITIVE_PATTERNS = [/token/i, /bearer\s/i, /apikey/i, /api_key/i, /password/i, /secret/i];
function redact(v: string | null | undefined): string | null | undefined {
  if (!v) return v;
  for (const p of SENSITIVE_PATTERNS) if (p.test(v)) return "[REDACTED]";
  return v.length > 8000 ? v.slice(0, 8000) + "…[truncated]" : v;
}

let cachedUserId: string | null | undefined;
async function resolveUserId(hint?: string | null): Promise<string | null> {
  if (hint) return hint;
  if (cachedUserId !== undefined) return cachedUserId;
  try {
    const { data } = await supabase.auth.getUser();
    cachedUserId = data.user?.id ?? null;
  } catch {
    cachedUserId = null;
  }
  return cachedUserId;
}

/** Fire-and-forget logger. Vždy vrací okamžitě (Promise resolved). */
export function logObdDebugEvent(ev: ObdDebugEvent): void {
  try {
    if (shouldThrottle(ev)) return;

    // Async zápis mimo hot-path
    void (async () => {
      try {
        const userId = await resolveUserId(ev.userId);
        const row = {
          user_id: userId,
          vehicle_id: ev.vehicleId ?? null,
          adapter_id: ev.adapterId ?? null,
          adapter_name: ev.adapterName ?? null,
          connection_state: ev.connectionState ?? null,
          elm_profile: ev.elmProfile ?? null,
          polling_paused: ev.pollingPaused ?? null,
          command_type: String(ev.commandType),
          command: redact(ev.command ?? null) ?? null,
          raw_response: redact(ev.rawResponse ?? null) ?? null,
          cleaned_response: redact(ev.cleanedResponse ?? null) ?? null,
          status: ev.status ?? null,
          error: ev.error ?? null,
          warnings: ev.warnings ?? null,
          duration_ms: ev.durationMs ?? null,
          metadata: (ev.metadata ?? null) as never,
        };
        const { error } = await supabase.from("obd_debug_logs").insert(row as never);
        if (error) console.warn("[obd-debug-logger] insert failed:", error.message);
      } catch (e) {
        console.warn("[obd-debug-logger] unexpected:", e);
      }
    })();
  } catch (e) {
    console.warn("[obd-debug-logger] sync failure:", e);
  }
}

/** Vyčistí throttle cache (např. po reconnectu). */
export function resetObdDebugThrottle(): void {
  throttleMap.clear();
}
