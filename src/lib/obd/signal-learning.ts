// AI Signal Learning Engine
// Stores historical DID values, computes variance/activity, classifies signals,
// detects correlations, and generates smart dashboard widget configs

import { udsEngine, type DIDResult } from './uds-engine';
import { getDIDDef, CHRYSLER_DIDS } from './chrysler-dids';
import { PIDS } from './obd-pids';

// ─── Types ───

export type SignalType = 'string' | 'number' | 'flag' | 'unknown';

export type SignalSample = {
  value: number | string;
  rawBytes: number[];
  timestamp: number;
};

export type LearnedSignal = {
  did: number;
  didHex: string;
  name: string;
  signalType: SignalType;
  isLive: boolean;
  activityScore: number;       // 0–1, how active/changing
  variance: number;            // statistical variance of numeric values
  mean: number;
  min: number;
  max: number;
  sampleCount: number;
  lastValue: string;
  lastNumeric: number | null;
  unit: string;
  history: SignalSample[];     // rolling buffer
  correlations: SignalCorrelation[];
  widgetType: WidgetType;
  category: string;
  confidence: number;          // 0–1, confidence in classification
  priority: number;            // sort order for dashboard
};

export type SignalCorrelation = {
  targetDID: number;
  targetName: string;
  correlationCoeff: number;   // -1 to 1 (Pearson)
  suggestedName: string;      // e.g. "Correlates with RPM"
  strength: 'strong' | 'moderate' | 'weak';
};

export type WidgetType = 'gauge' | 'number_card' | 'text_card' | 'flag_indicator' | 'sparkline' | 'none';

export type DashboardWidget = {
  did: number;
  didHex: string;
  label: string;
  widgetType: WidgetType;
  unit: string;
  min: number;
  max: number;
  value: number | string;
  isLive: boolean;
  activityScore: number;
  correlations: SignalCorrelation[];
  priority: number;  // sort order, higher = more prominent
};

// ─── Constants ───
const HISTORY_LIMIT = 100;
const LIVE_THRESHOLD = 0.02;        // variance threshold to consider "live"
const ACTIVITY_DECAY = 0.95;        // exponential decay for activity score
const CORRELATION_MIN = 0.5;        // minimum |r| to report
const POLL_INTERVAL = 600;          // ms between learning polls

// Known signal templates for correlation matching
const KNOWN_SIGNALS: { name: string; didPatterns: number[]; expectedRange: [number, number]; unit: string }[] = [
  { name: 'Engine RPM', didPatterns: [0xF426, 0x010C], expectedRange: [0, 8000], unit: 'rpm' },
  { name: 'Vehicle Speed', didPatterns: [0xF427, 0x010D], expectedRange: [0, 255], unit: 'km/h' },
  { name: 'Coolant Temp', didPatterns: [0xF420, 0x0105], expectedRange: [-40, 215], unit: '°C' },
  { name: 'Throttle', didPatterns: [0xF424, 0x0111], expectedRange: [0, 100], unit: '%' },
  { name: 'Battery Voltage', didPatterns: [0xF425, 0x0142], expectedRange: [0, 20], unit: 'V' },
  { name: 'Intake Air Temp', didPatterns: [0xF421], expectedRange: [-40, 80], unit: '°C' },
  { name: 'MAP Sensor', didPatterns: [0xF422], expectedRange: [0, 300], unit: 'kPa' },
  { name: 'Fuel Level', didPatterns: [0xF42E], expectedRange: [0, 100], unit: '%' },
  { name: 'Trans Fluid Temp', didPatterns: [0xF42B], expectedRange: [-40, 200], unit: '°C' },
  { name: 'Steering Angle', didPatterns: [0xF42D], expectedRange: [-780, 780], unit: '°' },
];

// ─── Classification ───

function classifySignalType(samples: SignalSample[]): { type: SignalType; confidence: number } {
  if (samples.length === 0) return { type: 'unknown', confidence: 0 };

  const firstSample = samples[0];

  // Check if string-like
  if (typeof firstSample.value === 'string') {
    const allStrings = samples.every(s => typeof s.value === 'string');
    if (allStrings) {
      const allSame = samples.every(s => s.value === firstSample.value);
      if (allSame && String(firstSample.value).length > 4) {
        return { type: 'string', confidence: 0.9 };
      }
    }
  }

  // Check numeric
  const numericSamples = samples.filter(s => typeof s.value === 'number').map(s => s.value as number);
  if (numericSamples.length > 0) {
    const uniqueValues = new Set(numericSamples);

    // Flag: very few unique values (boolean/enum)
    if (uniqueValues.size <= 3 && numericSamples.length >= 5) {
      const allSmall = numericSamples.every(v => v >= 0 && v <= 15);
      if (allSmall) return { type: 'flag', confidence: 0.8 };
    }

    // Number with range
    return { type: 'number', confidence: 0.85 };
  }

  // Byte-level analysis for raw data
  if (firstSample.rawBytes.length === 1) {
    const vals = samples.map(s => s.rawBytes[0]);
    const unique = new Set(vals);
    if (unique.size <= 2) return { type: 'flag', confidence: 0.7 };
  }

  return { type: 'unknown', confidence: 0.3 };
}

function computeVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

function computePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 5) return 0;

  const xs = x.slice(-n);
  const ys = y.slice(-n);

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

function chooseWidgetType(signal: { signalType: SignalType; isLive: boolean; variance: number; min: number; max: number }): WidgetType {
  if (signal.signalType === 'string') return 'text_card';
  if (signal.signalType === 'flag') return 'flag_indicator';
  if (!signal.isLive) return 'number_card';
  if (signal.max - signal.min > 50 && signal.variance > 10) return 'gauge';
  if (signal.isLive && signal.variance > 0) return 'sparkline';
  return 'number_card';
}

function computePriority(signal: LearnedSignal): number {
  let priority = 0;
  if (signal.isLive) priority += 50;
  priority += signal.activityScore * 30;
  priority += signal.confidence * 10;
  if (signal.widgetType === 'gauge') priority += 20;
  if (signal.correlations.length > 0) priority += 10;
  // Known important DIDs get a boost
  const knownMatch = KNOWN_SIGNALS.find(k => k.didPatterns.includes(signal.did));
  if (knownMatch) priority += 25;
  return priority;
}

// ─── Signal Learning Engine ───

type SignalListener = (signals: LearnedSignal[]) => void;
type DashboardListener = (widgets: DashboardWidget[]) => void;

class SignalLearningEngine {
  private signals: Map<number, LearnedSignal> = new Map();
  private signalListeners: SignalListener[] = [];
  private dashboardListeners: DashboardListener[] = [];
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private pollDIDs: number[] = [];
  private isNative = false;

  constructor() {
    this.isNative = typeof (window as any).Capacitor !== 'undefined';
  }

  onSignals(l: SignalListener): () => void {
    this.signalListeners.push(l);
    return () => { this.signalListeners = this.signalListeners.filter(x => x !== l); };
  }

  onDashboard(l: DashboardListener): () => void {
    this.dashboardListeners.push(l);
    return () => { this.dashboardListeners = this.dashboardListeners.filter(x => x !== l); };
  }

  isRunning() { return this.running; }
  getSignals(): LearnedSignal[] { return Array.from(this.signals.values()); }
  getSignal(did: number) { return this.signals.get(did); }

  // Seed with known DIDs to monitor
  setMonitoredDIDs(dids: number[]) {
    this.pollDIDs = [...dids];
  }

  // Add DIDs from discovery results
  addDiscoveredDIDs(dids: number[]) {
    for (const did of dids) {
      if (!this.pollDIDs.includes(did)) this.pollDIDs.push(did);
    }
  }

  // Ingest a single reading (can be called externally)
  ingestReading(did: number, result: DIDResult) {
    const def = getDIDDef(did);
    const existing = this.signals.get(did);

    let numericValue: number | null = null;
    let stringValue: string = result.parsed.stringValue;

    if (result.parsed.numericValue !== undefined) {
      numericValue = result.parsed.numericValue;
    } else if (result.parsed.type === 'scaled' || result.parsed.type === 'number') {
      const parsed = parseFloat(result.parsed.stringValue);
      if (!isNaN(parsed)) numericValue = parsed;
    }

    const sample: SignalSample = {
      value: numericValue ?? stringValue,
      rawBytes: [...result.rawBytes],
      timestamp: Date.now(),
    };

    if (existing) {
      // Update existing signal
      const history = [...existing.history, sample].slice(-HISTORY_LIMIT);
      const numericHistory = history
        .filter(s => typeof s.value === 'number')
        .map(s => s.value as number);

      const variance = computeVariance(numericHistory);
      const mean = numericHistory.length > 0
        ? numericHistory.reduce((a, b) => a + b, 0) / numericHistory.length : 0;
      const min = numericHistory.length > 0 ? Math.min(...numericHistory) : 0;
      const max = numericHistory.length > 0 ? Math.max(...numericHistory) : 0;

      const valueChanged = existing.lastValue !== stringValue;
      const activityScore = valueChanged
        ? Math.min(1, existing.activityScore * ACTIVITY_DECAY + 0.1)
        : existing.activityScore * ACTIVITY_DECAY;

      const isLive = variance > LIVE_THRESHOLD || activityScore > 0.1;

      const { type: signalType, confidence } = classifySignalType(history);
      const widgetType = chooseWidgetType({ signalType, isLive, variance, min, max });

      const updated: LearnedSignal = {
        ...existing,
        signalType,
        isLive,
        activityScore,
        variance,
        mean,
        min,
        max,
        sampleCount: existing.sampleCount + 1,
        lastValue: stringValue,
        lastNumeric: numericValue,
        history,
        widgetType,
        confidence,
      };

      // Recompute correlations every 20 samples
      if (updated.sampleCount % 20 === 0) {
        updated.correlations = this.computeCorrelations(did, numericHistory);
      }

      updated.priority = computePriority(updated);
      this.signals.set(did, updated);
    } else {
      // New signal
      const { type: signalType, confidence } = classifySignalType([sample]);
      const unit = def.scaling?.unit || '';
      const newSignal: LearnedSignal = {
        did,
        didHex: `0x${did.toString(16).toUpperCase().padStart(4, '0')}`,
        name: def.name,
        signalType,
        isLive: false,
        activityScore: 0,
        variance: 0,
        mean: numericValue ?? 0,
        min: numericValue ?? 0,
        max: numericValue ?? 0,
        sampleCount: 1,
        lastValue: stringValue,
        lastNumeric: numericValue,
        unit,
        history: [sample],
        correlations: [],
        widgetType: 'number_card',
        category: def.category,
        confidence,
        priority: 0,
      };
      newSignal.priority = computePriority(newSignal);
      this.signals.set(did, newSignal);
    }
  }

