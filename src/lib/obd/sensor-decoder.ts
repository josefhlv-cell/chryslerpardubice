// Sensor Decoder Engine — Live F42x / 210x block parsing with correlation detection
// Integrated with chrysler-database for auto-scaling & dashboard widget mapping

import { udsEngine, parseDIDValue, type DIDResult } from '@/lib/obd/uds-engine';
import { getDIDDef, CHRYSLER_DIDS } from '@/lib/obd/chrysler-dids';
import { CHRYSLER_DATABASE, type LiveSensorDID } from '@/lib/obd/chrysler-database';

// Build lookup from chrysler-database for scaling & widget info
const DB_SENSOR_MAP = new Map<number, LiveSensorDID>();
CHRYSLER_DATABASE.liveSensors.forEach(s => DB_SENSOR_MAP.set(s.did, s));

export type DecodedSensor = {
  did: number;
  didHex: string;
  name: string;
  shortName: string;
  category: string;
  value: number | string;
  unit: string;
  rawHex: string;
  rawBytes: number[];
  history: { value: number; ts: number }[];
  variance: number;
  activityScore: number;
  isLive: boolean;
  lastUpdate: number;
  // Dashboard mapping from chrysler-database
  dashboardWidget: 'gauge' | 'number' | 'bar' | 'boolean' | 'text';
  dashboardColor: string;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  ecuModule: string;
  aiCorrelation: string[];
};

export type CorrelationPair = {
  didA: number;
  didB: number;
  nameA: string;
  nameB: string;
  coefficient: number;
  strength: 'strong' | 'moderate' | 'weak';
};

export type DecoderState = {
  sensors: Map<number, DecodedSensor>;
  correlations: CorrelationPair[];
  running: boolean;
  pollCount: number;
  lastPollMs: number;
};

const HISTORY_SIZE = 60;
const LIVE_THRESHOLD = 0.005; // variance threshold for "live" detection
const CORRELATION_WINDOW = 30;

// Known sensor DIDs for auto-polling
const SENSOR_DIDS = Object.keys(CHRYSLER_DIDS)
  .map(Number)
  .filter(did => {
    const def = CHRYSLER_DIDS[did];
    return def.category === 'sensor' || def.category === 'extended';
  });

class SensorDecoder {
  private state: DecoderState = {
    sensors: new Map(),
    correlations: [],
    running: false,
    pollCount: 0,
    lastPollMs: 0,
  };

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: ((state: DecoderState) => void)[] = [];
  private pollIntervalMs = 500;
  private activeDIDs: number[] = [];

