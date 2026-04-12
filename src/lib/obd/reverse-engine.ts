// Advanced Reverse Engineering Engine
// Byte-level analysis, variance, correlation, before/after, auto decoder maps

import { udsEngine, type DIDResult } from './uds-engine';

// ─── Types ───
export type ByteAnalysis = {
  byteIndex: number;
  variance: number;
  activityScore: number;
  uniqueValues: number;
  classification: ByteClassification;
  scalingGuess: number;
  suggestion: string;
  correlationTarget: string | null;
  correlationStrength: number;
};

export type ByteClassification = 'integer' | 'boolean' | 'enum' | 'ascii' | 'unknown';

export type DIDSnapshot = {
  did: number;
  bytes: number[];
  timestamp: number;
};

export type BeforeAfterResult = {
  did: number;
  didHex: string;
  byteChanges: { index: number; before: number; after: number; delta: number }[];
  significance: number;
};

export type DecoderEntry = {
  did: number;
  didHex: string;
  name: string;
  bytes: DecoderByteMap[];
  isEdited: boolean;
  lastUpdated: number;
};

export type DecoderByteMap = {
  byteIndex: number;
  dataType: ByteClassification;
  scaling: number;
  offset: number;
  unit: string;
  label: string;
  min: number;
  max: number;
};

export type REState = {
  analyses: Map<number, ByteAnalysis[]>;
  snapshots: Map<number, number[][]>; // did -> history of byte arrays
  decoderMap: Map<number, DecoderEntry>;
  beforeSnapshot: DIDSnapshot[] | null;
  afterResults: BeforeAfterResult[];
  running: boolean;
  pollCount: number;
  sessionSignals: Map<number, { accuracy: number; rank: number }>;
};

// Known reference signals for correlation
const REFERENCE_SIGNALS: { name: string; dids: number[]; range: [number, number] }[] = [
  { name: 'RPM', dids: [0xF426], range: [0, 8000] },
  { name: 'Vehicle Speed', dids: [0xF427], range: [0, 255] },
  { name: 'Throttle', dids: [0xF424], range: [0, 100] },
  { name: 'Coolant Temp', dids: [0xF420], range: [-40, 215] },
];

const SNAPSHOT_LIMIT = 200;
const STORAGE_KEY = 'chdp_decoder_map';

class ReverseEngineeringEngine {
  private state: REState = {
    analyses: new Map(),
    snapshots: new Map(),
    decoderMap: new Map(),
    beforeSnapshot: null,
    afterResults: [],
    running: false,
    pollCount: 0,
    sessionSignals: new Map(),
  };

