// CAN Bus Analyzer Engine
// Live stream capture, frame history, byte-diff, variance detection, signal mapping

import { elm327 } from '@/lib/obd/elm327-engine';

// ─── Types ───

export type CANFrame = {
  id: string;          // CAN arbitration ID (hex, e.g. "7E8")
  data: number[];      // 0–8 data bytes
  dlc: number;         // data length code
  timestamp: number;   // ms since capture start
  rawHex: string;      // original hex string
};

export type TrackedFrame = {
  id: string;
  current: CANFrame;
  previous: CANFrame | null;
  changedBytes: boolean[];   // per-byte change flag
  history: CANFrame[];       // rolling buffer
  count: number;
  firstSeen: number;
  lastSeen: number;
  intervalMs: number;        // avg interval between frames
  byteVariance: number[];    // variance per byte position (0–1)
  mappingSuggestions: SignalMapping[];
};

export type SignalMapping = {
  signalName: string;
  startByte: number;
  length: number;  // bytes
  formula: string;
  confidence: number;
  reasoning: string;
};

export type CANFilter = {
  idFilter: string;
  byteIndex: number | null;
  byteValue: number | null;
  didFilter: string;
};

export type CaptureStats = {
  totalFrames: number;
  uniqueIDs: number;
  framesPerSec: number;
  captureMs: number;
  running: boolean;
};

// ─── Signal Mapping Heuristics ───

const KNOWN_SIGNAL_PATTERNS: {
  name: string;
  canIds: string[];
  check: (frames: CANFrame[]) => { startByte: number; length: number; formula: string; confidence: number; reasoning: string } | null;
}[] = [
  {
    name: 'Engine RPM',
    canIds: ['7E8', '7E0', '2C1', '308'],
    check: (frames) => {
      // RPM typically: two bytes, value/4, range 0–8000 → raw 0–32000
      for (let b = 0; b < 7; b++) {
        const vals = frames.slice(-10).map(f => ((f.data[b] ?? 0) << 8) | (f.data[b + 1] ?? 0));
        const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
        const scaled = avg / 4;
        if (scaled >= 0 && scaled <= 8000 && avg > 100) {
          const variance = Math.sqrt(vals.reduce((a, v) => a + (v - avg) ** 2, 0) / vals.length) / (avg || 1);
          if (variance > 0.01 && variance < 0.5) {
            return { startByte: b, length: 2, formula: '(A*256+B)/4', confidence: 0.6, reasoning: `Bytes ${b}-${b + 1}: avg ${scaled.toFixed(0)} rpm range, moderate variance` };
          }
        }
      }
      return null;
    },
  },
  {
    name: 'Vehicle Speed',
    canIds: ['7E8', '7E0', '2C4', '309'],
    check: (frames) => {
      for (let b = 0; b < 8; b++) {
        const vals = frames.slice(-10).map(f => f.data[b] ?? 0);
        const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
        if (avg >= 0 && avg <= 255) {
          const allSame = vals.every(v => v === vals[0]);
          if (!allSame && avg < 200) {
            return { startByte: b, length: 1, formula: 'A', confidence: 0.4, reasoning: `Byte ${b}: range 0-255 km/h pattern` };
          }
        }
      }
      return null;
    },
  },
  {
    name: 'Coolant Temperature',
    canIds: ['7E8', '7E0', '2C0'],
    check: (frames) => {
      for (let b = 0; b < 8; b++) {
        const vals = frames.slice(-10).map(f => f.data[b] ?? 0);
        const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
        const temp = avg - 40;
        if (temp >= 60 && temp <= 110) {
          const variance = Math.sqrt(vals.reduce((a, v) => a + (v - avg) ** 2, 0) / vals.length);
          if (variance < 3) {
            return { startByte: b, length: 1, formula: 'A-40', confidence: 0.5, reasoning: `Byte ${b}: value ${avg.toFixed(0)} → ${temp.toFixed(0)}°C, low variance (stable temp)` };
          }
        }
      }
      return null;
    },
  },
  {
    name: 'Throttle Position',
    canIds: ['7E8', '7E0', '2C1'],
    check: (frames) => {
      for (let b = 0; b < 8; b++) {
        const vals = frames.slice(-10).map(f => f.data[b] ?? 0);
        const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
        const pct = (avg / 255) * 100;
        if (pct >= 0 && pct <= 100) {
          const variance = Math.sqrt(vals.reduce((a, v) => a + (v - avg) ** 2, 0) / vals.length) / (avg || 1);
          if (variance > 0.05) {
            return { startByte: b, length: 1, formula: 'A*100/255', confidence: 0.35, reasoning: `Byte ${b}: ${pct.toFixed(1)}% range with fluctuation` };
          }
        }
      }
      return null;
    },
  },
  {
    name: 'Engine Load',
    canIds: ['7E8', '7E0'],
    check: (frames) => {
      for (let b = 0; b < 8; b++) {
        const vals = frames.slice(-10).map(f => f.data[b] ?? 0);
        const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
        const pct = (avg / 255) * 100;
        if (pct >= 5 && pct <= 95) {
          return { startByte: b, length: 1, formula: 'A*100/255', confidence: 0.3, reasoning: `Byte ${b}: ${pct.toFixed(1)}% — possible load/duty cycle` };
        }
      }
      return null;
    },
  },
];

