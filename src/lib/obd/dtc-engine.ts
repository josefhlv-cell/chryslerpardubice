// DTC Engine — Diagnostic Trouble Code reader, parser, and analyzer
// Supports OBD Mode 03/04 and keeps a local session history.

import { elm327 } from '@/lib/obd/elm327-engine';
import { CHRYSLER_DATABASE } from '@/lib/obd/chrysler-database';
import { dtcCache } from '@/lib/obd/offline-cache';
import { lookupGenericDTC } from '@/lib/obd/dtc-database';
import { lookupChryslerOemDtc } from '@/lib/obd/chrysler-dtc-oem';
import { cleanElmResponse } from '@/lib/obd/protocol/response-cleaner';
import { parseIsoTp } from '@/lib/obd/protocol/isotp-parser';
import { decodeDtcPayload } from '@/lib/obd/services/dtc-decoder';

export type DTCSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DTCSystem = 'powertrain' | 'body' | 'chassis' | 'network';

export type DTCCode = {
  code: string;
  system: DTCSystem;
  description: string;
  descriptionEn?: string;
  category?: string;
  firstCheck?: string;
  moparNote?: string;
  source?: string;
  severity: DTCSeverity;
  possibleCause: string;
  relatedSignals: string[];
  isActive: boolean;
  isPending: boolean;
  occurenceCount: number;
  firstSeen: number;
  lastSeen: number;
};

export type DTCSession = {
  id: string;
  timestamp: number;
  codes: DTCCode[];
  clearedCodes: string[];
};

export type DTCState = {
  activeCodes: DTCCode[];
  history: DTCSession[];
  scanning: boolean;
  clearing: boolean;
  lastScan: number | null;
};

const DTC_DATABASE: Record<string, { desc: string; severity: DTCSeverity; cause: string; signals: string[]; action?: string }> = {};
for (const dtc of CHRYSLER_DATABASE.dtcCodes) {
  DTC_DATABASE[dtc.code] = {
    desc: dtc.description,
    severity: dtc.severity,
    cause: dtc.possibleCause,
    signals: dtc.relatedSensors,
    action: (dtc as any).recommendedAction,
  };
}

export type ResolvedDTCInfo = {
  description: string;
  descriptionEn?: string;
  severity: DTCSeverity;
  cause: string;
  signals: string[];
  category?: string;
  firstCheck?: string;
  moparNote?: string;
  source?: string;
};

/**
 * Vyhledání DTC informací s vrstvenou prioritou:
 *   1. Chrysler/Mopar OEM databáze z přílohy (chrysler-dtc-database.json) — nejvyšší
 *   2. Chrysler-specifická databáze v projektu (chrysler-database.ts)
 *   3. Generická OBD-II databáze
 *   4. Fallback „Neznámý kód"
 */
export function resolveDTCInfo(code: string): ResolvedDTCInfo {
  const upper = (code || '').toUpperCase();
  const oem = lookupChryslerOemDtc(upper);
  const chrysler = DTC_DATABASE[upper];
  const generic = lookupGenericDTC(upper);

  if (oem) {
    return {
      description: oem.description,
      descriptionEn: generic?.descEn || chrysler?.desc,
      severity: (chrysler?.severity || generic?.severity || guessSeverity(upper)),
      cause: oem.possibleCause || chrysler?.cause || generic?.cause || '—',
      signals: chrysler?.signals || [],
      category: categoryFromCode(upper),
      firstCheck: oem.firstCheck || chrysler?.action || '',
      moparNote: chrysler?.action && chrysler.action !== oem.firstCheck ? chrysler.action : undefined,
      source: 'Chrysler/Mopar',
    };
  }
  if (chrysler) {
    return {
      description: chrysler.desc,
      descriptionEn: generic?.descEn,
      severity: chrysler.severity,
      cause: chrysler.cause,
      signals: chrysler.signals,
      category: categoryFromCode(upper),
      firstCheck: chrysler.action,
      source: 'Chrysler',
    };
  }
  if (generic) {
    return {
      description: generic.desc,
      descriptionEn: generic.descEn,
      severity: generic.severity,
      cause: generic.cause,
      signals: [],
      category: categoryFromCode(upper),
      source: 'OBD-II',
    };
  }
  return {
    description: `Neznámý kód ${upper}`,
    severity: guessSeverity(upper),
    cause: 'Kód není v lokální databázi — doporučena kontrola u autorizovaného servisu.',
    signals: [],
    category: categoryFromCode(upper),
    source: 'unknown',
  };
}

