/**
 * Cache PIDů, které vozidlo/adaptér nepodporují.
 * Po X neúspěších dostane PID cooldown, aby neblokoval polling.
 */
type Entry = { fails: number; cooldownUntil: number };

const cache = new Map<string, Entry>();

const STANDARD_COOLDOWN_MS = 60_000; // 1 min pro standardní Mode 01
const CUSTOM_COOLDOWN_MS = 5 * 60_000; // 5 min pro Chrysler custom PID

export function isPidOnCooldown(pid: string): boolean {
  const e = cache.get(pid);
  if (!e) return false;
  if (e.cooldownUntil > Date.now()) return true;
  cache.delete(pid);
  return false;
}

export function markPidFailed(pid: string, opts?: { custom?: boolean }): void {
  const existing = cache.get(pid);
  const fails = (existing?.fails ?? 0) + 1;
  const threshold = opts?.custom ? 1 : 3;
  if (fails >= threshold) {
    cache.set(pid, {
      fails,
      cooldownUntil: Date.now() + (opts?.custom ? CUSTOM_COOLDOWN_MS : STANDARD_COOLDOWN_MS),
    });
  } else {
    cache.set(pid, { fails, cooldownUntil: 0 });
  }
}

export function markPidSuccess(pid: string): void {
  cache.delete(pid);
}

export function resetPidCache(): void {
  cache.clear();
}
