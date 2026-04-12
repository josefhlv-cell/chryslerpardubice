import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Play, Square, Share2, Download, AlertTriangle, CheckCircle2,
  Wifi, WifiOff, Gauge, Activity, TrendingUp, Clock, ChevronDown,
  ChevronRight, X, Radio, Cpu, Brain, Database
} from 'lucide-react';
import { useOrchestrator } from '@/hooks/obd/use-orchestrator';
import { t } from '@/lib/obd/i18n';
import type { PipelinePhase, Anomaly, PollProfile } from '@/lib/obd/orchestrator';

const PHASE_CONFIG: Record<PipelinePhase, { label: string; icon: typeof Zap; color: string }> = {
  idle: { label: t.orchestrator.idle, icon: WifiOff, color: 'text-muted-foreground' },
  connecting: { label: t.orchestrator.connectingBle, icon: Wifi, color: 'text-primary' },
  initializing: { label: t.orchestrator.initializingElm, icon: Cpu, color: 'text-primary' },
  discovering: { label: t.orchestrator.scanningDids, icon: Radio, color: 'text-accent' },
  learning: { label: t.orchestrator.aiLearning, icon: Brain, color: 'text-accent' },
  monitoring: { label: t.orchestrator.liveMonitoring, icon: Activity, color: 'text-success' },
  error: { label: t.orchestrator.errorLabel, icon: AlertTriangle, color: 'text-destructive' },
};

const PROFILE_LABELS: Record<PollProfile, string> = {
  fast: t.orchestrator.fast,
  normal: t.orchestrator.normal,
  eco: t.orchestrator.eco,
};

