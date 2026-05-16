import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

type GaugeProps = {
  value: number;
  min: number;
  max: number;
  label: string;
  unit: string;
  size?: 'sm' | 'md' | 'lg';
  warningThreshold?: number;
  dangerThreshold?: number;
};

export function RadialGauge({ value, min, max, label, unit, size = 'md', warningThreshold = 65, dangerThreshold = 85 }: GaugeProps) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const needleAngle = (percentage / 100) * 270 - 135;

  const dims = { sm: 100, md: 140, lg: 180 }[size];
  const strokeWidth = { sm: 6, md: 8, lg: 10 }[size];
  const radius = (dims - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius * (270 / 360);
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const center = dims / 2;
  const needleLength = radius - 12;

  const getColor = () => {
    if (percentage > dangerThreshold) return 'hsl(var(--destructive))';
    if (percentage > warningThreshold) return 'hsl(var(--warning))';
    return 'hsl(var(--accent))';
  };

  const getGradientId = `gauge-grad-${label.replace(/\s/g, '')}`;

  // Tick marks
  const ticks = [];
  const tickCount = 9;
  for (let i = 0; i <= tickCount; i++) {
    const tickAngle = ((i / tickCount) * 270 - 135) * (Math.PI / 180);
    const innerR = radius - (size === 'lg' ? 14 : 10);
    const outerR = radius - 2;
    const isMajor = i % 3 === 0;
    ticks.push({
      x1: center + Math.cos(tickAngle) * innerR,
      y1: center + Math.sin(tickAngle) * innerR,
      x2: center + Math.cos(tickAngle) * outerR,
      y2: center + Math.sin(tickAngle) * outerR,
      major: isMajor,
      value: Math.round(min + (i / tickCount) * (max - min)),
      labelX: center + Math.cos(tickAngle) * (innerR - (size === 'lg' ? 12 : 8)),
      labelY: center + Math.sin(tickAngle) * (innerR - (size === 'lg' ? 12 : 8)),
    });
  }

  // Needle endpoint
  const needleRad = needleAngle * (Math.PI / 180);
  const needleX = center + Math.cos(needleRad) * needleLength;
  const needleY = center + Math.sin(needleRad) * needleLength;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: dims, height: dims }}>
        <svg width={dims} height={dims} className="transform -rotate-[135deg]">
          <defs>
            <linearGradient id={getGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--accent))" />
              <stop offset="60%" stopColor="hsl(var(--warning))" />
              <stop offset="100%" stopColor="hsl(var(--destructive))" />
            </linearGradient>
            <filter id={`glow-${label}`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Background arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="hsl(var(--gauge-bg))"
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${2 * Math.PI * radius - circumference}`}
            strokeLinecap="round"
          />
          {/* Value arc with gradient */}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${getGradientId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${2 * Math.PI * radius - circumference}`}
            strokeLinecap="round"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            filter={`url(#glow-${label})`}
          />
        </svg>

        {/* Tick marks (unrotated overlay) */}
        <svg width={dims} height={dims} className="absolute inset-0">
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
              stroke={t.major ? 'hsl(var(--muted-foreground))' : 'hsl(var(--border))'}
              strokeWidth={t.major ? 1.5 : 0.75}
            />
          ))}
          {/* Scale labels for large gauges */}
          {size === 'lg' && ticks.filter(t => t.major).map((t, i) => (
            <text
              key={i}
              x={t.labelX}
              y={t.labelY}
              fill="hsl(var(--muted-foreground))"
              fontSize="8"
              fontFamily="var(--font-mono)"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {t.value >= 1000 ? `${(t.value / 1000).toFixed(0)}k` : t.value}
            </text>
          ))}
        </svg>

        {/* Animated Needle */}
        <svg width={dims} height={dims} className="absolute inset-0">
          <motion.line
            x1={center}
            y1={center}
            initial={{ x2: center, y2: center }}
            animate={{ x2: needleX, y2: needleY }}
            transition={{ type: 'spring', damping: 20, stiffness: 120 }}
            stroke={getColor()}
            strokeWidth={2}
            strokeLinecap="round"
          />
          {/* Center dot */}
          <circle cx={center} cy={center} r={3} fill={getColor()} />
          <circle cx={center} cy={center} r={1.5} fill="hsl(var(--background))" />
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatedNumber value={value} className="text-data text-lg font-bold leading-none" />
          <span className="text-label mt-0.5">{unit}</span>
        </div>
      </div>
      <span className="text-label">{label}</span>
    </div>
  );
}

/* Animated rolling number display */
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const ref = useRef<number>(value);

  useEffect(() => {
    const start = ref.current;
    const diff = value - start;
    if (Math.abs(diff) < 0.5) {
      setDisplay(value);
      ref.current = value;
      return;
    }
    let frame: number;
    const steps = 8;
    let step = 0;
    const tick = () => {
      step++;
      const t = step / steps;
      const eased = 1 - Math.pow(1 - t, 3);
      const current = start + diff * eased;
      setDisplay(current);
      if (step < steps) {
        frame = requestAnimationFrame(tick);
      } else {
        ref.current = value;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{Math.round(display)}</span>;
}

type DataCardProps = {
  label: string;
  value: string | number;
  unit: string;
  highlight?: boolean;
  sparkline?: number[];
};

export function DataCard({ label, value, unit, highlight, sparkline }: DataCardProps) {
  return (
    <motion.div
      className={`rounded-lg border border-border bg-card p-3 ${highlight ? 'glow-accent' : ''}`}
      animate={highlight ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 0.3 }}
    >
      <span className="text-label block mb-1">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-data text-xl font-bold">{value}</span>
        <span className="text-muted-foreground text-xs">{unit}</span>
      </div>
      {sparkline && sparkline.length > 2 && (
        <MiniSparkline data={sparkline} />
      )}
    </motion.div>
  );
}

function MiniSparkline({ data }: { data: number[] }) {
  const w = 80;
  const h = 20;
  const maxVal = Math.max(...data);
  const minVal = Math.min(...data);
  const range = maxVal - minVal || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - minVal) / range) * h;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} className="mt-1 opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--accent))"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Horizontal bar gauge for secondary metrics */
export function BarGauge({ value, min, max, label, unit, color }: {
  value: number;
  min: number;
  max: number;
  label: string;
  unit: string;
  color?: string;
}) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const barColor = color || (pct > 85 ? 'hsl(var(--destructive))' : pct > 60 ? 'hsl(var(--warning))' : 'hsl(var(--accent))');

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-label">{label}</span>
        <span className="text-data text-sm font-bold">{Math.round(value)} <span className="text-muted-foreground text-xs font-normal">{unit}</span></span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: '0%' }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
