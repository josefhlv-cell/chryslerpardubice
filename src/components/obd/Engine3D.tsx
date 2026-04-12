import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

type Props = {
  rpm: number;
  coolant: number;
  load: number;
  active: boolean;
};

export function Engine3D({ rpm, coolant, load, active }: Props) {
  const [rotY, setRotY] = useState(0);

  // Auto-rotate speed based on RPM
  useEffect(() => {
    if (!active) return;
    const speed = 0.2 + (rpm / 8000) * 2;
    const interval = setInterval(() => {
      setRotY(prev => (prev + speed) % 360);
    }, 16);
    return () => clearInterval(interval);
  }, [rpm, active]);

  const heatColor = coolant > 100
    ? 'hsl(var(--destructive))'
    : coolant > 85
    ? 'hsl(var(--warning))'
    : 'hsl(var(--accent))';

  const loadPct = Math.min(100, Math.max(0, load));
  const pulseSpeed = 2 - (rpm / 8000) * 1.5;

  if (!active) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <div className="text-muted-foreground text-sm font-mono">ENGINE OFFLINE</div>
      </div>
    );
  }

  return (
    <div className="relative h-[200px] overflow-hidden rounded-lg border border-border bg-card">
      {/* Ambient glow based on RPM */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: `radial-gradient(ellipse at center, ${heatColor}, transparent 70%)`,
        }}
      />

      {/* 3D Engine Block */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ perspective: '600px' }}
      >
        <motion.div
          className="relative"
          style={{
            width: 140,
            height: 120,
            transformStyle: 'preserve-3d',
            transform: `rotateY(${rotY}deg) rotateX(8deg)`,
          }}
        >
          {/* Engine block faces */}
          {/* Front */}
          <div
            className="absolute inset-0 rounded-lg border-2 flex items-center justify-center"
            style={{
              borderColor: heatColor,
              background: `linear-gradient(135deg, hsl(var(--card)), hsl(var(--muted)))`,
              transform: 'translateZ(35px)',
              boxShadow: `inset 0 0 20px ${heatColor}40`,
            }}
          >
            {/* Pistons */}
            <div className="flex gap-2">
              {[0, 1, 2, 3].map(i => (
                <motion.div
                  key={i}
                  className="w-4 rounded-sm"
                  style={{ backgroundColor: heatColor }}
                  animate={{
                    height: [16, 24, 16],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: pulseSpeed,
                    repeat: Infinity,
                    delay: i * (pulseSpeed / 4),
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 rounded-lg border"
            style={{
              borderColor: 'hsl(var(--border))',
              background: 'hsl(var(--muted))',
              transform: 'rotateY(180deg) translateZ(35px)',
            }}
          />

          {/* Left */}
          <div
            className="absolute rounded-lg border"
            style={{
              width: 70,
              height: 120,
              left: 35,
              borderColor: 'hsl(var(--border))',
              background: `linear-gradient(180deg, hsl(var(--card)), hsl(var(--muted)))`,
              transform: 'rotateY(-90deg) translateZ(105px)',
            }}
          />

          {/* Right */}
          <div
            className="absolute rounded-lg border"
            style={{
              width: 70,
              height: 120,
              left: 35,
              borderColor: 'hsl(var(--border))',
              background: `linear-gradient(180deg, hsl(var(--card)), hsl(var(--muted)))`,
              transform: 'rotateY(90deg) translateZ(35px)',
            }}
          />

          {/* Top - cylinder head */}
          <div
            className="absolute rounded-lg border-2"
            style={{
              width: 140,
              height: 70,
              top: 25,
              borderColor: heatColor,
              background: `linear-gradient(90deg, hsl(var(--muted)), hsl(var(--card)))`,
              transform: 'rotateX(90deg) translateZ(-25px)',
              boxShadow: `0 0 15px ${heatColor}30`,
            }}
          />
        </motion.div>
      </div>

      {/* Load indicator bar */}
      <div className="absolute bottom-3 left-3 right-3">
        <div className="flex justify-between mb-1">
          <span className="text-label">ENGINE LOAD</span>
          <span className="text-data text-xs">{loadPct.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, hsl(var(--accent)), ${heatColor})`,
            }}
            animate={{ width: `${loadPct}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* RPM indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <motion.div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: heatColor }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: pulseSpeed, repeat: Infinity }}
        />
        <span className="text-data text-xs">{Math.round(rpm)} RPM</span>
      </div>
    </div>
  );
}
