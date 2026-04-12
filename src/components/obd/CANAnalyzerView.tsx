import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Square, Trash2, Filter, ChevronDown, ChevronRight,
  Activity, Radio, Lightbulb, BarChart3, Clock
} from 'lucide-react';
import { useCANAnalyzer } from '@/hooks/use-can-analyzer';
import type { TrackedFrame, SignalMapping } from '@/lib/can-analyzer';

type Props = { elmReady: boolean };

const VARIANCE_COLORS = [
  'bg-muted-foreground/20',      // 0: no change
  'bg-accent/30',                 // low
  'bg-primary/40',                // medium
  'bg-warning/50',                // high
  'bg-destructive/60',            // very high
];

function varianceLevel(v: number): number {
  if (v < 0.01) return 0;
  if (v < 0.05) return 1;
  if (v < 0.15) return 2;
  if (v < 0.4) return 3;
  return 4;
}

function varianceColor(v: number): string {
  return VARIANCE_COLORS[varianceLevel(v)];
}

export function CANAnalyzerView({ elmReady }: Props) {
  const { frames, stats, filter, setFilter, start, stop, clear } = useCANAnalyzer();
  const [expandedID, setExpandedID] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  if (!elmReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <div className="w-20 h-20 rounded-2xl carbon-bg border border-border flex items-center justify-center">
          <Activity className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Initialize ELM327 to start CAN analysis
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 pb-2">
      {/* Controls */}
      <div className="flex gap-2">
        <motion.button
          onClick={stats.running ? stop : start}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm ${
            stats.running
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-primary text-primary-foreground'
          }`}
          whileTap={{ scale: 0.98 }}
        >
          {stats.running ? (
            <><Square className="w-4 h-4 fill-current" /><span>Stop</span></>
          ) : (
            <><Play className="w-4 h-4 fill-current" /><span>Capture</span></>
          )}
        </motion.button>
        <button onClick={clear} className="p-3 rounded-xl bg-card border border-border active:bg-muted">
          <Trash2 className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-3 rounded-xl border active:bg-muted ${
            showFilters || filter.idFilter ? 'bg-primary/10 border-primary/30' : 'bg-card border-border'
          }`}
        >
          <Filter className={`w-4 h-4 ${filter.idFilter ? 'text-primary' : 'text-muted-foreground'}`} />
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-1.5">
        <StatChip icon={Radio} label="IDs" value={stats.uniqueIDs} />
        <StatChip icon={Activity} label="Frames" value={stats.totalFrames} />
        <StatChip icon={BarChart3} label="F/s" value={stats.framesPerSec} />
        <StatChip icon={Clock} label="Time" value={`${(stats.captureMs / 1000).toFixed(0)}s`} />
      </div>

      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 p-3 rounded-xl bg-card border border-border">
              <div className="flex-1">
                <span className="text-label block mb-1">CAN ID</span>
                <input
                  value={filter.idFilter}
                  onChange={e => setFilter({ ...filter, idFilter: e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '') })}
                  placeholder="7E8"
                  className="w-full bg-muted rounded-lg px-2 py-1.5 text-xs font-mono text-foreground border border-border outline-none focus:border-primary"
                  maxLength={3}
                />
              </div>
              <div className="w-14">
                <span className="text-label block mb-1">Byte#</span>
                <input
                  value={filter.byteIndex ?? ''}
                  onChange={e => {
                    const v = e.target.value ? parseInt(e.target.value) : null;
                    setFilter({ ...filter, byteIndex: v !== null && v >= 0 && v <= 7 ? v : null });
                  }}
                  placeholder="0-7"
                  className="w-full bg-muted rounded-lg px-2 py-1.5 text-xs font-mono text-foreground border border-border outline-none focus:border-primary"
                  maxLength={1}
                />
              </div>
              <div className="w-16">
                <span className="text-label block mb-1">Value</span>
                <input
                  value={filter.byteValue !== null ? filter.byteValue.toString(16).toUpperCase() : ''}
                  onChange={e => {
                    const v = e.target.value ? parseInt(e.target.value, 16) : null;
                    setFilter({ ...filter, byteValue: v !== null && v >= 0 && v <= 255 ? v : null });
                  }}
                  placeholder="FF"
                  className="w-full bg-muted rounded-lg px-2 py-1.5 text-xs font-mono text-foreground border border-border outline-none focus:border-primary"
                  maxLength={2}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live indicator */}
      {stats.running && (
        <div className="flex items-center justify-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
          <span className="text-[10px] font-mono text-muted-foreground">LIVE CAPTURE</span>
        </div>
      )}

      {/* Frame List */}
      <div className="space-y-1 max-h-[380px] overflow-y-auto">
        {frames.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            {stats.running ? 'Waiting for frames...' : 'Press Capture to start CAN stream'}
          </p>
        )}
        <AnimatePresence>
          {frames.map(f => (
            <CANFrameRow
              key={f.id}
              frame={f}
              expanded={expandedID === f.id}
              onToggle={() => setExpandedID(expandedID === f.id ? null : f.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatChip({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center p-1.5 rounded-lg bg-card border border-border">
      <Icon className="w-3 h-3 text-muted-foreground mb-0.5" />
      <span className="font-mono text-xs font-bold text-foreground">{value}</span>
      <span className="text-[8px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

function CANFrameRow({ frame, expanded, onToggle }: { frame: TrackedFrame; expanded: boolean; onToggle: () => void }) {
  const hasChanges = frame.changedBytes.some(Boolean);
  const highVariance = frame.byteVariance.some(v => v > 0.15);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-lg bg-card border border-border overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-2.5 py-2 active:bg-muted transition-colors"
      >
        {/* CAN ID */}
        <div className="flex items-center gap-2">
          <span className={`font-mono text-xs font-bold ${highVariance ? 'text-primary' : 'text-accent'}`}>
            {frame.id}
          </span>
          <span className="text-[9px] text-muted-foreground font-mono">×{frame.count}</span>
        </div>

        {/* Data bytes with change highlighting */}
        <div className="flex gap-0.5">
          {frame.current.data.map((byte, i) => {
            const changed = frame.changedBytes[i];
            const vLevel = varianceLevel(frame.byteVariance[i]);
            return (
              <motion.span
                key={i}
                className={`font-mono text-[10px] w-5 text-center rounded-sm ${
                  changed
                    ? 'text-primary-foreground bg-primary font-bold'
                    : vLevel >= 3
                    ? 'text-warning bg-warning/20'
                    : 'text-foreground'
                }`}
                animate={changed ? { scale: [1, 1.15, 1] } : {}}
                transition={{ duration: 0.2 }}
              >
                {byte.toString(16).toUpperCase().padStart(2, '0')}
              </motion.span>
            );
          })}
        </div>

        {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-2.5 pb-3 space-y-2 border-t border-border pt-2">
              {/* Byte Variance Heatmap */}
              <div>
                <span className="text-label">Byte Variance</span>
                <div className="flex gap-0.5 mt-1">
                  {frame.byteVariance.map((v, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className={`w-full h-4 rounded-sm ${varianceColor(v)}`} />
                      <span className="text-[8px] font-mono text-muted-foreground">B{i}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Previous vs Current Comparison */}
              {frame.previous && (
                <div>
                  <span className="text-label">Previous → Current</span>
                  <div className="mt-1 grid grid-cols-8 gap-0.5">
                    {frame.current.data.map((byte, i) => {
                      const prev = frame.previous!.data[i];
                      const diff = byte - (prev ?? 0);
                      return (
                        <div key={i} className="flex flex-col items-center">
                          <span className="text-[9px] font-mono text-muted-foreground">
                            {(prev ?? 0).toString(16).toUpperCase().padStart(2, '0')}
                          </span>
                          <span className="text-[8px] text-muted-foreground">↓</span>
                          <span className={`text-[9px] font-mono font-bold ${
                            diff > 0 ? 'text-success' : diff < 0 ? 'text-destructive' : 'text-foreground'
                          }`}>
                            {byte.toString(16).toUpperCase().padStart(2, '0')}
                          </span>
                          {diff !== 0 && (
                            <span className={`text-[8px] font-mono ${diff > 0 ? 'text-success' : 'text-destructive'}`}>
                              {diff > 0 ? '+' : ''}{diff}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Frame Info */}
              <div className="space-y-0.5">
                <InfoRow label="Interval" value={`${frame.intervalMs.toFixed(0)}ms`} />
                <InfoRow label="Frequency" value={frame.intervalMs > 0 ? `${(1000 / frame.intervalMs).toFixed(1)} Hz` : '—'} />
                <InfoRow label="Total frames" value={String(frame.count)} />
                <InfoRow label="High-variance bytes" value={
                  frame.byteVariance.map((v, i) => v > 0.15 ? `B${i}` : null).filter(Boolean).join(', ') || 'None'
                } />
              </div>

              {/* Signal Mapping Suggestions */}
              {frame.mappingSuggestions.length > 0 && (
                <div>
                  <span className="text-label flex items-center gap-1">
                    <Lightbulb className="w-3 h-3 text-primary" />
                    Signal Suggestions
                  </span>
                  <div className="mt-1 space-y-1">
                    {frame.mappingSuggestions.map((m, i) => (
                      <MappingCard key={i} mapping={m} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MappingCard({ mapping }: { mapping: SignalMapping }) {
  return (
    <div className="p-2 rounded-md bg-primary/5 border border-primary/20">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-medium text-primary">{mapping.signalName}</span>
        <span className="text-[9px] font-mono text-muted-foreground">
          {(mapping.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <div className="flex gap-3 mt-0.5">
        <span className="text-[9px] font-mono text-foreground">
          B{mapping.startByte}{mapping.length > 1 ? `–B${mapping.startByte + mapping.length - 1}` : ''}
        </span>
        <span className="text-[9px] font-mono text-accent">{mapping.formula}</span>
      </div>
      <p className="text-[9px] text-muted-foreground mt-0.5 italic">{mapping.reasoning}</p>
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
