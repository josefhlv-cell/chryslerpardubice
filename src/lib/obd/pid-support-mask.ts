/**
 * Rychlé zjištění, které Mode 01 PIDy vozidlo/ECU vůbec podporuje.
 * Pošle 0100 / 0120 / 0140 / 0160 / 0180 / 01A0 / 01C0 a z výsledných
 * 32bitových masek odvodí seznam podporovaných PIDů 01xx.
 *
 * Nepodporované PIDy rovnou označí v `unsupported-pid-cache`, takže je
 * live polling okamžitě přeskočí (bez 3× timeout na PID).
 *
 * Nikdy nevyhodí — pokud adaptér/ECU neodpoví, jednoduše nic nezmění.
 */
import { elmQueue } from "@/lib/obd/adapter/elm-queue";
import { markPidFailed, markPidSuccess } from "@/lib/obd/unsupported-pid-cache";

/**
 * Sada všech známých live PIDů, které v aplikaci pollujeme.
 * Musí být synchronizovaná s FAST_PIDS + SLOW_PIDS + obd-pids.ts.
 */
const KNOWN_POLLED_PIDS = [
  "0104", "0105", "0106", "0107", "010A", "010B", "010C", "010D",
  "010E", "010F", "0110", "0111", "011F", "0121", "012F", "0133",
  "0142", "0143", "0144", "0145", "0146", "0147", "015B", "015C",
  "015E", "0161", "0163", "0166", "0167",
];

const MASK_QUERIES = ["0100", "0120", "0140", "0160", "0180", "01A0", "01C0"];

function parseMask(raw: string, base: number): Set<number> {
  const supported = new Set<number>();
  if (!raw) return supported;
  const clean = raw.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  // odpověď: 41 XX AA BB CC DD  (XX = PID, 4 datové bajty tvoří 32 bit masku)
  const pidHex = base.toString(16).padStart(2, "0").toUpperCase();
  const marker = `41${pidHex}`;
  const idx = clean.indexOf(marker);
  if (idx < 0) return supported;
  const dataHex = clean.slice(idx + marker.length, idx + marker.length + 8);
  if (dataHex.length < 8) return supported;
  const bytes = [
    parseInt(dataHex.slice(0, 2), 16),
    parseInt(dataHex.slice(2, 4), 16),
    parseInt(dataHex.slice(4, 6), 16),
    parseInt(dataHex.slice(6, 8), 16),
  ];
  if (bytes.some(Number.isNaN)) return supported;
  for (let i = 0; i < 32; i++) {
    const byteIdx = Math.floor(i / 8);
    const bit = 7 - (i % 8);
    if (bytes[byteIdx] & (1 << bit)) {
      supported.add(base + 1 + i);
    }
  }
  return supported;
}

export type PidSupportMask = {
  supported: Set<string>;
  unsupported: string[];
  queried: string[];
  raw: Record<string, string>;
};

/**
 * Provede support-mask scan. Předpokládá, že ELM327 už je initialized.
 * Vrátí PidSupportMask. Zároveň zapíše cooldown pro nepodporované PIDy.
 */
export async function scanPidSupportMask(): Promise<PidSupportMask> {
  const supported = new Set<string>();
  const raw: Record<string, string> = {};
  const queried: string[] = [];

  let base = 0x00;
  for (const cmd of MASK_QUERIES) {
    queried.push(cmd);
    let response = "";
    try {
      const res = await elmQueue.send(cmd, { timeoutMs: 900, commandType: "pid_support_mask" });
      response = res.raw;
    } catch {
      response = "";
    }
    raw[cmd] = response;
    if (!response || /NO\s*DATA|UNABLE|ERROR|STOPPED|\?/i.test(response)) {
      // Některé Chrysler/Stellantis ECU vrací NO DATA pro 0120, ale přesto
      // odpoví na 0140/0160 (napětí 0142, baro 0133, load 0143…). Delphi scan
      // bloky neukončuje tvrdě podle první díry — zkusí další masku a až potom
      // označí konkrétní PIDy podle výsledků.
      base += 0x20;
      continue;
    }
    const bits = parseMask(response, base);
    for (const pid of bits) {
      const hex = pid.toString(16).padStart(2, "0").toUpperCase();
      supported.add(`01${hex}`);
    }
    // Další maska existuje jen když je podporovaný PID 20/40/60/80/A0/C0.
    // Bez této kontroly ELM čeká zbytečně na 0120/0140… a live data se rozjedou pozdě.
    const nextMarker = base + 0x20;
    if (!supported.has(`01${nextMarker.toString(16).padStart(2, "0").toUpperCase()}`)) break;
    base += 0x20;
  }

  // Označit nepodporované známé PIDy — okamžitě dostanou dlouhý cooldown,
  // aby polling neztrácel 3× timeout.
  const unsupported: string[] = [];
  for (const pid of KNOWN_POLLED_PIDS) {
    if (!supported.has(pid)) {
      unsupported.push(pid);
      // 3× failed → cooldown 60s
      markPidFailed(pid);
      markPidFailed(pid);
      markPidFailed(pid);
    } else {
      // supported → vyčistit případný cache
      markPidSuccess(pid);
    }
  }

  return { supported, unsupported, queried, raw };
}
