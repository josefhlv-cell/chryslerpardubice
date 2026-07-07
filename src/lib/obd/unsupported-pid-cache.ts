/**
 * Cache PIDů, které vozidlo/adaptér nepodporují.
 *
 * Eskalace cooldownu (aby unsupported PID nezaplnil ELM queue a debug logy):
 *   3 fails  → 60 s   (dočasný timeout, může být přechodná chyba sběrnice)
 *   6 fails  → 15 min (opakovaně neodpovídá, pravděpodobně nepodporováno)
 *   10 fails → 6 h    (jistota — vozidlo tento PID nemá)
 *
 * Custom (Chrysler Mode 22) PIDy dostávají cooldown okamžitě, protože
 * discovery iteruje více kandidátů a nechceme spotřebovávat ELM čas.
 */
type Entry = { fails: number; cooldownUntil: number };

const cache = new Map<string, Entry>();

const CUSTOM_COOLDOWN_MS = 5 * 60_000; // 5 min pro Chrysler custom PID

function nextCooldown(fails: number): number {
  if (fails >= 10) return 6 * 60 * 60_000; // 6 h — vozidlo PID nepodporuje
  if (fails >= 6) return 15 * 60_000;      // 15 min — velmi pravděpodobně nepodporováno
  if (fails >= 3) return 60_000;           // 1 min — první úroveň
  return 0;
}

export function isPidOnCooldown(pid: string): boolean {
  const e = cache.get(pid);
  if (!e) return false;
  if (e.cooldownUntil > Date.now()) return true;
  // Cooldown vypršel — necháme záznam (fails), aby další selhání eskalovalo dál
  return false;
}

export function markPidFailed(pid: string, opts?: { custom?: boolean }): void {
  const existing = cache.get(pid);
  const fails = (existing?.fails ?? 0) + 1;

  if (opts?.custom) {
    cache.set(pid, { fails, cooldownUntil: Date.now() + CUSTOM_COOLDOWN_MS });
    return;
  }

  const wait = nextCooldown(fails);
  cache.set(pid, {
    fails,
    cooldownUntil: wait > 0 ? Date.now() + wait : 0,
  });
}

export function markPidSuccess(pid: string): void {
  cache.delete(pid);
}

export function resetPidCache(): void {
  cache.clear();
}
