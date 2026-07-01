// DTC Engine — Diagnostic Trouble Code reader, parser, and analyzer
// Supports OBD Mode 03/04 and keeps a local session history.

import { elm327 } from '@/lib/obd/elm327-engine';
import { CHRYSLER_DATABASE } from '@/lib/obd/chrysler-database';
import { dtcCache } from '@/lib/obd/offline-cache';
import { lookupGenericDTC } from '@/lib/obd/dtc-database';

export type DTCSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DTCSystem = 'powertrain' | 'body' | 'chassis' | 'network';

export type DTCCode = {
  code: string;
  system: DTCSystem;
  description: string;
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

const DTC_DATABASE: Record<string, { desc: string; severity: DTCSeverity; cause: string; signals: string[] }> = {};
for (const dtc of CHRYSLER_DATABASE.dtcCodes) {
  DTC_DATABASE[dtc.code] = {
    desc: dtc.description,
    severity: dtc.severity,
    cause: dtc.possibleCause,
    signals: dtc.relatedSensors,
  };
}

/**
 * Resolve DTC description/severity/cause from a layered database:
 *   1. Chrysler-specific DB (highest priority)
 *   2. Generic OBD-II P-code DB (P0100-P0599)
 *   3. Fallback "Neznámý kód"
 */
export function resolveDTCInfo(code: string): { description: string; severity: DTCSeverity; cause: string; signals: string[] } {
  const upper = code.toUpperCase();
  const chrysler = DTC_DATABASE[upper];
  if (chrysler) {
    return { description: chrysler.desc, severity: chrysler.severity, cause: chrysler.cause, signals: chrysler.signals };
  }
  const generic = lookupGenericDTC(upper);
  if (generic) {
    return { description: generic.desc, severity: generic.severity, cause: generic.cause, signals: [] };
  }
  return {
    description: `Neznámý kód ${upper}`,
    severity: upper.startsWith('P03') ? 'high' : 'medium',
    cause: 'Kód není v lokální databázi — vyžaduje kontrolu servisním manuálem.',
    signals: [],
  };
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

  parseDTCResponse(raw: string): string[] {
    if (!raw || /NO\s*DATA|UNABLE|ERROR|STOPPED|SEARCHING|\?/i.test(raw)) return [];

    const found = new Set<string>();
    const lines = raw.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const candidates = lines.length ? lines : [raw];

    for (const line of candidates) {
      const clean = line.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
      const marker = clean.indexOf('43');
      if (marker < 0) continue;

      const data = clean.slice(marker + 2);
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
