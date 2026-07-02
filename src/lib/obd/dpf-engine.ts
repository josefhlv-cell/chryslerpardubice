/**
 * DPF diagnostický engine.
 *
 * Čte reálné DPF hodnoty z ELM327/ECU přes standardní OBD-II PIDy
 * (Mode 01, PID 0x7C..0x86). Manufacturer-specific PIDy nejsou
 * pro Chrysler/Dodge/RAM/Lancia veřejně stabilizované, proto pokud
 * standardní PID vrátí "NO DATA", označíme položku jako "unavailable".
 *
 * NIKDY nesimulujeme DPF hodnoty jako reálné. Pokud neznáme,
 * vrátíme undefined a UI má zobrazit "nedostupné".
 *
 * Regenerace se vyhodnocuje kombinací:
 *  - regen status PID (0x7C bit)
 *  - vysoký soot load (>60 %)
 *  - vysoký diferenční tlak (>3 kPa)
 *  - vysoký EGT po DPF (>500 °C) proti EGT před DPF
 */

import { elm327 } from "@/lib/obd/elm327-engine";

export type DpfSnapshot = {
  supported: boolean;
  sootLoad?: number;
  ashLoad?: number;
  differentialPressure?: number;
  exhaustTempBeforeDpf?: number;
  exhaustTempAfterDpf?: number;
  regenActive?: boolean;
  regenStatus?: string;
  kmSinceLastRegen?: number;
  timeSinceLastRegen?: number;
  lastUpdated: string;
  confidence: "high" | "medium" | "low";
};

const DPF_PIDS = {
  regenStatus: "017C",
  dpfIn: "017D",
  dpfOut: "017E",
  dpfDiffPressure: "017A",
  sootLoad: "017B",
} as const;

function isNoData(raw: string): boolean {
  return !raw || /NO\s*DATA|UNABLE|ERROR|STOPPED|\?|7F/i.test(raw);
}

function hexBytes(raw: string): number[] | null {
  const clean = raw.replace(/[^0-9A-F]/gi, "");
  if (clean.length < 4) return null;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    const b = parseInt(clean.slice(i, i + 2), 16);
    if (Number.isNaN(b)) return null;
    bytes.push(b);
  }
  return bytes;
}

/** DPF differential pressure (kPa), PID 017A -> ((A*256+B)/128) - 256 */
function parseDiffPressure(raw: string): number | undefined {
  const b = hexBytes(raw);
  if (!b || b.length < 4) return undefined;
  // ignore header, use last 2 data bytes
  const A = b[b.length - 2];
  const B = b[b.length - 1];
  return (A * 256 + B) / 128 - 256;
}

/** DPF soot load (%), PID 017B -> data byte * 100/255 */
function parseSootLoad(raw: string): number | undefined {
  const b = hexBytes(raw);
  if (!b || b.length < 1) return undefined;
  const A = b[b.length - 1];
  return (A * 100) / 255;
}

/** DPF EGT (°C), PID 017D/017E -> (A*256+B)/10 - 40 */
function parseEgt(raw: string): number | undefined {
  const b = hexBytes(raw);
  if (!b || b.length < 2) return undefined;
  const A = b[b.length - 2];
  const B = b[b.length - 1];
  return (A * 256 + B) / 10 - 40;
}

/** DPF regen status raw bitfield -> boolean/label */
function parseRegen(raw: string): { active: boolean; label: string } | undefined {
  const b = hexBytes(raw);
  if (!b || b.length < 1) return undefined;
  const byte = b[b.length - 1];
  const active = (byte & 0x02) !== 0 || (byte & 0x01) !== 0;
  return { active, label: active ? "Regenerace aktivní" : "Regenerace neaktivní" };
}

export async function readDpfSnapshot(): Promise<DpfSnapshot> {
  const results: Record<string, string> = {};
  let anySupported = false;

  for (const [key, pid] of Object.entries(DPF_PIDS)) {
    try {
      const raw = await elm327.sendCommand(pid, "low");
      results[key] = raw;
      if (!isNoData(raw)) anySupported = true;
    } catch {
      results[key] = "";
    }
  }

  const soot = !isNoData(results.sootLoad) ? parseSootLoad(results.sootLoad) : undefined;
  const dp = !isNoData(results.dpfDiffPressure) ? parseDiffPressure(results.dpfDiffPressure) : undefined;
  const egtIn = !isNoData(results.dpfIn) ? parseEgt(results.dpfIn) : undefined;
  const egtOut = !isNoData(results.dpfOut) ? parseEgt(results.dpfOut) : undefined;
  const regen = !isNoData(results.regenStatus) ? parseRegen(results.regenStatus) : undefined;

  // Combined heuristic regen detection
  const heuristicActive =
    (soot !== undefined && soot > 60) ||
    (dp !== undefined && dp > 3) ||
    (egtOut !== undefined && egtOut > 500);

  const regenActive = regen?.active ?? (heuristicActive || undefined);
  const regenStatus =
    regen?.label ??
    (heuristicActive ? "Pravděpodobná regenerace (heuristika)" : undefined);

  const confidence: DpfSnapshot["confidence"] = regen
    ? "high"
    : heuristicActive
      ? "medium"
      : anySupported
        ? "medium"
        : "low";

  return {
    supported: anySupported,
    sootLoad: soot,
    differentialPressure: dp,
    exhaustTempBeforeDpf: egtIn,
    exhaustTempAfterDpf: egtOut,
    regenActive,
    regenStatus,
    lastUpdated: new Date().toISOString(),
    confidence,
  };
}