  private listeners: ((state: REState) => void)[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private monitoredDIDs: number[] = [];
  private referenceValues: Map<string, number[]> = new Map();

  constructor() {
    this.loadDecoderMap();
  }

  onUpdate(l: (state: REState) => void): () => void {
    this.listeners.push(l);
    return () => { this.listeners = this.listeners.filter(x => x !== l); };
  }

  private emit() {
    this.listeners.forEach(l => l({ ...this.state }));
  }

  // ─── Byte-Level Analysis ───
  ingestDIDData(did: number, bytes: number[]) {
    const history = this.state.snapshots.get(did) || [];
    history.push([...bytes]);
    if (history.length > SNAPSHOT_LIMIT) history.shift();
    this.state.snapshots.set(did, history);

    if (history.length >= 3) {
      const analyses = this.analyzeBytes(did, history);
      this.state.analyses.set(did, analyses);
      this.autoUpdateDecoder(did, analyses);
    }

    // Update session learning
    const existing = this.state.sessionSignals.get(did) || { accuracy: 0, rank: 0 };
    existing.accuracy = Math.min(1, existing.accuracy + 0.01);
    existing.rank = history.length;
    this.state.sessionSignals.set(did, existing);
  }

  private analyzeBytes(did: number, history: number[][]): ByteAnalysis[] {
    const byteCount = Math.max(...history.map(h => h.length));
    const analyses: ByteAnalysis[] = [];

    for (let i = 0; i < byteCount; i++) {
      const values = history.map(h => h[i] ?? 0);
      const unique = new Set(values);
      const variance = this.computeVariance(values);
      const changes = values.slice(1).filter((v, idx) => v !== values[idx]).length;
      const activityScore = changes / Math.max(1, values.length - 1);

      const classification = this.classifyByte(values, unique);
      const scalingGuess = this.guessScaling(values);
      const { target, strength } = this.correlateWithReference(values);
      const suggestion = this.generateSuggestion(i, classification, target, variance, activityScore);

      analyses.push({
        byteIndex: i,
        variance,
        activityScore,
        uniqueValues: unique.size,
        classification,
        scalingGuess,
        suggestion,
        correlationTarget: target,
        correlationStrength: strength,
      });
    }

    return analyses;
  }

  private classifyByte(values: number[], unique: Set<number>): ByteClassification {
    if (unique.size <= 2 && values.every(v => v === 0 || v === 1)) return 'boolean';
    if (unique.size <= 8 && values.every(v => v < 16)) return 'enum';
    if (values.every(v => v >= 0x20 && v <= 0x7E)) return 'ascii';
    if (unique.size > 5) return 'integer';
    return 'unknown';
  }

  private guessScaling(values: number[]): number {
    const maxVal = Math.max(...values);
    if (maxVal === 0) return 1;
    if (maxVal <= 1) return 100;
    if (maxVal <= 10) return 10;
    return 1;
  }

  private correlateWithReference(values: number[]): { target: string | null; strength: number } {
    let bestTarget: string | null = null;
    let bestStrength = 0;

    for (const ref of REFERENCE_SIGNALS) {
      const refVals = this.referenceValues.get(ref.name);
      if (!refVals || refVals.length < 5) continue;

      const len = Math.min(values.length, refVals.length);
      const r = Math.abs(this.pearson(values.slice(-len), refVals.slice(-len)));
      if (r > bestStrength && r > 0.5) {
        bestStrength = r;
        bestTarget = ref.name;
      }
    }

    return { target: bestTarget, strength: bestStrength };
  }

  private generateSuggestion(idx: number, cls: ByteClassification, corr: string | null, variance: number, activity: number): string {
    if (corr) return `Byte ${idx} likely ${corr} (correlation)`;
    if (cls === 'boolean') return `Byte ${idx}: on/off flag`;
    if (cls === 'enum') return `Byte ${idx}: multi-state selector`;
    if (cls === 'ascii') return `Byte ${idx}: text character`;
    if (activity > 0.5) return `Byte ${idx}: active sensor value`;
    if (variance < 0.001) return `Byte ${idx}: static/config value`;
    return `Byte ${idx}: unknown (needs more data)`;
  }

  // ─── Reference Signal Tracking ───
  updateReference(name: string, value: number) {
    const arr = this.referenceValues.get(name) || [];
    arr.push(value);
    if (arr.length > SNAPSHOT_LIMIT) arr.shift();
    this.referenceValues.set(name, arr);
  }

  // ─── Before/After Analysis ───
  markBefore(dids: number[]) {
    const snapshots: DIDSnapshot[] = [];
    for (const did of dids) {
      const history = this.state.snapshots.get(did);
      if (history && history.length > 0) {
        snapshots.push({ did, bytes: [...history[history.length - 1]], timestamp: Date.now() });
      }
    }
    this.state.beforeSnapshot = snapshots;
    this.state.afterResults = [];
    this.emit();
  }

  markAfter(): BeforeAfterResult[] {
    if (!this.state.beforeSnapshot) return [];
    const results: BeforeAfterResult[] = [];

    for (const snap of this.state.beforeSnapshot) {
      const history = this.state.snapshots.get(snap.did);
      if (!history || history.length === 0) continue;

      const afterBytes = history[history.length - 1];
      const changes: BeforeAfterResult['byteChanges'] = [];

      for (let i = 0; i < Math.max(snap.bytes.length, afterBytes.length); i++) {
        const before = snap.bytes[i] ?? 0;
        const after = afterBytes[i] ?? 0;
        if (before !== after) {
          changes.push({ index: i, before, after, delta: after - before });
        }
      }

      if (changes.length > 0) {
        results.push({
          did: snap.did,
          didHex: `0x${snap.did.toString(16).toUpperCase().padStart(4, '0')}`,
          byteChanges: changes,
          significance: changes.length / Math.max(snap.bytes.length, afterBytes.length),
        });
      }
    }

    this.state.afterResults = results.sort((a, b) => b.significance - a.significance);
    this.emit();
    return results;
  }

  clearBeforeAfter() {
    this.state.beforeSnapshot = null;
    this.state.afterResults = [];
    this.emit();
  }

  // ─── Decoder Map ───
  private autoUpdateDecoder(did: number, analyses: ByteAnalysis[]) {
    const existing = this.state.decoderMap.get(did);
    if (existing?.isEdited) return; // Don't overwrite manual edits

    const bytes: DecoderByteMap[] = analyses.map(a => ({
      byteIndex: a.byteIndex,
      dataType: a.classification,
      scaling: a.scalingGuess,
      offset: 0,
      unit: '',
      label: a.suggestion,
      min: 0,
      max: 255,
    }));

    this.state.decoderMap.set(did, {
      did,
      didHex: `0x${did.toString(16).toUpperCase().padStart(4, '0')}`,
      name: `DID ${did.toString(16).toUpperCase()}`,
      bytes,
      isEdited: false,
      lastUpdated: Date.now(),
    });
  }

  updateDecoderEntry(did: number, entry: Partial<DecoderEntry>) {
    const existing = this.state.decoderMap.get(did);
    if (existing) {
      this.state.decoderMap.set(did, { ...existing, ...entry, isEdited: true, lastUpdated: Date.now() });
    }
    this.saveDecoderMap();
    this.emit();
  }

  getDecoderMap(): DecoderEntry[] {
    return Array.from(this.state.decoderMap.values());
  }

  exportDecoderMap(): string {
    return JSON.stringify(this.getDecoderMap(), null, 2);
  }

  private saveDecoderMap() {
    try {
      const data = this.getDecoderMap().filter(d => d.isEdited);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  private loadDecoderMap() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const entries: DecoderEntry[] = JSON.parse(raw);
        entries.forEach(e => this.state.decoderMap.set(e.did, e));
      }
    } catch {}
  }

