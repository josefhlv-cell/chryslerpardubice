/**
 * Delphi Developer Mode – session-only unlock for candidate/blocked functions.
 *
 * Bezpečnostní pravidla:
 *  - Klíč 1607 odemyká POUZE aktuální relaci (window/tab). Po refreshi zamčeno.
 *  - Odemčení nikam neukládáme (žádný localStorage / cookie) — přesně dle zadání.
 *  - Spuštění candidate/blocked funkce vyžaduje explicitní druhé potvrzení
 *    v UI („Rozumím rizikům a chci pokračovat.").
 *  - Každé spuštění v Dev Mode se logujeme do Supabase (delphi_dev_executions).
 */

import { supabase } from "@/integrations/supabase/client";

const DEV_KEY = "1607";

type Listener = (active: boolean) => void;

let active = false;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) {
    try { l(active); } catch { /* noop */ }
  }
}

export function isDeveloperModeActive(): boolean {
  return active;
}

export function tryUnlockDeveloperMode(key: string): boolean {
  if (String(key).trim() !== DEV_KEY) return false;
  active = true;
  emit();
  return true;
}

export function lockDeveloperMode(): void {
  active = false;
  emit();
}

export function subscribeDeveloperMode(listener: Listener): () => void {
  listeners.add(listener);
  listener(active);
  return () => { listeners.delete(listener); };
}

export type DevRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DevExecutionRecord {
  vin?: string | null;
  hardware?: string | null;
  ecu?: string | null;
  protocol?: string | null;
  request?: string | null;
  response?: string | null;
  parsed?: unknown;
  session?: string | null;
  result_status?: string | null;
  risk_level?: DevRiskLevel | null;
  function_id?: string | null;
  function_name?: string | null;
  function_kind?: string | null;
  reason_unverified?: string | null;
  tx?: string | null;
  rx?: string | null;
  transport_log?: string | null;
}

/**
 * Fire-and-forget log; neblokuje UI ani spuštění funkce.
 * Selhání zápisu (chybí tabulka / offline) tichá — Dev Mode je vývojářský nástroj.
 */
export async function logDevExecution(rec: DevExecutionRecord): Promise<void> {
  try {
    await supabase.from("delphi_dev_executions" as never).insert({
      ...rec,
      created_at: new Date().toISOString(),
    } as never);
  } catch {
    /* noop */
  }
}
