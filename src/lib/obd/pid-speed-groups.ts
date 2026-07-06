/**
 * Rozlišení PIDů podle rychlosti čtení pro plynulý polling.
 * FAST = motor v pohybu (RPM, rychlost, plyn, MAP, MAF, load)
 * SLOW = teploty, napětí, palivo
 * VERY_SLOW = custom / DPF / VIN – jen po startu nebo ručně
 */
import { LIVE_PIDS } from "@/lib/obd/obd-pids";

export const FAST_PIDS = ["010C", "010D", "0111", "0104", "010B"] as const;

export const SLOW_PIDS = LIVE_PIDS.filter(
  (p) => !FAST_PIDS.includes(p as (typeof FAST_PIDS)[number]),
);
