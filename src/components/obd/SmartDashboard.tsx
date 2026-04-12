import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Play, Square, Trash2, Zap, TrendingUp, Hash, Type,
  Flag, BarChart3, Link2, ChevronDown, ChevronRight, Gauge, Activity
} from 'lucide-react';
import { useSignalLearning } from '@/hooks/obd/use-signal-learning';
import { RadialGauge, DataCard } from '@/components/obd/Gauge';
import { t } from '@/lib/obd/i18n';
import type { LearnedSignal, DashboardWidget, SignalCorrelation } from '@/lib/obd/signal-learning';

type Props = { elmReady: boolean };

const TYPE_ICONS: Record<string, typeof Hash> = {
  number: Hash,
  string: Type,
  flag: Flag,
  unknown: Activity,
};

const TYPE_COLORS: Record<string, string> = {
  number: 'text-accent',
  string: 'text-primary',
  flag: 'text-warning',
  unknown: 'text-muted-foreground',
};

export function SmartDashboard({ elmReady }: Props) {
  const { signals, dashboard, running, start, stop, clear } = useSignalLearning();
  const [view, setView] = useState<'dashboard' | 'signals'>('dashboard');
  const [expandedDID, setExpandedDID] = useState<number | null>(null);

  const liveSignals = useMemo(() => signals.filter(s => s.isLive), [signals]);
  const staticSignals = useMemo(() => signals.filter(s => !s.isLive && s.sampleCount >= 3), [signals]);

  if (!elmReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <div className="w-20 h-20 rounded-2xl carbon-bg border border-border flex items-center justify-center">
          <Brain className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          {t.ai.initPrompt}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">{t.ai.title}</h2>
        </div>
        <div className="flex gap-1">
          {signals.length > 0 && (
            <button onClick={clear} className="p-1.5 rounded-md bg-muted active:bg-border">
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </button>
          )}
        </div>
      </div>

      {/* Start / Stop */}
      <motion.button
        onClick={running ? stop : start}
        className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm ${
          running ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
        }`}
        whileTap={{ scale: 0.98 }}
      >
        {running ? (
           <><Square className="w-4 h-4 fill-current" /><span>{t.ai.stopLearning}</span></>
         ) : (
           <><Play className="w-4 h-4 fill-current" /><span>{t.ai.startLearning}</span></>
        )}
      </motion.button>

      {/* Stats */}
      {signals.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
           <MiniStat label={t.ai.signals} value={signals.length} />
           <MiniStat label={t.ai.live} value={liveSignals.length} color="text-success" />
           <MiniStat label={t.ai.static} value={staticSignals.length} color="text-accent" />
           <MiniStat label={t.ai.samples} value={signals.reduce((a, s) => a + s.sampleCount, 0)} />
        </div>
      )}

      {/* View Toggle */}
      {signals.length > 0 && (
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setView('dashboard')}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              view === 'dashboard' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
             {t.ai.autoDashboard}
          </button>
          <button
            onClick={() => setView('signals')}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              view === 'signals' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t.ai.signalList} ({signals.length})
          </button>
        </div>
      )}

      {/* Auto Dashboard View */}
      {view === 'dashboard' && dashboard.length > 0 && (
        <AutoDashboardView widgets={dashboard} />
      )}

      {view === 'dashboard' && dashboard.length === 0 && running && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Brain className="w-8 h-8 text-primary animate-pulse-glow" />
          <p className="text-xs text-muted-foreground text-center">
            {t.ai.learningSignals}
          </p>
        </div>
      )}

      {/* Signal List View */}
      {view === 'signals' && (
        <div className="space-y-1 max-h-[350px] overflow-y-auto">
          {signals.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).map(s => (
            <SignalCard
              key={s.did}
              signal={s}
              expanded={expandedDID === s.did}
              onToggle={() => setExpandedDID(expandedDID === s.did ? null : s.did)}
            />
          ))}
        </div>
      )}

      {/* Learning indicator */}
      {running && (
        <div className="flex items-center justify-center gap-2 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] font-mono text-muted-foreground">
            {t.ai.learning} — {signals.length} {t.ai.signals.toLowerCase()}, {liveSignals.length} {t.ai.liveCount}
          </span>
        </div>
      )}
    </div>
  );
}

function AutoDashboardView({ widgets }: { widgets: DashboardWidget[] }) {
  const gaugeWidgets = widgets.filter(w => w.widgetType === 'gauge').slice(0, 2);
  const cardWidgets = widgets.filter(w => w.widgetType !== 'gauge').slice(0, 6);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
      {/* Auto-generated gauges */}
      {gaugeWidgets.length > 0 && (
        <div className="flex justify-center gap-4">
          {gaugeWidgets.map(w => (
            <div key={w.did} className="relative">
              <RadialGauge
                value={typeof w.value === 'number' ? w.value : 0}
                min={w.min}
                max={w.max}
                label={w.label.length > 12 ? w.label.slice(0, 12) + '…' : w.label}
                unit={w.unit}
                size="md"
              />
              {w.isLive && (
                <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-success animate-pulse" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Auto-generated cards */}
      <div className="grid grid-cols-3 gap-1.5">
        {cardWidgets.map(w => (
          <SmartWidgetCard key={w.did} widget={w} />
        ))}
      </div>

      {/* Correlation badges */}
      <CorrelationSummary widgets={widgets} />
    </motion.div>
  );
}

function SmartWidgetCard({ widget }: { widget: DashboardWidget }) {
  const isFlag = widget.widgetType === 'flag_indicator';
  const isText = widget.widgetType === 'text_card';

  if (isFlag) {
    const flagValue = typeof widget.value === 'number' ? widget.value > 0 : !!widget.value;
    return (
      <motion.div
        className={`rounded-lg border p-2 ${
          flagValue ? 'bg-primary/10 border-primary/30' : 'bg-card border-border'
        }`}
        animate={flagValue ? { scale: [1, 1.03, 1] } : {}}
      >
        <span className="text-label block mb-0.5 truncate">{widget.label.length > 10 ? widget.label.slice(0, 10) + '…' : widget.label}</span>
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${flagValue ? 'bg-success glow-success' : 'bg-muted'}`} />
          <span className="text-xs font-mono text-foreground">{flagValue ? 'ZAP' : 'VYP'}</span>
        </div>
      </motion.div>
    );
  }

  const displayValue = typeof widget.value === 'number'
    ? (widget.value % 1 === 0 ? widget.value : widget.value.toFixed(1))
    : String(widget.value).slice(0, 12);

  return (
    <motion.div
      className={`rounded-lg border border-border bg-card p-2 ${widget.isLive ? 'glow-accent' : ''}`}
      animate={widget.isLive ? {} : {}}
    >
      <span className="text-label block mb-0.5 truncate">{widget.label.length > 10 ? widget.label.slice(0, 10) + '…' : widget.label}</span>
      <div className="flex items-baseline gap-0.5">
        <span className={`font-mono text-sm font-bold ${isText ? 'text-foreground' : 'text-data'} truncate`}>
          {displayValue}
        </span>
        {widget.unit && <span className="text-[9px] text-muted-foreground">{widget.unit}</span>}
      </div>
      {widget.isLive && (
        <div className="w-1 h-1 rounded-full bg-success mt-1" />
      )}
    </motion.div>
  );
}