  // ─── Subscribe ───
  onUpdate(listener: (state: DecoderState) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emit() {
    const snapshot = { ...this.state, sensors: new Map(this.state.sensors) };
    this.listeners.forEach(l => l(snapshot));
  }

  // ─── Start / Stop ───
  start(dids?: number[]) {
    this.activeDIDs = dids && dids.length > 0 ? dids : SENSOR_DIDS;
    this.state.running = true;
    this.emit();
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  stop() {
    this.state.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.emit();
  }

  clear() {
    this.stop();
    this.state.sensors.clear();
    this.state.correlations = [];
    this.state.pollCount = 0;
    this.emit();
  }

  setInterval(ms: number) {
    this.pollIntervalMs = Math.max(200, ms);
    if (this.state.running) {
      this.stop();
      this.start(this.activeDIDs);
    }
  }

  getState(): DecoderState { return this.state; }
  getSensors(): DecodedSensor[] { return Array.from(this.state.sensors.values()); }
  getLiveSensors(): DecodedSensor[] { return this.getSensors().filter(s => s.isLive); }

  // ─── Poll Cycle ───
  private async poll() {
    if (!this.state.running) return;
    const t0 = performance.now();

    for (const did of this.activeDIDs) {
      if (!this.state.running) break;
      const result = await udsEngine.readDID(did);
      if ('parsed' in result) {
        this.ingestResult(result);
      }
    }

    this.state.pollCount++;
    this.state.lastPollMs = Math.round(performance.now() - t0);

    // Recompute correlations every 5 polls
    if (this.state.pollCount % 5 === 0) {
      this.computeCorrelations();
    }

    this.emit();
  }

  // ─── Ingest a DID result ───
  private ingestResult(result: DIDResult) {
    const existing = this.state.sensors.get(result.did);
    const dbSensor = DB_SENSOR_MAP.get(result.did);

    // Apply scaling from chrysler-database if available
    let numValue = result.parsed.numericValue ?? 0;
    if (dbSensor) {
      numValue = numValue * dbSensor.scaling + dbSensor.offset;
    }

    const history = existing?.history ?? [];
    history.push({ value: numValue, ts: result.timestamp });
    if (history.length > HISTORY_SIZE) history.shift();

    const variance = this.computeVariance(history.map(h => h.value));
    const activityScore = this.computeActivity(history);

    const sensor: DecodedSensor = {
      did: result.did,
      didHex: result.didHex,
      name: dbSensor?.name ?? result.definition.name,
      shortName: dbSensor?.shortName ?? result.definition.shortName,
      category: result.definition.category,
      value: result.parsed.numericValue !== undefined ? numValue : result.parsed.stringValue,
      unit: dbSensor?.unit ?? result.parsed.unit ?? '',
      rawHex: result.rawHex,
      rawBytes: result.rawBytes,
      history,
      variance,
      activityScore,
      isLive: variance > LIVE_THRESHOLD || activityScore > 0.3,
      lastUpdate: result.timestamp,
      // Dashboard mapping from chrysler-database
      dashboardWidget: dbSensor?.dashboardWidget ?? 'number',
      dashboardColor: dbSensor?.dashboardColor ?? 'primary',
      warningThreshold: dbSensor?.warningThreshold ?? null,
      criticalThreshold: dbSensor?.criticalThreshold ?? null,
      ecuModule: dbSensor?.ecuModule ?? 'Unknown',
      aiCorrelation: dbSensor?.aiCorrelation ?? [],
    };

    this.state.sensors.set(result.did, sensor);
  }

  // ─── Stats ───
  private computeVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 0;
    const sumSq = values.reduce((s, v) => s + (v - mean) ** 2, 0);
    const stddev = Math.sqrt(sumSq / values.length);
    return stddev / Math.abs(mean); // CV
  }

  private computeActivity(history: { value: number; ts: number }[]): number {
    if (history.length < 3) return 0;
    let changes = 0;
    for (let i = 1; i < history.length; i++) {
      if (history[i].value !== history[i - 1].value) changes++;
    }
    return changes / (history.length - 1);
  }

  // ─── Pearson Correlation ───
  private computeCorrelations() {
    const numericSensors = this.getSensors().filter(
      s => typeof s.value === 'number' && s.history.length >= CORRELATION_WINDOW
    );
    if (numericSensors.length < 2) return;

    const pairs: CorrelationPair[] = [];
    for (let i = 0; i < numericSensors.length; i++) {
      for (let j = i + 1; j < numericSensors.length; j++) {
        const a = numericSensors[i];
        const b = numericSensors[j];
        const len = Math.min(a.history.length, b.history.length, CORRELATION_WINDOW);
        const va = a.history.slice(-len).map(h => h.value);
        const vb = b.history.slice(-len).map(h => h.value);
        const r = this.pearson(va, vb);
        const absR = Math.abs(r);
        if (absR > 0.4) {
          pairs.push({
            didA: a.did, didB: b.did,
            nameA: a.shortName, nameB: b.shortName,
            coefficient: r,
            strength: absR > 0.8 ? 'strong' : absR > 0.6 ? 'moderate' : 'weak',
          });
        }
      }
    }
    this.state.correlations = pairs.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
  }

  private pearson(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 3) return 0;
    const mx = x.reduce((a, b) => a + b) / n;
    const my = y.reduce((a, b) => a + b) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a = x[i] - mx, b = y[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    const denom = Math.sqrt(dx * dy);
    return denom === 0 ? 0 : num / denom;
  }
}

export const sensorDecoder = new SensorDecoder();
