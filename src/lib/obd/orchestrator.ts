/**
 * App Orchestrator — Central pipeline coordinator
 * BLE → ELM327 → UDS → Discovery → Decoder → AI Learning → Dashboard
 * 
 * Features:
 * - Automatic DID scan + learning after connection
 * - Adaptive polling frequency based on signal activity
 * - Auto dashboard widget creation from learned signals
 * - Session recording with export/share
 * - Anomaly detection with alerts
 * - Cross-platform support (Chrysler T&C + Pacifica, all years)
 */

import { bleManager, type BLEConnectionState } from '@/lib/obd/ble-manager';
import { elm327, type ELMState } from '@/lib/obd/elm327-engine';
import { discoveryEngine, type DiscoveredDID, type DiscoveryProgress } from '@/lib/obd/did-discovery';
import { sensorDecoder, type DecodedSensor } from '@/lib/obd/sensor-decoder';
import { signalEngine, type LearnedSignal, type DashboardWidget } from '@/lib/obd/signal-learning';
import { dataLogger } from '@/lib/obd/data-logger';
import { LIVE_PIDS, parsePIDResponse } from '@/lib/obd/obd-pids';
import { udsEngine } from '@/lib/obd/uds-engine';
import { elmQueue } from '@/lib/obd/adapter/elm-queue';
import { isPidOnCooldown, markPidFailed, markPidSuccess, markPidTransient, isUnsupportedStatus } from '@/lib/obd/unsupported-pid-cache';

// ─── Types ───

export type PipelinePhase =
  | 'idle'
  | 'connecting'
  | 'initializing'
  | 'discovering'
  | 'learning'
  | 'monitoring'
  | 'error';

export type PollProfile = 'fast' | 'normal' | 'eco';

export type Anomaly = {
  id: string;
  did: string;
  label: string;
  type: 'spike' | 'dropout' | 'range' | 'correlation_break';
  severity: 'info' | 'warning' | 'critical';
  value: number | string;
  threshold: number | string;
  timestamp: number;
  message: string;
  acknowledged: boolean;
};

export type OrchestratorState = {
  phase: PipelinePhase;
  bleState: BLEConnectionState;
  elmState: ELMState;
  discoveryProgress: DiscoveryProgress | null;
  discoveredDIDs: DiscoveredDID[];
  liveSensors: DecodedSensor[];
  learnedSignals: LearnedSignal[];
  autoWidgets: DashboardWidget[];
  anomalies: Anomaly[];
  pollProfile: PollProfile;
  pollRateHz: number;
  sessionActive: boolean;
  sessionName: string | null;
  uptimeMs: number;
  stats: {
    totalReads: number;
    errorsCount: number;
    avgLatencyMs: number;
    discoveredCount: number;
    liveSignalCount: number;
  };
};

type StateListener = (state: OrchestratorState) => void;

// ─── Poll Profiles ───
const POLL_PROFILES: Record<PollProfile, { intervalMs: number; pidBatchSize: number }> = {
  fast: { intervalMs: 200, pidBatchSize: 8 },
  normal: { intervalMs: 500, pidBatchSize: 5 },
  eco: { intervalMs: 1500, pidBatchSize: 3 },
};

// ─── Anomaly Detection Thresholds ───
const ANOMALY_THRESHOLDS: Record<string, { min: number; max: number; label: string }> = {
  '010C': { min: 0, max: 7500, label: 'RPM' },
  '0105': { min: -30, max: 130, label: 'Coolant Temp' },
  '010D': { min: 0, max: 220, label: 'Speed' },
  '0111': { min: 0, max: 100, label: 'Throttle' },
  '0142': { min: 9.0, max: 16.0, label: 'Battery' },
};

// ─── Orchestrator ───

class AppOrchestrator {
  private state: OrchestratorState;
  private listeners: StateListener[] = [];
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private adaptiveTimer: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private latencySamples: number[] = [];
  private anomalyIdCounter = 0;

  constructor() {
    this.state = this.defaultState();
    this.setupSubsystemListeners();
  }

  private defaultState(): OrchestratorState {
    return {
      phase: 'idle',
      bleState: 'disconnected',
      elmState: 'idle',
      discoveryProgress: null,
      discoveredDIDs: [],
      liveSensors: [],
      learnedSignals: [],
      autoWidgets: [],
      anomalies: [],
      pollProfile: 'normal',
      pollRateHz: 2,
      sessionActive: false,
      sessionName: null,
      uptimeMs: 0,
      stats: {
        totalReads: 0,
        errorsCount: 0,
        avgLatencyMs: 0,
        discoveredCount: 0,
        liveSignalCount: 0,
      },
    };
  }

  // ─── Public API ───