export function OrchestrationPanel() {
  const orch = useOrchestrator();
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const phaseConfig = PHASE_CONFIG[orch.phase];
  const PhaseIcon = phaseConfig.icon;
  const unacknowledgedAnomalies = orch.anomalies.filter(a => !a.acknowledged);
  const isActive = orch.phase === 'monitoring' || orch.phase === 'learning' || orch.phase === 'discovering';

  const formatUptime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Pipeline Status Header */}
      <motion.div
        className="rounded-xl border border-border bg-card p-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <PhaseIcon className={`w-5 h-5 ${phaseConfig.color} ${isActive ? 'animate-pulse' : ''}`} />
            <span className={`text-sm font-semibold ${phaseConfig.color}`}>{phaseConfig.label}</span>
          </div>
          <div className="flex gap-1.5">
            {orch.phase === 'monitoring' && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={orch.stopPipeline}
                className="px-2.5 py-1 rounded-md bg-destructive text-destructive-foreground text-xs font-medium flex items-center gap-1"
              >
                <Square className="w-3 h-3" /> {t.orchestrator.stop}
              </motion.button>
            )}
            {orch.phase === 'idle' && orch.elmState === 'ready' && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={orch.startMonitoring}
                className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1"
              >
                <Play className="w-3 h-3" /> {t.orchestrator.monitor}
              </motion.button>
            )}
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-4 gap-2 mt-2">
          <StatBadge label="Signály" value={orch.stats.liveSignalCount} icon={<Activity className="w-3 h-3" />} />
          <StatBadge label="DID" value={orch.stats.discoveredCount} icon={<Database className="w-3 h-3" />} />
          <StatBadge label="Latence" value={`${orch.stats.avgLatencyMs}ms`} icon={<Gauge className="w-3 h-3" />} />
          <StatBadge label="Provoz" value={formatUptime(orch.uptimeMs)} icon={<Clock className="w-3 h-3" />} />
        </div>

        {/* Poll Profile Selector */}
        {isActive && (
          <div className="flex gap-1 mt-2">
            {(['fast', 'normal', 'eco'] as PollProfile[]).map(p => (
              <button
                key={p}
                onClick={() => orch.setPollProfile(p)}
                className={`flex-1 text-[10px] py-1 rounded-md border transition-colors ${
                  orch.pollProfile === p
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {PROFILE_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* Discovery Progress */}
      {orch.discoveryProgress && orch.phase === 'discovering' && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="rounded-lg border border-border bg-card p-3"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-foreground">{orch.discoveryProgress.currentRange}</span>
            <span className="text-[10px] font-mono text-muted-foreground">
              0x{orch.discoveryProgress.currentDID.toString(16).toUpperCase().padStart(4, '0')}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-accent"
              animate={{ width: `${(orch.discoveryProgress.scannedCount / Math.max(1, orch.discoveryProgress.totalCount)) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">
              {orch.discoveryProgress.foundCount} nalezeno / {orch.discoveryProgress.scannedCount} prohledáno
            </span>
            <span className="text-[10px] text-muted-foreground">
              ~{Math.round(orch.discoveryProgress.estimatedRemainingMs / 1000)}s zbývá
            </span>
          </div>
        </motion.div>
      )}

      {/* Anomaly Alerts */}
      {unacknowledgedAnomalies.length > 0 && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <button
            onClick={() => setShowAnomalies(!showAnomalies)}
            className="w-full flex items-center justify-between p-2.5 rounded-lg border border-warning/50 bg-warning/10"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning animate-pulse" />
              <span className="text-xs font-medium text-warning">
                {unacknowledgedAnomalies.length} {unacknowledgedAnomalies.length > 1 ? 'Anomálie' : 'Anomálie'}
              </span>
            </div>
            {showAnomalies ? <ChevronDown className="w-4 h-4 text-warning" /> : <ChevronRight className="w-4 h-4 text-warning" />}
          </button>

          <AnimatePresence>
            {showAnomalies && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-1 mt-1 max-h-[200px] overflow-y-auto">
                  {unacknowledgedAnomalies.map(a => (
                    <AnomalyCard key={a.id} anomaly={a} onAck={() => orch.acknowledgeAnomaly(a.id)} />
                  ))}
                </div>
                <button
                  onClick={orch.clearAnomalies}
                  className="w-full text-[10px] text-muted-foreground py-1 mt-1 hover:text-foreground transition-colors"
                >
                  Smazat vše
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Auto-Generated Widgets Preview */}
      {orch.autoWidgets.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-accent" />
             <span className="text-xs font-medium text-foreground">AI Auto-Dashboard</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{orch.autoWidgets.length} widgets</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {orch.autoWidgets.slice(0, 6).map(w => (
              <div
                key={w.didHex}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/50 border border-border"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${w.isLive ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-medium text-foreground truncate">{w.label}</div>
                  <div className="text-[9px] text-muted-foreground font-mono">
                    {typeof w.value === 'number' ? w.value.toFixed(1) : w.value} {w.unit}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session & Export */}
      {orch.sessionActive && (
        <div className="flex gap-1.5">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={orch.shareSession}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-border bg-card text-xs text-foreground"
          >
            <Share2 className="w-3 h-3" /> Sdílet
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              const csv = orch.exportSession('csv');
              if (csv) {
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'session.csv'; a.click();
                URL.revokeObjectURL(url);
              }
            }}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-border bg-card text-xs text-foreground"
          >
            <Download className="w-3 h-3" /> CSV
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              const json = orch.exportSession('json');
              if (json) {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'session.json'; a.click();
                URL.revokeObjectURL(url);
              }
            }}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-border bg-card text-xs text-foreground"
          >
            <Download className="w-3 h-3" /> JSON
          </motion.button>
        </div>
      )}

      {/* Detailed Stats Toggle */}
      <button
        onClick={() => setShowStats(!showStats)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground px-1"
      >
        {showStats ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {t.orchestrator.statistics}
      </button>
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="rounded-lg border border-border bg-card p-2.5 overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-y-1 text-[10px]">
               <span className="text-muted-foreground">Celkem čtení</span>
               <span className="text-foreground font-mono text-right">{orch.stats.totalReads.toLocaleString()}</span>
               <span className="text-muted-foreground">Chyby</span>
               <span className="text-foreground font-mono text-right">{orch.stats.errorsCount}</span>
               <span className="text-muted-foreground">Nalezené DID</span>
               <span className="text-foreground font-mono text-right">{orch.stats.discoveredCount}</span>
               <span className="text-muted-foreground">Živé signály</span>
               <span className="text-foreground font-mono text-right">{orch.stats.liveSignalCount}</span>
               <span className="text-muted-foreground">Frekvence</span>
               <span className="text-foreground font-mono text-right">{orch.pollRateHz.toFixed(1)} Hz</span>
               <span className="text-muted-foreground">Prům. latence</span>
               <span className="text-foreground font-mono text-right">{orch.stats.avgLatencyMs} ms</span>
               <span className="text-muted-foreground">Stav BLE</span>
               <span className="text-foreground font-mono text-right">{orch.bleState}</span>
               <span className="text-muted-foreground">Stav ELM</span>
               <span className="text-foreground font-mono text-right">{orch.elmState}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatBadge({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1 py-1 rounded-md bg-muted/50">
      <div className="text-muted-foreground">{icon}</div>
      <span className="text-[10px] font-mono font-semibold text-foreground">{value}</span>
      <span className="text-[8px] text-muted-foreground">{label}</span>
    </div>
  );
}

function AnomalyCard({ anomaly, onAck }: { anomaly: Anomaly; onAck: () => void }) {
  const severityColor = anomaly.severity === 'critical' ? 'text-destructive' : 'text-warning';
  return (
    <motion.div
      initial={{ x: -10, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-card border border-border"
    >
      <AlertTriangle className={`w-3 h-3 ${severityColor} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-medium text-foreground block truncate">{anomaly.message}</span>
        <span className="text-[9px] text-muted-foreground">{new Date(anomaly.timestamp).toLocaleTimeString()}</span>
      </div>
      <button onClick={onAck} className="p-0.5 rounded hover:bg-muted">
        <X className="w-3 h-3 text-muted-foreground" />
      </button>
    </motion.div>
  );
}