function guessSeverity(code: string): DTCSeverity {
  return code.startsWith('P03') ? 'high' : 'medium';
}

function categoryFromCode(code: string): string {
  const p = code[0];
  if (p === 'P') return 'Motor / hnací ústrojí';
  if (p === 'B') return 'Karoserie';
  if (p === 'C') return 'Podvozek';
  if (p === 'U') return 'Síť / komunikace';
  return '—';
}


class DTCEngine {
  private state: DTCState = {
    activeCodes: [],
    history: [],
    scanning: false,
    clearing: false,
    lastScan: null,
  };

  private listeners: ((state: DTCState) => void)[] = [];

  onUpdate(l: (state: DTCState) => void): () => void {
    this.listeners.push(l);
    return () => { this.listeners = this.listeners.filter(x => x !== l); };
  }

  private emit() {
    this.listeners.forEach(l => l({ ...this.state, activeCodes: [...this.state.activeCodes], history: [...this.state.history] }));
  }

  getState(): DTCState { return this.state; }

  async scanDTCs(): Promise<DTCCode[]> {
    this.state.scanning = true;
    this.emit();

    try {
      const raw = await elm327.sendCommand('03', 'high');
      const codes = this.parseDTCResponse(raw).map(code => this.enrichCode(code, false));

      this.state.activeCodes = codes;
      this.state.lastScan = Date.now();
      const session = {
        id: `dtc_${Date.now()}`,
        timestamp: Date.now(),
        codes: [...codes],
        clearedCodes: [],
      };
      this.state.history.push(session);
      dtcCache.save({
        ...session,
        codes: codes.map(c => ({ code: c.code, severity: c.severity, description: c.description })),
      }).catch(e => console.warn('[DTC] offline cache save failed', e));

      return codes;
    } finally {
      this.state.scanning = false;
      this.emit();
    }
  }

  async clearDTCs(): Promise<boolean> {
    this.state.clearing = true;
    this.emit();

    try {
      const response = await elm327.sendCommand('04', 'high');
      if (/ERROR|UNABLE|BUS INIT|CAN ERROR|\?/i.test(response)) {
        throw new Error(response || 'Mazání DTC selhalo');
      }

      const clearedCodes = this.state.activeCodes.map(c => c.code);
      if (this.state.history.length > 0) {
        this.state.history[this.state.history.length - 1].clearedCodes = clearedCodes;
        const last = this.state.history[this.state.history.length - 1];
        dtcCache.save({
          ...last,
          codes: last.codes.map(c => ({ code: c.code, severity: c.severity, description: c.description })),
        }).catch(e => console.warn('[DTC] offline cache save failed', e));
      }
      this.state.activeCodes = [];
      return true;
    } finally {
      this.state.clearing = false;
      this.emit();
    }
  }

  /**
   * Mode 07 – čekající (pending) chyby.
   * Vrací [] pokud odpověď je NO DATA / ERROR / STOPPED (nikdy nevrací fake „žádné chyby").
   */
  async scanPendingDTCs(): Promise<DTCCode[]> {
    const raw = await elm327.sendCommand('07', 'high').catch(() => '');
    const codes = this.parseGenericDtcResponse(raw, '47').map(code => this.enrichCode(code, true));
    return codes;
  }

