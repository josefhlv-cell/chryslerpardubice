import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Trash2, Activity, Link2, Zap, Thermometer, Gauge, Droplets, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSensorDecoder } from '@/hooks/obd/use-sensor-decoder';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

const UNIT_ICONS: Record<string, typeof Gauge> = {
  'rpm': Gauge, '°C': Thermometer, 'kPa': Droplets, '%': BarChart3, 'V': Zap,
};

function SensorCard({ sensor }: { sensor: any }) {
  const [expanded, setExpanded] = useState(false);
  const IconComp = UNIT_ICONS[sensor.unit] || Activity;
  const chartData = sensor.history.slice(-30).map((h: any, i: number) => ({ i, v: h.value }));
  const isNum = typeof sensor.value === 'number';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-xl border p-3 cursor-pointer transition-colors ${
        sensor.isLive
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-card'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg ${sensor.isLive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <IconComp className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate text-foreground">{sensor.shortName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{sensor.name}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <motion.p
            key={String(sensor.value)}
            initial={{ y: -4, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-sm font-mono font-bold text-foreground"
          >
            {isNum ? (sensor.value as number).toFixed(1) : String(sensor.value)}
          </motion.p>
          {sensor.unit && <p className="text-[10px] text-muted-foreground">{sensor.unit}</p>}
        </div>
      </div>

      {/* Mini sparkline always visible for numeric */}
      {isNum && chartData.length > 2 && (
        <div className="mt-2 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line
                type="monotone" dataKey="v" dot={false}
                stroke={sensor.isLive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                strokeWidth={1.5}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-2 border-t border-border space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">DID</span>
                <span className="font-mono text-foreground">{sensor.didHex}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Raw</span>
                <span className="font-mono text-foreground">{sensor.rawHex}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Variance</span>
                <span className="font-mono text-foreground">{sensor.variance.toFixed(4)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-muted-foreground">Activity</span>
                <span className="font-mono text-foreground">{(sensor.activityScore * 100).toFixed(0)}%</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                <Badge variant={sensor.isLive ? 'default' : 'secondary'} className="text-[9px] h-4">
                  {sensor.isLive ? 'LIVE' : 'STATIC'}
                </Badge>
                <Badge variant="outline" className="text-[9px] h-4">{sensor.category}</Badge>
              </div>

              {/* Full chart */}
              {isNum && chartData.length > 2 && (
                <div className="h-24 mt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="i" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8, fontSize: 10,
                          color: 'hsl(var(--foreground))',
                        }}
                        formatter={(v: number) => [`${v.toFixed(2)} ${sensor.unit}`, sensor.shortName]}
                      />
                      <Line type="monotone" dataKey="v" dot={false}
                        stroke="hsl(var(--primary))" strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CorrelationCard({ pair }: { pair: any }) {
  const color = pair.strength === 'strong' ? 'text-primary' : pair.strength === 'moderate' ? 'text-amber-400' : 'text-muted-foreground';
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border">
      <Link2 className={`w-3.5 h-3.5 ${color}`} />
      <span className="text-xs font-mono text-foreground">{pair.nameA}</span>
      <span className="text-[10px] text-muted-foreground">↔</span>
      <span className="text-xs font-mono text-foreground">{pair.nameB}</span>
      <Badge variant="outline" className={`ml-auto text-[9px] h-4 ${color}`}>
        r={pair.coefficient.toFixed(2)}
      </Badge>
    </div>
  );
}

export function SensorDecoderView({ elmReady }: { elmReady: boolean }) {
  const { sensors, liveSensors, staticSensors, correlations, running, pollCount, lastPollMs, start, stop, clear } = useSensorDecoder();
  const [tab, setTab] = useState<'live' | 'all' | 'correlations'>('live');

  const displaySensors = tab === 'live' ? liveSensors : tab === 'all' ? sensors : [];

  return (
    <div className="p-3 space-y-3 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground">Sensor Decoder</h2>
          <p className="text-[10px] text-muted-foreground">
            F42x / 210x • {sensors.length} decoded • {liveSensors.length} live
          </p>
        </div>
        <div className="flex gap-1.5">
          {!running ? (
            <Button size="sm" variant="default" onClick={() => start()} className="h-7 text-xs gap-1">
              <Play className="w-3 h-3" /> Decode
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={stop} className="h-7 text-xs gap-1">
              <Square className="w-3 h-3" /> Stop
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={clear} className="h-7 text-xs">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {running && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex gap-3 text-[10px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5"
        >
          <span>Polls: <span className="text-foreground font-mono">{pollCount}</span></span>
          <span>Cycle: <span className="text-foreground font-mono">{lastPollMs}ms</span></span>
          <span>Correlations: <span className="text-foreground font-mono">{correlations.length}</span></span>
        </motion.div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
        {(['live', 'all', 'correlations'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-xs py-1.5 rounded-md transition-colors font-medium ${
              tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {t === 'live' ? `Live (${liveSensors.length})` : t === 'all' ? `All (${sensors.length})` : `Links (${correlations.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'correlations' ? (
        <div className="space-y-1.5">
          {correlations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              {running ? 'Collecting data for correlation analysis…' : 'Start decoding to detect correlations'}
            </p>
          )}
          {correlations.map((c, i) => <CorrelationCard key={i} pair={c} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {displaySensors.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              {running ? 'Scanning sensor DIDs…' : 'Press Decode to start live sensor parsing'}
            </p>
          )}
          <AnimatePresence>
            {displaySensors.map(s => <SensorCard key={s.did} sensor={s} />)}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