function detectMappings(id: string, frames: CANFrame[]): SignalMapping[] {
  if (frames.length < 5) return [];
  const suggestions: SignalMapping[] = [];

  for (const pattern of KNOWN_SIGNAL_PATTERNS) {
    if (pattern.canIds.length > 0 && !pattern.canIds.includes(id)) continue;
    const result = pattern.check(frames);
    if (result) {
      suggestions.push({
        signalName: pattern.name,
        ...result,
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

function computeByteVariance(history: CANFrame[]): number[] {
  if (history.length < 2) return Array(8).fill(0);
  const variance: number[] = [];
  for (let b = 0; b < 8; b++) {
    const vals = history.map(f => f.data[b] ?? 0);
    const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
    const v = Math.sqrt(vals.reduce((a, v) => a + (v - avg) ** 2, 0) / vals.length);
    variance.push(avg > 0 ? Math.min(1, v / (avg || 1)) : 0);
  }
  return variance;
}

// ─── Simulated CAN Traffic ───
const SIM_CAN_IDS = ['7E8', '2C0', '2C1', '2C4', '308', '309', '3B0', '3D0'];

function generateSimFrame(tick: number): CANFrame {
  const id = SIM_CAN_IDS[Math.floor(Math.random() * SIM_CAN_IDS.length)];
  const dlc = 8;
  const data: number[] = [];

  switch (id) {
    case '7E8': {
      // Engine data: RPM(b0-1), speed(b2), coolant(b3), throttle(b4), load(b5)
      const rpm = 750 + Math.sin(tick * 0.05) * 500 + Math.random() * 100;
      const rpmRaw = Math.round(rpm * 4);
      data.push((rpmRaw >> 8) & 0xFF, rpmRaw & 0xFF);
      data.push(Math.round(Math.max(0, Math.sin(tick * 0.02) * 60 + Math.random() * 5)));
      data.push(Math.round(88 + 40 + Math.random() * 2)); // coolant + 40 offset
      data.push(Math.round((15 + Math.sin(tick * 0.1) * 10) * 255 / 100));
      data.push(Math.round((30 + Math.sin(tick * 0.03) * 20) * 255 / 100));
      data.push(Math.round(Math.random() * 0xFF));
      data.push(Math.round(Math.random() * 0xFF));
      break;
    }
    case '2C0': {
      // Temps
      data.push(Math.round(88 + 40 + Math.random()));
      data.push(Math.round(35 + 40 + Math.random() * 2));
      for (let i = 0; i < 6; i++) data.push(Math.round(Math.random() * 0x3F));
      break;
    }
    case '2C1': {
      // Throttle/pedal
      const thr = Math.round((15 + Math.sin(tick * 0.1) * 12) * 255 / 100);
      data.push(thr, thr + Math.round(Math.random() * 3));
      for (let i = 0; i < 6; i++) data.push(Math.round(Math.random() * 0x20));
      break;
    }
    default: {
      for (let i = 0; i < dlc; i++) data.push(Math.round(Math.random() * 0xFF));
    }
  }

  const rawHex = data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  return { id, data: data.slice(0, dlc), dlc, timestamp: tick * 50, rawHex };
}

// ─── CAN Analyzer Engine ───
const HISTORY_LIMIT = 200;
const FRAME_BUFFER_PER_ID = 50;

type FrameListener = (tracked: TrackedFrame[]) => void;
type StatsListener = (stats: CaptureStats) => void;

class CANAnalyzerEngine {
  private tracked: Map<string, TrackedFrame> = new Map();
  private allFrames: CANFrame[] = [];
  private frameListeners: FrameListener[] = [];
  private statsListeners: StatsListener[] = [];
  private running = false;
  private simInterval: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private startTime = 0;
  private totalFrames = 0;
  private isNative = false;

  constructor() {
    this.isNative = typeof (window as any).Capacitor !== 'undefined';
  }

  onFrames(l: FrameListener): () => void {
    this.frameListeners.push(l);
    return () => { this.frameListeners = this.frameListeners.filter(x => x !== l); };
  }

  onStats(l: StatsListener): () => void {
    this.statsListeners.push(l);
    return () => { this.statsListeners = this.statsListeners.filter(x => x !== l); };
  }

  isRunning() { return this.running; }

  getTracked(): TrackedFrame[] {
    return Array.from(this.tracked.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  getHistory(): CANFrame[] { return this.allFrames; }

  startCapture() {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();
    this.tick = 0;
    this.totalFrames = 0;

    if (!this.isNative) {
      // Simulate CAN traffic
      this.simInterval = setInterval(() => {
        this.tick++;
        // Generate 2-4 frames per tick for realism
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          this.ingestFrame(generateSimFrame(this.tick));
        }
        this.emitFrames();
        this.emitStats();
      }, 100);
    } else {
      // Native: send ATMA (monitor all) and parse incoming frames
      elm327.sendCommand('ATMA', 'high').catch(() => {});
    }
  }

  stopCapture() {
    this.running = false;
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
    this.emitStats();
  }

  clearCapture() {
    this.tracked.clear();
    this.allFrames = [];
    this.totalFrames = 0;
    this.emitFrames();
    this.emitStats();
  }

  private ingestFrame(frame: CANFrame) {
    this.totalFrames++;
    this.allFrames.push(frame);
    if (this.allFrames.length > HISTORY_LIMIT) {
      this.allFrames = this.allFrames.slice(-HISTORY_LIMIT);
    }

    const existing = this.tracked.get(frame.id);

    if (existing) {
      const changedBytes = frame.data.map((b, i) =>
        existing.current.data[i] !== undefined && b !== existing.current.data[i]
      );

      const history = [...existing.history, frame].slice(-FRAME_BUFFER_PER_ID);
      const interval = existing.count > 1
        ? (frame.timestamp - existing.firstSeen) / existing.count
        : 0;

      const byteVariance = computeByteVariance(history);
      const mappingSuggestions = existing.count % 10 === 0
        ? detectMappings(frame.id, history)
        : existing.mappingSuggestions;

      this.tracked.set(frame.id, {
        id: frame.id,
        current: frame,
        previous: existing.current,
        changedBytes,
        history,
        count: existing.count + 1,
        firstSeen: existing.firstSeen,
        lastSeen: frame.timestamp,
        intervalMs: interval,
        byteVariance,
        mappingSuggestions,
      });
    } else {
      this.tracked.set(frame.id, {
        id: frame.id,
        current: frame,
        previous: null,
        changedBytes: Array(8).fill(false),
        history: [frame],
        count: 1,
        firstSeen: frame.timestamp,
        lastSeen: frame.timestamp,
        intervalMs: 0,
        byteVariance: Array(8).fill(0),
        mappingSuggestions: [],
      });
    }
  }

  private emitFrames() {
    const data = this.getTracked();
    this.frameListeners.forEach(l => l(data));
  }

  private emitStats() {
    const elapsed = Date.now() - this.startTime;
    const stats: CaptureStats = {
      totalFrames: this.totalFrames,
      uniqueIDs: this.tracked.size,
      framesPerSec: elapsed > 0 ? Math.round((this.totalFrames / elapsed) * 1000) : 0,
      captureMs: elapsed,
      running: this.running,
    };
    this.statsListeners.forEach(l => l(stats));
  }

  applyFilter(frames: TrackedFrame[], filter: CANFilter): TrackedFrame[] {
    return frames.filter(f => {
      if (filter.idFilter && !f.id.toUpperCase().includes(filter.idFilter.toUpperCase())) return false;
      if (filter.byteIndex !== null && filter.byteValue !== null) {
        const idx = filter.byteIndex;
        if (idx >= 0 && idx < f.current.data.length) {
          if (f.current.data[idx] !== filter.byteValue) return false;
        }
      }
      return true;
    });
  }
}

export const canAnalyzer = new CANAnalyzerEngine();