  /**
   * Mode 0A – trvalé emisní chyby.
   */
  async scanPermanentDTCs(): Promise<DTCCode[]> {
    const raw = await elm327.sendCommand('0A', 'high').catch(() => '');
    const codes = this.parseGenericDtcResponse(raw, '4A').map(code => this.enrichCode(code, false));
    return codes;
  }

  /**
   * Mode 02 – Freeze Frame. Vrací raw response pro admin UI a dekódovaný objekt.
   * Neztratí celý freeze frame kvůli jednomu neúspěšnému PID.
   */
  async readFreezeFrame(): Promise<{ supported: boolean; raw: Record<string, string>; decoded: Record<string, number>; }> {
    const pids: Array<{ cmd: string; key: string; formula: (b: number[]) => number }> = [
      { cmd: '020C00', key: 'rpm', formula: (b) => (b[0] * 256 + b[1]) / 4 },
      { cmd: '020D00', key: 'speed', formula: (b) => b[0] },
      { cmd: '020500', key: 'coolantTemp', formula: (b) => b[0] - 40 },
      { cmd: '024200', key: 'voltage', formula: (b) => (b[0] * 256 + b[1]) / 1000 },
      { cmd: '022F00', key: 'fuelLevel', formula: (b) => (b[0] * 100) / 255 },
      { cmd: '020B00', key: 'map', formula: (b) => b[0] },
      { cmd: '021000', key: 'maf', formula: (b) => (b[0] * 256 + b[1]) / 100 },
    ];

    const raw: Record<string, string> = {};
    const decoded: Record<string, number> = {};
    let anyOk = false;

    for (const p of pids) {
      try {
        const response = await elm327.sendCommand(p.cmd, 'normal');
        raw[p.key] = response;
        if (!response || /NO\s*DATA|UNABLE|ERROR|STOPPED|\?/i.test(response)) continue;

        const pidHex = p.cmd.slice(2, 4).toUpperCase();
        const marker = `42${pidHex}`;
        const clean = response.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
        const idx = clean.indexOf(marker);
        if (idx < 0) continue;
        // za marker následuje frame number (1 byte) + data
        const data = clean.slice(idx + marker.length + 2);
        const bytes: number[] = [];
        for (let i = 0; i + 1 < data.length; i += 2) {
          bytes.push(parseInt(data.slice(i, i + 2), 16));
        }
        if (!bytes.length) continue;
        const value = p.formula(bytes);
        if (Number.isFinite(value)) {
          decoded[p.key] = value;
          anyOk = true;
        }
      } catch {
        /* skip individual PID */
      }
    }

    return { supported: anyOk, raw, decoded };
  }

  /**
   * Sdílený parser pro Mode 03/07/0A.
   *
   * Postup (podle Delphi-OBD):
   *   1) cleanElmResponse — echo/prompt/SEARCHING pryč
   *   2) parseIsoTp — složí single/multi-frame CAN payload (přeskočí PCI + hlavičky)
   *   3) najde pozitivní marker (43/47/4A), za ním jsou rovnou páry DTC bajtů
   *   4) decodeDtcPayload — páry bajtů → kódy, přeskočí 00 00
   *
   * Fallback: pokud ISO-TP nic nedá (ISO-9141/KWP2000), použije se legacy hex-scan
   * — nově ale správně přeskakuje počet DTC po markeru.
   */
  parseGenericDtcResponse(raw: string, marker: string): string[] {
    if (!raw || /NO\s*DATA|UNABLE|ERROR|STOPPED|SEARCHING|\?/i.test(raw)) return [];

    const markerByte = parseInt(marker, 16);
    const cmd = marker === '43' ? '03' : marker === '47' ? '07' : marker === '4A' ? '0A' : '';
    const cleaned = cleanElmResponse(raw, cmd);

    // 1) Primární cesta — ISO-TP
    try {
      const msg = parseIsoTp(cleaned);
      const payload = msg.payload;
      if (payload.length > 0 && payload[0] === markerByte) {
        const decoded = decodeDtcPayload(payload.slice(1));
        if (decoded.codes.length > 0) return decoded.codes.map((c) => c.code);
      }
    } catch (e) {
      console.warn('[DTC] ISO-TP parse failed, fallback to legacy:', e);
    }

    // 2) Legacy fallback pro non-CAN protokoly
    const found = new Set<string>();
    const lines = cleaned.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    for (const line of (lines.length ? lines : [cleaned])) {
      const clean = line.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
      const idx = clean.indexOf(marker.toUpperCase());
      if (idx < 0) continue;
      // Marker (2 znaky) → za ním jsou rovnou DTC páry. Mode 03/07/0A nemá count byte.
      const data = clean.slice(idx + marker.length);
      for (let i = 0; i + 3 < data.length; i += 4) {
        const pair = data.slice(i, i + 4);
        if (pair === '0000') continue;
        const bytes = [parseInt(pair.slice(0, 2), 16), parseInt(pair.slice(2, 4), 16)];
        if (bytes.some(Number.isNaN)) continue;
        const code = this.parseDTCCode(bytes);
        if (code !== 'Unknown') found.add(code);
      }
    }
    return [...found];
  }

