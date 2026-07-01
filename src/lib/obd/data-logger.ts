import { sessionCache } from '@/lib/obd/offline-cache';

/**
 * Data Logger Engine
 * Multi-session recording with timestamps, tagging, export, and replay.
 * Supports Chrysler extended blocks (210x).
 */

export interface LogEntry {
  timestamp: number;
  did: string;
  label: string;
  rawHex: string;
  decoded: string | number | boolean;
  type: 'string' | 'number' | 'flag' | 'unknown';
  tags: LogTag[];
}

export type LogTag = 'live' | 'static' | 'high-variance' | 'warning' | 'chrysler-ext' | 'anomaly' | 'flag';

export interface LogSession {
  id: string;
  name: string;
  startTime: number;
  endTime: number | null;
  entries: LogEntry[];
  metadata: {
    deviceName?: string;
    protocol?: string;
    didCount: number;
    tagSummary: Record<LogTag, number>;
  };
}

export interface ReplayState {
  running: boolean;
  sessionId: string | null;
  index: number;
  speed: number; // 1x, 2x, 4x
  currentEntry: LogEntry | null;
}

type Listener<T> = (data: T) => void;

const CHRYSLER_EXT_RANGE = /^21[0-9A-F]{2}$/i;
const VARIANCE_THRESHOLD = 0.15;

class DataLoggerEngine {
  private sessions: LogSession[] = [];
  private activeSession: LogSession | null = null;
  private replayState: ReplayState = { running: false, sessionId: null, index: 0, speed: 1, currentEntry: null };
  private replayTimer: ReturnType<typeof setTimeout> | null = null;

  private sessionListeners: Listener<LogSession[]>[] = [];
  private activeListeners: Listener<LogSession | null>[] = [];
  private replayListeners: Listener<ReplayState>[] = [];

  // Variance tracking per DID
  private varianceHistory: Map<string, number[]> = new Map();

  // --- Session Management ---

