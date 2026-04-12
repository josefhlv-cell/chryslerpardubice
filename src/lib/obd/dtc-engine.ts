// DTC Engine — Diagnostic Trouble Code reader, parser, and analyzer
// Supports OBD Mode 03/04 and UDS 0x19 ReadDTCInformation
// Now integrated with centralized Chrysler database

import { udsEngine } from './uds-engine';
import { CHRYSLER_DATABASE, getDTCInfo } from './chrysler-database';
// ─── Types ───
export type DTCSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DTCSystem = 'powertrain' | 'body' | 'chassis' | 'network';

export type DTCCode = {
  code: string;          // e.g. "P0300"
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

// Build DTC_DATABASE from centralized Chrysler database
const DTC_DATABASE: Record<string, { desc: string; severity: DTCSeverity; cause: string; signals: string[] }> = {};
for (const dtc of CHRYSLER_DATABASE.dtcCodes) {
  DTC_DATABASE[dtc.code] = {
    desc: dtc.description,
    severity: dtc.severity,
    cause: dtc.possibleCause,
    signals: dtc.relatedSensors,
  };
}

// Simulated DTCs for demo
const SIMULATED_DTCS = ['P0128', 'P0456', 'P0562', 'B1004', 'U0401'];

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
    this.listeners.forEach(l => l({ ...this.state }));
  }

  getState(): DTCState { return this.state; }

  // ─── Read DTCs ───
  async scanDTCs(): Promise<DTCCode[]> {
    this.state.scanning = true;
    this.emit();

    // Simulate OBD Mode 03 + UDS 0x19
    await new Promise(r => setTimeout(r, 800 + Math.random() * 600));

    const codes: DTCCode[] = SIMULATED_DTCS.map(code => {
      const prefix = code[0];
      const system: DTCSystem = prefix === 'P' ? 'powertrain' : prefix === 'B' ? 'body' : prefix === 'C' ? 'chassis' : 'network';
      const dbEntry = DTC_DATABASE[code];

      return {
        code,
        system,
        description: dbEntry?.desc || `Unknown code ${code}`,
        severity: dbEntry?.severity || 'low',
        possibleCause: dbEntry?.cause || 'Unknown',
        relatedSignals: dbEntry?.signals || [],
        isActive: Math.random() > 0.3,
        isPending: Math.random() > 0.7,
        occurenceCount: Math.floor(Math.random() * 20) + 1,
        firstSeen: Date.now() - Math.floor(Math.random() * 86400000 * 30),
        lastSeen: Date.now() - Math.floor(Math.random() * 3600000),
      };
    });

    this.state.activeCodes = codes;
    this.state.scanning = false;
    this.state.lastScan = Date.now();

    // Save to history
    this.state.history.push({
      id: `dtc_${Date.now()}`,
      timestamp: Date.now(),
      codes: [...codes],
      clearedCodes: [],
    });

    this.emit();
    return codes;
  }

  // ─── Clear DTCs ───
  async clearDTCs(): Promise<boolean> {
    this.state.clearing = true;
    this.emit();

    // Simulate OBD Mode 04
    await new Promise(r => setTimeout(r, 600));

    const clearedCodes = this.state.activeCodes.map(c => c.code);

    if (this.state.history.length > 0) {
      this.state.history[this.state.history.length - 1].clearedCodes = clearedCodes;
    }

    this.state.activeCodes = [];
    this.state.clearing = false;
    this.emit();
    return true;
  }

  // ─── Analysis ───
  getCriticalCodes(): DTCCode[] {
    return this.state.activeCodes.filter(c => c.severity === 'critical' || c.severity === 'high');
  }

  getCodesBySystem(system: DTCSystem): DTCCode[] {
    return this.state.activeCodes.filter(c => c.system === system);
  }

  getSuggestions(): { code: string; suggestion: string }[] {
    return this.state.activeCodes.map(c => ({
      code: c.code,
      suggestion: c.possibleCause,
    }));
  }

  // Link DTCs with sensor anomalies
  getLinkedAnomalies(sensorValues: Record<string, number>): { code: string; signal: string; anomaly: string }[] {
    const anomalies: { code: string; signal: string; anomaly: string }[] = [];

    for (const dtc of this.state.activeCodes) {
      for (const signal of dtc.relatedSignals) {
        const value = sensorValues[signal];
        if (value !== undefined) {
          if (signal === 'Battery Voltage' && (value < 11.5 || value > 15)) {
            anomalies.push({ code: dtc.code, signal, anomaly: `Abnormal voltage: ${value}V` });
          }
          if (signal === 'Coolant Temp' && value > 110) {
            anomalies.push({ code: dtc.code, signal, anomaly: `High temp: ${value}°C` });
          }
          if (signal === 'RPM' && value > 6500) {
            anomalies.push({ code: dtc.code, signal, anomaly: `High RPM: ${value}` });
          }
        }
      }
    }
    return anomalies;
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
}

export const dtcEngine = new DTCEngine();