function CorrelationSummary({ widgets }: { widgets: DashboardWidget[] }) {
  const allCorrelations = widgets.flatMap(w =>
    w.correlations.map(c => ({ source: w.label, ...c }))
  ).filter(c => c.strength === 'strong' || c.strength === 'moderate');

  if (allCorrelations.length === 0) return null;

  return (
    <div className="space-y-1">
      <span className="text-label flex items-center gap-1">
        <Link2 className="w-3 h-3 text-accent" />
        {t.ai.correlations}
      </span>
      <div className="flex flex-wrap gap-1">
        {allCorrelations.slice(0, 4).map((c, i) => (
          <span
            key={i}
            className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono border ${
              c.strength === 'strong'
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-accent/10 border-accent/30 text-accent'
            }`}
          >
            {c.source.slice(0, 8)} ↔ {c.targetName.slice(0, 8)} ({(c.correlationCoeff * 100).toFixed(0)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

function SignalCard({ signal, expanded, onToggle }: { signal: LearnedSignal; expanded: boolean; onToggle: () => void }) {
  const Icon = TYPE_ICONS[signal.signalType] || Activity;
  const color = TYPE_COLORS[signal.signalType] || 'text-foreground';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-lg bg-card border border-border overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-2.5 py-2 active:bg-muted"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
          <span className="font-mono text-[10px] text-primary flex-shrink-0">{signal.didHex}</span>
          <span className="text-xs text-foreground truncate">{signal.name}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {signal.isLive && <Zap className="w-3 h-3 text-success" />}
          <span className="text-[10px] font-mono text-accent max-w-[60px] truncate">
            {signal.lastValue}
          </span>
          {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-3 space-y-1.5 border-t border-border pt-2">
               <InfoRow label={t.ai.type} value={signal.signalType} />
               <InfoRow label={t.ai.live} value={signal.isLive ? 'Ano ⚡' : 'Ne'} />
               <InfoRow label={t.ai.activity} value={`${(signal.activityScore * 100).toFixed(0)}%`} />
               <InfoRow label={t.ai.variance} value={signal.variance.toFixed(3)} />
               <InfoRow label={t.ai.range} value={`${signal.min.toFixed(1)} – ${signal.max.toFixed(1)}`} />
               <InfoRow label={t.ai.mean} value={signal.mean.toFixed(2)} />
               <InfoRow label={t.ai.samples} value={String(signal.sampleCount)} />
               <InfoRow label={t.ai.widget} value={signal.widgetType} />
               <InfoRow label={t.ai.confidence} value={`${(signal.confidence * 100).toFixed(0)}%`} />

              {/* Activity sparkline */}
              <div>
                <span className="text-label">{t.ai.recentValues}</span>
                <div className="flex items-end gap-px mt-1 h-8">
                  {signal.history.slice(-30).map((s, i) => {
                    const v = typeof s.value === 'number' ? s.value : 0;
                    const range = signal.max - signal.min || 1;
                    const h = Math.max(2, ((v - signal.min) / range) * 100);
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm bg-accent/60"
                        style={{ height: `${h}%` }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Correlations */}
              {signal.correlations.length > 0 && (
                <div>
                  <span className="text-label flex items-center gap-1">
                    <Link2 className="w-3 h-3" /> {t.ai.correlations}
                  </span>
                  {signal.correlations.map((c, i) => (
                    <div key={i} className="flex justify-between items-center mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{c.suggestedName}</span>
                      <span className={`text-[10px] font-mono ${
                        c.strength === 'strong' ? 'text-success' : c.strength === 'moderate' ? 'text-accent' : 'text-muted-foreground'
                      }`}>
                        r={c.correlationCoeff}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="flex flex-col items-center p-1.5 rounded-lg bg-card border border-border">
      <span className={`font-mono text-xs font-bold ${color || 'text-foreground'}`}>{value}</span>
      <span className="text-[8px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[10px] font-mono text-foreground">{value}</span>
    </div>
  );
}
