import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Trash2, ZoomIn, ZoomOut, AlertTriangle, TrendingUp, Layers } from 'lucide-react';
import { useSensorDecoder } from '@/hooks/obd/use-sensor-decoder';
import type { DecodedSensor } from '@/lib/obd/sensor-decoder';

type SignalTrace = {
  did: number;
  name: string;
  unit: string;
  color: string;
  data: { t: number; v: number }[];
  min: number;
  max: number;
  anomalies: number[]; // indices
};

const SIGNAL_COLORS = [
  'hsl(38, 95%, 55%)',   // primary/amber
  'hsl(185, 70%, 45%)',  // secondary/cyan
  'hsl(142, 71%, 45%)',  // success/green
  'hsl(0, 72%, 51%)',    // destructive/red
  'hsl(270, 70%, 60%)',  // purple
  'hsl(30, 90%, 55%)',   // orange
];

const MAX_POINTS = 200;
const ANOMALY_ZSCORE = 2.5;

export function TrendChartsView({ elmReady }: { elmReady: boolean }) {
  const { sensors, liveSensors, running, start, stop } = useSensorDecoder();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [traces, setTraces] = useState<Map<number, SignalTrace>>(new Map());
  const [selectedDIDs, setSelectedDIDs] = useState<Set<number>>(new Set());
  const [timeWindow, setTimeWindow] = useState(30); // seconds
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const animFrameRef = useRef<number>(0);
  const touchStartRef = useRef<{ x: number; offset: number } | null>(null);

  // Auto-select live sensors
  useEffect(() => {
    if (liveSensors.length > 0 && selectedDIDs.size === 0) {
      const top = liveSensors
        .sort((a, b) => b.activityScore - a.activityScore)
        .slice(0, 3)
        .map(s => s.did);
      setSelectedDIDs(new Set(top));
    }
  }, [liveSensors, selectedDIDs.size]);

  // Ingest sensor data into traces
  useEffect(() => {
    if (isPaused) return;
    const now = Date.now();
    setTraces(prev => {
      const next = new Map(prev);
      sensors.forEach(sensor => {
        if (!selectedDIDs.has(sensor.did)) {
          next.delete(sensor.did);
          return;
        }
        if (typeof sensor.value !== 'number') return;

        const existing = next.get(sensor.did);
        const colorIdx = Array.from(selectedDIDs).indexOf(sensor.did) % SIGNAL_COLORS.length;
        const data = existing?.data ?? [];

        // Add point if new
        if (data.length === 0 || data[data.length - 1].t !== sensor.lastUpdate) {
          data.push({ t: sensor.lastUpdate, v: sensor.value });
          if (data.length > MAX_POINTS) data.shift();
        }

        const values = data.map(d => d.v);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const stddev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);

        const anomalies: number[] = [];
        if (stddev > 0) {
          values.forEach((v, i) => {
            if (Math.abs(v - mean) / stddev > ANOMALY_ZSCORE) anomalies.push(i);
          });
        }

        next.set(sensor.did, {
          did: sensor.did,
          name: sensor.shortName,
          unit: sensor.unit,
          color: SIGNAL_COLORS[colorIdx],
          data,
          min,
          max,
          anomalies,
        });
      });
      // Remove traces for deselected DIDs
      Array.from(next.keys()).forEach(did => {
        if (!selectedDIDs.has(did)) next.delete(did);
      });
      return next;
    });
  }, [sensors, selectedDIDs, isPaused]);

  // Canvas rendering
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 12, right: 12, bottom: 32, left: 48 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // Background
    ctx.fillStyle = 'hsl(220, 20%, 7%)';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'hsl(220, 15%, 14%)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    const now = Date.now();
    const windowMs = timeWindow * 1000;
    const endTime = now - scrollOffset * 1000;
    const startTime = endTime - windowMs;

    // Time axis labels
    ctx.fillStyle = 'hsl(215, 15%, 50%)';
    ctx.font = '10px "JetBrains Mono"';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const t = startTime + (windowMs * i) / 5;
      const x = pad.left + (chartW * i) / 5;
      const sec = -Math.round((now - t) / 1000);
      ctx.fillText(`${sec}s`, x, h - 8);
    }

    // Draw each trace
    const traceArr = Array.from(traces.values());
    traceArr.forEach(trace => {
      if (trace.data.length < 2) return;

      const visibleData = trace.data.filter(d => d.t >= startTime && d.t <= endTime);
      if (visibleData.length < 2) return;

      // Normalize to 0-1 range
      const range = trace.max - trace.min || 1;
      const toX = (t: number) => pad.left + ((t - startTime) / windowMs) * chartW;
      const toY = (v: number) => pad.top + chartH - ((v - trace.min) / range) * chartH;

      // Gradient fill
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
      const baseColor = trace.color;
      grad.addColorStop(0, baseColor.replace(')', ', 0.3)').replace('hsl(', 'hsla('));
      grad.addColorStop(1, baseColor.replace(')', ', 0.02)').replace('hsl(', 'hsla('));

      ctx.beginPath();
      ctx.moveTo(toX(visibleData[0].t), toY(visibleData[0].v));
      for (let i = 1; i < visibleData.length; i++) {
        const prev = visibleData[i - 1];
        const curr = visibleData[i];
        const cpx = (toX(prev.t) + toX(curr.t)) / 2;
        ctx.bezierCurveTo(cpx, toY(prev.v), cpx, toY(curr.v), toX(curr.t), toY(curr.v));
      }
      // Fill area
      const fillPath = new Path2D();
      fillPath.moveTo(toX(visibleData[0].t), toY(visibleData[0].v));
      for (let i = 1; i < visibleData.length; i++) {
        const prev = visibleData[i - 1];
        const curr = visibleData[i];
        const cpx = (toX(prev.t) + toX(curr.t)) / 2;
        fillPath.bezierCurveTo(cpx, toY(prev.v), cpx, toY(curr.v), toX(curr.t), toY(curr.v));
      }
      fillPath.lineTo(toX(visibleData[visibleData.length - 1].t), pad.top + chartH);
      fillPath.lineTo(toX(visibleData[0].t), pad.top + chartH);
      fillPath.closePath();
      ctx.fillStyle = grad;
      ctx.fill(fillPath);

      // Line
      ctx.beginPath();
      ctx.moveTo(toX(visibleData[0].t), toY(visibleData[0].v));
      for (let i = 1; i < visibleData.length; i++) {
        const prev = visibleData[i - 1];
        const curr = visibleData[i];
        const cpx = (toX(prev.t) + toX(curr.t)) / 2;
        ctx.bezierCurveTo(cpx, toY(prev.v), cpx, toY(curr.v), toX(curr.t), toY(curr.v));
      }
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Anomaly markers
      trace.anomalies.forEach(idx => {
        const pt = trace.data[idx];
        if (!pt || pt.t < startTime || pt.t > endTime) return;
        const ax = toX(pt.t);
        const ay = toY(pt.v);

        // Pulsing ring
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
        const radius = 5 + pulse * 3;
        ctx.beginPath();
        ctx.arc(ax, ay, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'hsl(0, 72%, 51%)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(ax, ay, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'hsl(0, 72%, 61%)';
        ctx.fill();
      });

      // Latest value indicator
      const last = visibleData[visibleData.length - 1];
      if (last) {
        const lx = toX(last.t);
        const ly = toY(last.v);
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(lx, ly, 6, 0, Math.PI * 2);
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(Date.now() / 400);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Y-axis labels for this trace
      ctx.fillStyle = baseColor;
      ctx.font = '9px "JetBrains Mono"';
      ctx.textAlign = 'right';
      ctx.fillText(trace.max.toFixed(1), pad.left - 4, pad.top + 10);
      ctx.fillText(trace.min.toFixed(1), pad.left - 4, pad.top + chartH);
    });

    animFrameRef.current = requestAnimationFrame(drawChart);
  }, [traces, timeWindow, scrollOffset]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(drawChart);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [drawChart]);

  // Touch scroll
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, offset: scrollOffset };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = touchStartRef.current.x - e.touches[0].clientX;
    const pxPerSec = (canvasRef.current?.getBoundingClientRect().width ?? 300) / timeWindow;
    setScrollOffset(Math.max(0, touchStartRef.current.offset + dx / pxPerSec));
  };
  const handleTouchEnd = () => { touchStartRef.current = null; };

  const toggleDID = (did: number) => {
    setSelectedDIDs(prev => {
      const next = new Set(prev);
      if (next.has(did)) next.delete(did);
      else if (next.size < 6) next.add(did);
      return next;
    });
  };

  const clearTraces = () => {
    setTraces(new Map());
    setScrollOffset(0);
  };

  const numericSensors = sensors.filter(s => typeof s.value === 'number');
  const anomalyCount = Array.from(traces.values()).reduce((s, t) => s + t.anomalies.length, 0);

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-bold text-foreground font-mono">TRENDOVÉ GRAFY</h2>
          {anomalyCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/20 border border-destructive/40"
            >
              <AlertTriangle className="w-3 h-3 text-destructive" />
              <span className="text-[10px] font-mono text-destructive">{anomalyCount}</span>
            </motion.div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTimeWindow(w => Math.max(10, w - 10))}
            className="p-1.5 rounded bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-muted-foreground w-8 text-center">{timeWindow}s</span>
          <button
            onClick={() => setTimeWindow(w => Math.min(120, w + 10))}
            className="p-1.5 rounded bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsPaused(p => !p)}
            className={`p-1.5 rounded transition-colors ${isPaused ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={clearTraces}
            className="p-1.5 rounded bg-muted text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Signal selector */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
        {numericSensors.length > 0 ? (
          numericSensors.map((sensor, i) => {
            const isSelected = selectedDIDs.has(sensor.did);
            const colorIdx = isSelected ? Array.from(selectedDIDs).indexOf(sensor.did) % SIGNAL_COLORS.length : -1;
            return (
              <motion.button
                key={sensor.did}
                onClick={() => toggleDID(sensor.did)}
                whileTap={{ scale: 0.95 }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono whitespace-nowrap border transition-all ${
                  isSelected
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border bg-card text-muted-foreground'
                }`}
              >
                {isSelected && (
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: SIGNAL_COLORS[colorIdx] }}
                  />
                )}
                {sensor.isLive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                )}
                <span>{sensor.shortName}</span>
              </motion.button>
            );
          })
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Layers className="w-4 h-4" />
            <span>Spusťte dekodér senzorů pro zobrazení signálů</span>
          </div>
        )}
      </div>

      {/* Canvas chart */}
      <div className="flex-1 relative rounded-lg border border-border bg-card overflow-hidden min-h-[200px]">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        {scrollOffset > 0 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setScrollOffset(0)}
            className="absolute bottom-2 right-2 px-2 py-1 rounded bg-primary/20 border border-primary/40 text-[10px] font-mono text-primary"
          >
            ▸ LIVE
          </motion.button>
        )}
        {traces.size === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <TrendingUp className="w-8 h-8 mb-2 opacity-30" />
            <span className="text-xs font-mono">Vyberte signály k zobrazení</span>
          </div>
        )}
      </div>

      {/* Legend / live values */}
      <div className="grid grid-cols-3 gap-1.5">
        <AnimatePresence>
          {Array.from(traces.values()).map(trace => {
            const last = trace.data[trace.data.length - 1];
            return (
              <motion.div
                key={trace.did}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col gap-0.5 p-2 rounded-md border border-border bg-card"
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: trace.color }} />
                  <span className="text-[10px] font-mono text-muted-foreground truncate">{trace.name}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-bold font-mono text-foreground">
                    {last?.v.toFixed(1) ?? '—'}
                  </span>
                  <span className="text-[9px] text-muted-foreground">{trace.unit}</span>
                </div>
                <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
                  <span>↓{trace.min.toFixed(1)}</span>
                  <span>↑{trace.max.toFixed(1)}</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Start decoder if not running */}
      {!running && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => start()}
          className="py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-mono font-bold"
        >
          ▶ SPUSTIT DEKODÉR SENZORŮ
        </motion.button>
      )}
    </div>
  );
}