  // ─── Monitoring ───
  async startMonitoring(dids: number[]) {
    this.monitoredDIDs = dids;
    this.state.running = true;
    this.emit();

    const poll = async () => {
      for (const did of this.monitoredDIDs) {
        if (!this.state.running) break;
        const result = await udsEngine.readDID(did);
        if ('parsed' in result) {
          this.ingestDIDData(did, result.rawBytes);

          // Track reference signals
          if (result.parsed.numericValue !== undefined) {
            for (const ref of REFERENCE_SIGNALS) {
              if (ref.dids.includes(did)) {
                this.updateReference(ref.name, result.parsed.numericValue);
              }
            }
          }
        }
      }
      this.state.pollCount++;
      this.emit();
    };

    this.pollTimer = setInterval(poll, 500);
    await poll();
  }

  stopMonitoring() {
    this.state.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.emit();
  }

  clearAll() {
    this.stopMonitoring();
    this.state.analyses.clear();
    this.state.snapshots.clear();
    this.state.afterResults = [];
    this.state.beforeSnapshot = null;
    this.state.pollCount = 0;
    this.emit();
  }

  getState(): REState { return this.state; }

  // Session learning stats
  getSessionStats() {
    return {
      totalDIDs: this.state.snapshots.size,
      totalSamples: this.state.pollCount,
      decoderEntries: this.state.decoderMap.size,
      topSignals: Array.from(this.state.sessionSignals.entries())
        .sort((a, b) => b[1].rank - a[1].rank)
        .slice(0, 10)
        .map(([did, s]) => ({ did, ...s })),
    };
  }

  // ─── Utils ───
  private computeVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  }

  private pearson(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;
    const mx = x.reduce((a, b) => a + b) / n;
    const my = y.reduce((a, b) => a + b) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = x[i] - mx, b = y[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    const d = Math.sqrt(dx * dy);
    return d === 0 ? 0 : num / d;
  }
}

export const reverseEngine = new ReverseEngineeringEngine();