  getState(): OrchestratorState {
    return { ...this.state };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  /** Full automated pipeline: connect → init → discover → learn → monitor */
  async startPipeline(deviceId: string): Promise<boolean> {
    try {
      this.startTime = Date.now();

      // Phase 1: Connect BLE
      this.setPhase('connecting');
      const connected = await bleManager.connect(deviceId);
      if (!connected) {
        this.setPhase('error');
        return false;
      }

      // Phase 2: Initialize ELM327
      this.setPhase('initializing');
      const initialized = await elm327.initialize();
      if (!initialized) {
        this.setPhase('error');
        return false;
      }

      // Phase 3: Auto-start session recording
      const sessionName = `Session ${new Date().toLocaleString()}`;
      dataLogger.startSession(sessionName);
      this.state.sessionActive = true;
      this.state.sessionName = sessionName;

      // Phase 4: Quick DID discovery
      this.setPhase('discovering');
      await this.runQuickDiscovery();

      // Phase 5: Start AI learning on discovered live DIDs
      this.setPhase('learning');
      const liveDIDs = this.state.discoveredDIDs
        .filter(d => d.classification === 'live')
        .map(d => d.did);
      if (liveDIDs.length > 0) {
        signalEngine.addDiscoveredDIDs(liveDIDs);
        sensorDecoder.start(liveDIDs.length > 0 ? liveDIDs : undefined);
      }
      await signalEngine.startLearning();

      // Phase 6: Begin monitoring loop
      this.setPhase('monitoring');
      this.startMonitorLoop();
      this.startAdaptivePolling();

      this.emit();
      return true;
    } catch (e) {
      console.error('[Orchestrator] Pipeline error:', e);
      this.setPhase('error');
      return false;
    }
  }

  /** Stop everything gracefully */
  stopPipeline() {
    this.stopMonitorLoop();
    this.stopAdaptivePolling();
    signalEngine.stopLearning();
    sensorDecoder.stop();
    if (this.state.sessionActive) {
      dataLogger.endSession();
      this.state.sessionActive = false;
    }
    this.setPhase('idle');
  }

  /** Start monitoring without discovery (manual mode) */
  startMonitoring() {
    if (this.state.elmState !== 'ready') return;
    this.setPhase('monitoring');
    this.startMonitorLoop();
    this.startAdaptivePolling();
    if (!this.state.sessionActive) {
      dataLogger.startSession(`Monitor ${new Date().toLocaleTimeString()}`);
      this.state.sessionActive = true;
    }
    this.emit();
  }

  /** Run discovery separately */
  async runDiscovery() {
    this.setPhase('discovering');
    await this.runQuickDiscovery();
    this.setPhase(this.monitorTimer ? 'monitoring' : 'idle');
  }

  /** Change polling profile */
  setPollProfile(profile: PollProfile) {
    this.state.pollProfile = profile;
    this.state.pollRateHz = 1000 / POLL_PROFILES[profile].intervalMs;
    sensorDecoder.setInterval(POLL_PROFILES[profile].intervalMs);
    this.emit();
  }

  /** Acknowledge an anomaly */
  acknowledgeAnomaly(id: string) {
    const a = this.state.anomalies.find(x => x.id === id);
    if (a) { a.acknowledged = true; this.emit(); }
  }

  /** Clear all anomalies */
  clearAnomalies() {
    this.state.anomalies = [];
    this.emit();
  }

  /** Export current session */
  exportSession(format: 'csv' | 'json'): string | null {
    const active = dataLogger.getActiveSession();
    if (!active) return null;
    return format === 'csv' ? dataLogger.exportCSV(active.id) : dataLogger.exportJSON(active.id);
  }

  /** Share session via Web Share API */
  async shareSession() {
    const active = dataLogger.getActiveSession();
    if (!active) return;
    const json = dataLogger.exportJSON(active.id);
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], `chdp_session_${active.id}.json`, { type: 'application/json' });

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'CHDP OBD Session',
          text: `Diagnostic session: ${active.name}`,
          files: [file],
        });
      } catch {
        // Fallback: download
        dataLogger.downloadFile(json, `chdp_session_${active.id}.json`, 'application/json');
      }
    } else {
      dataLogger.downloadFile(json, `chdp_session_${active.id}.json`, 'application/json');
    }
  }

  /** Get auto-generated widget configs based on AI learning */
  getAutoWidgets(): DashboardWidget[] {
    return signalEngine.generateDashboard();
  }

  // ─── Private ───

  private setupSubsystemListeners() {
    // BLE state tracking
    bleManager.subscribe(event => {
      if (event.type === 'stateChange') {
        this.state.bleState = event.payload;
        if (event.payload === 'disconnected' && this.state.phase !== 'idle') {
          this.stopPipeline();
        }
        this.emit();
      }
    });

    // ELM state tracking
    elm327.onStateChange(state => {
      this.state.elmState = state;
      this.emit();
    });

    // Discovery progress
    discoveryEngine.onProgress(progress => {
      this.state.discoveryProgress = progress;
      this.emit();
    });

    // Discovery results
    discoveryEngine.onDiscovered(did => {
      this.state.discoveredDIDs = discoveryEngine.getResults();
      this.state.stats.discoveredCount = this.state.discoveredDIDs.length;
      this.emit();
    });

    // Sensor decoder updates
    sensorDecoder.onUpdate(decoderState => {
      this.state.liveSensors = Array.from(decoderState.sensors.values()).filter(s => s.isLive);
      this.state.stats.liveSignalCount = this.state.liveSensors.length;
    });

    // Signal learning updates
    signalEngine.onSignals(signals => {
      this.state.learnedSignals = signals;
    });

    signalEngine.onDashboard(widgets => {
      this.state.autoWidgets = widgets;
      this.emit();
    });
  }

  private async runQuickDiscovery() {
    discoveryEngine.clearResults();
    await discoveryEngine.runFullDiscovery();
    this.state.discoveredDIDs = discoveryEngine.getResults();
    this.state.stats.discoveredCount = this.state.discoveredDIDs.length;
    this.emit();
  }

  private startMonitorLoop() {
    if (this.monitorTimer) return;
    const profile = POLL_PROFILES[this.state.pollProfile];

    this.monitorTimer = setInterval(async () => {
      const t0 = performance.now();

      // Poll standard OBD PIDs
      for (const pid of LIVE_PIDS.slice(0, profile.pidBatchSize)) {
        if (elmQueue.isPollingPaused() || isPidOnCooldown(pid)) continue;
        try {
          const res = await elmQueue.send(pid, { timeoutMs: 900, commandType: 'live_poll_command' });
          if (res.status !== 'ok') {
            markPidFailed(pid);
            continue;
          }
          const response = res.raw;
          const value = parsePIDResponse(pid, response);
          if (value !== null) {
            markPidSuccess(pid);
            this.state.stats.totalReads++;

            // Record to logger
            if (this.state.sessionActive) {
              dataLogger.record(pid, pid, response, value, 'number');
            }

            // Check anomalies
            this.checkAnomaly(pid, value);
          } else {
            markPidFailed(pid);
          }
        } catch {
          markPidFailed(pid);
          this.state.stats.errorsCount++;
        }
      }

      // Track latency
      const latency = performance.now() - t0;
      this.latencySamples.push(latency);
      if (this.latencySamples.length > 100) this.latencySamples.shift();
      this.state.stats.avgLatencyMs = Math.round(
        this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
      );

      // Update uptime
      this.state.uptimeMs = Date.now() - this.startTime;

      this.emit();
    }, profile.intervalMs);
  }

  private stopMonitorLoop() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /** Adaptive polling — adjust rate based on signal activity */
  private startAdaptivePolling() {
    if (this.adaptiveTimer) return;

    this.adaptiveTimer = setInterval(() => {
      const liveCount = this.state.liveSensors.length;
      const avgActivity = this.state.learnedSignals.length > 0
        ? this.state.learnedSignals.reduce((sum, s) => sum + s.activityScore, 0) / this.state.learnedSignals.length
        : 0;

      // High activity → faster polling
      if (avgActivity > 0.6 && this.state.pollProfile !== 'fast') {
        this.setPollProfile('fast');
      } else if (avgActivity < 0.15 && liveCount < 3 && this.state.pollProfile !== 'eco') {
        this.setPollProfile('eco');
      } else if (avgActivity >= 0.15 && avgActivity <= 0.6 && this.state.pollProfile !== 'normal') {
        this.setPollProfile('normal');
      }
    }, 5000);
  }

  private stopAdaptivePolling() {
    if (this.adaptiveTimer) {
      clearInterval(this.adaptiveTimer);
      this.adaptiveTimer = null;
    }
  }

  private checkAnomaly(pid: string, value: number) {
    const threshold = ANOMALY_THRESHOLDS[pid];
    if (!threshold) return;

    if (value < threshold.min || value > threshold.max) {
      const anomaly: Anomaly = {
        id: `anom-${++this.anomalyIdCounter}`,
        did: pid,
        label: threshold.label,
        type: value > threshold.max ? 'spike' : 'dropout',
        severity: Math.abs(value - (value > threshold.max ? threshold.max : threshold.min)) > 50 ? 'critical' : 'warning',
        value,
        threshold: value > threshold.max ? threshold.max : threshold.min,
        timestamp: Date.now(),
        message: `${threshold.label}: ${value} (${value > threshold.max ? 'over' : 'under'} ${value > threshold.max ? threshold.max : threshold.min})`,
        acknowledged: false,
      };
      this.state.anomalies.unshift(anomaly);
      if (this.state.anomalies.length > 50) this.state.anomalies.pop();
      this.emit();
    }
  }

  private setPhase(phase: PipelinePhase) {
    this.state.phase = phase;
    this.emit();
  }

  private emit() {
    const snapshot = { ...this.state };
    this.listeners.forEach(l => l(snapshot));
  }
}

export const orchestrator = new AppOrchestrator();