  private computeCorrelations(did: number, values: number[]): SignalCorrelation[] {
    if (values.length < 10) return [];
    const correlations: SignalCorrelation[] = [];

    for (const [otherDID, otherSignal] of this.signals) {
      if (otherDID === did) continue;
      if (otherSignal.signalType !== 'number') continue;

      const otherValues = otherSignal.history
        .filter(s => typeof s.value === 'number')
        .map(s => s.value as number);

      if (otherValues.length < 10) continue;

      const r = computePearsonCorrelation(values, otherValues);
      const absR = Math.abs(r);

      if (absR >= CORRELATION_MIN) {
        const strength: 'strong' | 'moderate' | 'weak' =
          absR >= 0.8 ? 'strong' : absR >= 0.6 ? 'moderate' : 'weak';

        // Try to match to known signal name
        const knownMatch = KNOWN_SIGNALS.find(k => k.didPatterns.includes(otherDID));
        const suggestedName = knownMatch
          ? `Correlates with ${knownMatch.name}`
          : `Correlates with ${otherSignal.name}`;

        correlations.push({
          targetDID: otherDID,
          targetName: otherSignal.name,
          correlationCoeff: parseFloat(r.toFixed(3)),
          suggestedName,
          strength,
        });
      }
    }

    return correlations.sort((a, b) => Math.abs(b.correlationCoeff) - Math.abs(a.correlationCoeff)).slice(0, 5);
  }

  // Generate auto-dashboard widget configs from learned signals
  generateDashboard(): DashboardWidget[] {
    const signals = this.getSignals()
      .filter(s => s.sampleCount >= 3)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    return signals
      .filter(s => s.widgetType !== 'none')
      .slice(0, 12)
      .map(s => ({
        did: s.did,
        didHex: s.didHex,
        label: s.name,
        widgetType: s.widgetType,
        unit: s.unit,
        min: s.min,
        max: s.max,
        value: s.lastNumeric ?? s.lastValue,
        isLive: s.isLive,
        activityScore: s.activityScore,
        correlations: s.correlations,
        priority: s.priority ?? 0,
      }));
  }

  // Start learning loop
  async startLearning() {
    if (this.running) return;
    this.running = true;

    // Default monitored DIDs if none set
    if (this.pollDIDs.length === 0) {
      this.pollDIDs = [
        0xF190, 0xF188, 0xF186, // Identification
        0xF420, 0xF421, 0xF422, 0xF424, 0xF425, 0xF426, 0xF427, 0xF42E, 0xF42B, // Sensors
      ];
    }

    const poll = async () => {
      for (const did of this.pollDIDs) {
        if (!this.running) break;
        const result = await udsEngine.readDID(did);
        if ('parsed' in result) {
          this.ingestReading(did, result);
        }
      }

      // Emit updates
      this.signalListeners.forEach(l => l(this.getSignals()));
      this.dashboardListeners.forEach(l => l(this.generateDashboard()));
    };

    this.pollInterval = setInterval(poll, POLL_INTERVAL);
    await poll(); // immediate first poll
  }

  stopLearning() {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  clearSignals() {
    this.signals.clear();
    this.signalListeners.forEach(l => l([]));
    this.dashboardListeners.forEach(l => l([]));
  }
}

export const signalEngine = new SignalLearningEngine();