  startSession(name?: string, deviceName?: string, protocol?: string): LogSession {
    if (this.activeSession) this.endSession();

    const session: LogSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name || `Session ${this.sessions.length + 1}`,
      startTime: Date.now(),
      endTime: null,
      entries: [],
      metadata: { deviceName, protocol, didCount: 0, tagSummary: {} as Record<LogTag, number> },
    };
    this.activeSession = session;
    this.varianceHistory.clear();
    this.notifyActive();
    return session;
  }

  endSession(): LogSession | null {
    if (!this.activeSession) return null;
    this.activeSession.endTime = Date.now();
    this.activeSession.metadata.didCount = new Set(this.activeSession.entries.map(e => e.did)).size;
    this.activeSession.metadata.tagSummary = this.computeTagSummary(this.activeSession);
    this.sessions.unshift(this.activeSession);
    const ended = this.activeSession;
    sessionCache.save({
      id: ended.id,
      timestamp: ended.startTime,
      duration: (ended.endTime ?? Date.now()) - ended.startTime,
      vehicle: ended.metadata.deviceName || 'OBD session',
      dataPoints: ended.entries.length,
      liveSensorSnapshots: this.buildLiveSensorSnapshots(ended),
      discoveredDIDs: this.extractDiscoveredDIDs(ended),
      notes: ended.name,
    }).catch(e => console.warn('[DataLogger] offline cache save failed', e));
    this.activeSession = null;
    this.notifySessions();
    this.notifyActive();
    return ended;
  }

  deleteSession(id: string) {
    this.sessions = this.sessions.filter(s => s.id !== id);
    this.notifySessions();
  }

  renameSession(id: string, name: string) {
    const s = this.sessions.find(s => s.id === id);
    if (s) { s.name = name; this.notifySessions(); }
  }

  getSessions(): LogSession[] { return this.sessions; }
  getActiveSession(): LogSession | null { return this.activeSession; }

  // --- Recording ---

  record(did: string, label: string, rawHex: string, decoded: string | number | boolean, type: LogEntry['type'] = 'unknown') {
    if (!this.activeSession) return;

    const tags = this.computeTags(did, decoded);
    const entry: LogEntry = {
      timestamp: Date.now(),
      did, label, rawHex, decoded, type, tags,
    };
    this.activeSession.entries.push(entry);

    // Track variance
    if (typeof decoded === 'number') {
      const hist = this.varianceHistory.get(did) || [];
      hist.push(decoded);
      if (hist.length > 50) hist.shift();
      this.varianceHistory.set(did, hist);
    }
  }

  private computeTags(did: string, decoded: string | number | boolean): LogTag[] {
    const tags: LogTag[] = [];

    if (CHRYSLER_EXT_RANGE.test(did)) tags.push('chrysler-ext');

    // Check variance
    if (typeof decoded === 'number') {
      const hist = this.varianceHistory.get(did);
      if (hist && hist.length >= 5) {
        const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
        const variance = hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length;
        const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0;
        if (cv > VARIANCE_THRESHOLD) tags.push('high-variance');
        if (cv > 0.01) tags.push('live');
        else tags.push('static');
      }
    } else if (typeof decoded === 'boolean') {
      tags.push('flag');
    } else {
      tags.push('static');
    }

    return tags;
  }

  private computeTagSummary(session: LogSession): Record<LogTag, number> {
    const summary: Record<string, number> = {};
    for (const e of session.entries) {
      for (const t of e.tags) {
        summary[t] = (summary[t] || 0) + 1;
      }
    }
    return summary as Record<LogTag, number>;
  }

  private buildLiveSensorSnapshots(session: LogSession): Record<string, number[]> {
    const snapshots: Record<string, number[]> = {};
    for (const entry of session.entries) {
      if (typeof entry.decoded !== 'number') continue;
      if (!snapshots[entry.did]) snapshots[entry.did] = [];
      snapshots[entry.did].push(entry.decoded);
    }
    return snapshots;
  }

  private extractDiscoveredDIDs(session: LogSession): number[] {
    const dids = new Set<number>();
    for (const entry of session.entries) {
      const normalized = entry.did.replace(/^0x/i, '');
      const did = parseInt(normalized, 16);
      if (Number.isFinite(did)) dids.add(did);
    }
    return [...dids];
  }

  // --- Export ---

  exportCSV(sessionId: string): string {
    const session = this.sessions.find(s => s.id === sessionId) || this.activeSession;
    if (!session) return '';

    const header = 'Timestamp,DID,Label,RawHex,Decoded,Type,Tags\n';
    const rows = session.entries.map(e =>
      `${new Date(e.timestamp).toISOString()},${e.did},"${e.label}",${e.rawHex},"${String(e.decoded)}",${e.type},"${e.tags.join(';')}"`
    ).join('\n');
    return header + rows;
  }

  exportJSON(sessionId: string): string {
    const session = this.sessions.find(s => s.id === sessionId) || this.activeSession;
    if (!session) return '{}';
    return JSON.stringify(session, null, 2);
  }

  downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Replay ---

  startReplay(sessionId: string, speed: number = 1) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session || session.entries.length === 0) return;
    this.stopReplay();

    this.replayState = { running: true, sessionId, index: 0, speed, currentEntry: session.entries[0] };
    this.notifyReplay();
    this.tickReplay(session);
  }

  private tickReplay(session: LogSession) {
    if (!this.replayState.running || this.replayState.index >= session.entries.length - 1) {
      this.replayState.running = false;
      this.notifyReplay();
      return;
    }

    const current = session.entries[this.replayState.index];
    const next = session.entries[this.replayState.index + 1];
    const delay = Math.max(10, (next.timestamp - current.timestamp) / this.replayState.speed);

    this.replayTimer = setTimeout(() => {
      this.replayState.index++;
      this.replayState.currentEntry = session.entries[this.replayState.index];
      this.notifyReplay();
      this.tickReplay(session);
    }, delay);
  }

  stopReplay() {
    if (this.replayTimer) clearTimeout(this.replayTimer);
    this.replayState = { ...this.replayState, running: false };
    this.notifyReplay();
  }

  setReplaySpeed(speed: number) {
    this.replayState.speed = speed;
  }

  seekReplay(index: number) {
    const session = this.sessions.find(s => s.id === this.replayState.sessionId);
    if (!session) return;
    this.replayState.index = Math.max(0, Math.min(index, session.entries.length - 1));
    this.replayState.currentEntry = session.entries[this.replayState.index];
    this.notifyReplay();
  }

  getReplayState(): ReplayState { return this.replayState; }

  // --- Subscriptions ---

  onSessions(fn: Listener<LogSession[]>): () => void {
    this.sessionListeners.push(fn);
    return () => { this.sessionListeners = this.sessionListeners.filter(l => l !== fn); };
  }

  onActive(fn: Listener<LogSession | null>): () => void {
    this.activeListeners.push(fn);
    return () => { this.activeListeners = this.activeListeners.filter(l => l !== fn); };
  }

  onReplay(fn: Listener<ReplayState>): () => void {
    this.replayListeners.push(fn);
    return () => { this.replayListeners = this.replayListeners.filter(l => l !== fn); };
  }

  private notifySessions() { this.sessionListeners.forEach(fn => fn([...this.sessions])); }
  private notifyActive() { this.activeListeners.forEach(fn => fn(this.activeSession)); }
  private notifyReplay() { this.replayListeners.forEach(fn => fn({ ...this.replayState })); }
}

export const dataLogger = new DataLoggerEngine();