  parseDTCResponse(raw: string): string[] {
    return this.parseGenericDtcResponse(raw, '43');
  }

  parseDTCCode(raw: number[]): string {
    if (raw.length < 2) return 'Unknown';
    const byte0 = raw[0];
    const byte1 = raw[1];
    const prefixes = ['P', 'C', 'B', 'U'];
    const prefix = prefixes[(byte0 >> 6) & 0x03];
    const digit1 = (byte0 >> 4) & 0x03;
    const digit2 = byte0 & 0x0F;
    const digit3 = (byte1 >> 4) & 0x0F;
    const digit4 = byte1 & 0x0F;
    return `${prefix}${digit1}${digit2.toString(16).toUpperCase()}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}`;
  }

  private enrichCode(code: string, isPending: boolean): DTCCode {
    const prefix = code[0];
    const system: DTCSystem = prefix === 'P' ? 'powertrain' : prefix === 'B' ? 'body' : prefix === 'C' ? 'chassis' : 'network';
    const info = resolveDTCInfo(code);
    return {
      code,
      system,
      description: info.description,
      descriptionEn: info.descriptionEn,
      category: info.category,
      firstCheck: info.firstCheck,
      moparNote: info.moparNote,
      source: info.source,
      severity: info.severity,
      possibleCause: info.cause,
      relatedSignals: info.signals,
      isActive: !isPending,
      isPending,
      occurenceCount: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };
  }


  getCriticalCodes(): DTCCode[] {
    return this.state.activeCodes.filter(c => c.severity === 'critical' || c.severity === 'high');
  }

  getCodesBySystem(system: DTCSystem): DTCCode[] {
    return this.state.activeCodes.filter(c => c.system === system);
  }

  getSuggestions(): { code: string; suggestion: string }[] {
    return this.state.activeCodes.map(c => ({ code: c.code, suggestion: c.possibleCause }));
  }

  getLinkedAnomalies(sensorValues: Record<string, number>): { code: string; signal: string; anomaly: string }[] {
    const anomalies: { code: string; signal: string; anomaly: string }[] = [];
    for (const dtc of this.state.activeCodes) {
      for (const signal of dtc.relatedSignals) {
        const value = sensorValues[signal];
        if (value === undefined) continue;
        if (signal === 'Battery Voltage' && (value < 11.5 || value > 15)) anomalies.push({ code: dtc.code, signal, anomaly: `Abnormal voltage: ${value}V` });
        if (signal === 'Coolant Temp' && value > 110) anomalies.push({ code: dtc.code, signal, anomaly: `High temp: ${value}°C` });
        if (signal === 'RPM' && value > 6500) anomalies.push({ code: dtc.code, signal, anomaly: `High RPM: ${value}` });
      }
    }
    return anomalies;
  }
}

export const dtcEngine = new DTCEngine();
