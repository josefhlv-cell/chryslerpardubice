import { motion } from 'framer-motion';
import { Thermometer, Droplets, Battery, Fuel, Gauge, Activity } from 'lucide-react';
import { useVehicle } from '@/hooks/use-vehicle';
import pacificaXray from '@/assets/pacifica-xray.png';
import tcXray from '@/assets/tc-xray.png';

function CircularGauge({ value, max, label, unit, color, size = 88 }: { value: number; max: number; label: string; unit: string; color: string; size?: number }) {
  const pct = Math.min(value / max, 1);
  const r = size * 0.43, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r * 0.75;
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.86} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsla(220,15%,20%,0.5)" strokeWidth="5"
          strokeDasharray={`${circumference} ${2 * Math.PI * r * 0.25}`}
          transform={`rotate(135 ${cx} ${cy})`} strokeLinecap="round" />
        <motion.circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${circumference} ${2 * Math.PI * r * 0.25}`}
          strokeDashoffset={offset}
          transform={`rotate(135 ${cx} ${cy})`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
        {Array.from({ length: 9 }, (_, i) => {
          const angle = 135 + (i / 8) * 270;
          const rad = (angle * Math.PI) / 180;
          const x1 = cx + Math.cos(rad) * (r - 5);
          const y1 = cy + Math.sin(rad) * (r - 5);
          const x2 = cx + Math.cos(rad) * (r + 2);
          const y2 = cy + Math.sin(rad) * (r + 2);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsla(215,15%,40%,0.5)" strokeWidth="0.8" />;
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" fill={color} fontSize="18" fontFamily="var(--font-display)" fontWeight="700">
          {value}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="hsl(215,15%,50%)" fontSize="8" fontFamily="var(--font-mono)">
          {unit}
        </text>
      </svg>
      <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{label}</span>
    </div>
  );
}

const dashCards = [
  { id: 'coolant', icon: Thermometer, label: 'CHLADICÍ KAPALINA', value: 98, unit: '°C', color: 'hsl(38,95%,55%)' },
  { id: 'oil', icon: Droplets, label: 'TEPLOTA OLEJE', value: 102, unit: '°C', color: 'hsl(25,90%,55%)' },
  { id: 'trans', icon: Activity, label: 'TEPLOTA PŘEVODOVKY', value: 88, unit: '°C', color: 'hsl(185,70%,45%)' },
  { id: 'batt', icon: Battery, label: 'BATERIE', value: 13.8, unit: 'V', color: 'hsl(142,71%,45%)' },
  { id: 'fuel', icon: Fuel, label: 'PALIVO', value: 65, unit: '%', color: 'hsl(185,70%,55%)' },
  { id: 'brake', icon: Gauge, label: 'BRZDY', value: 95, unit: '°C', color: 'hsl(0,72%,51%)' },
];

export function PanelMainDashboard() {
  const { vehicle, isPacifica } = useVehicle();
  const vehicleImg = isPacifica ? pacificaXray : tcXray;

  return (
    <section className="px-3 py-4 space-y-4">
      <div className="text-center">
        <h2 className="font-display text-base font-bold neon-text-orange tracking-wide uppercase">
          Hlavní Palubní Deska
        </h2>
        <p className="text-[10px] neon-text-cyan font-mono tracking-widest mt-0.5">
          {vehicle.label}
        </p>
      </div>

      <div className="glass-panel p-4 neon-border-cyan">
        <div className="flex justify-between items-start">
          <CircularGauge value={120} max={260} label="KM/H" unit="KM/H" color="hsl(142,71%,55%)" size={96} />
          <CircularGauge value={4000} max={7000} label="OT/MIN" unit="RPM" color="hsl(185,70%,55%)" size={96} />
        </div>

        <div className="relative w-full flex items-center justify-center -mt-2">
          <img src={vehicleImg} alt={`${vehicle.label} X-Ray`} className="w-full h-auto max-h-36 object-contain opacity-80"
            style={{ filter: 'drop-shadow(0 0 12px hsla(185,70%,45%,0.3))' }} width={1024} height={512} loading="lazy" />
        </div>
        <p className="text-center text-[10px] text-muted-foreground font-display tracking-widest">
          {vehicle.label} 3D
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {dashCards.map(s => (
          <motion.div key={s.id} className="glass-panel p-3 neon-border-cyan text-center" whileTap={{ scale: 0.97 }}>
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <s.icon className="w-3.5 h-3.5" style={{ color: s.color }} />
              <span className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider">{s.label}</span>
            </div>
            <span className="text-2xl font-display font-bold block" style={{ color: s.color, textShadow: `0 0 10px ${s.color}40` }}>
              {s.value}<span className="text-xs ml-0.5 opacity-70">{s.unit}</span>
            </span>
          </motion.div>
        ))}
      </div>

      <div className="glass-panel p-2.5 neon-border-green text-center">
        <span className="font-display text-xs font-bold tracking-widest">
          STAV SYSTÉMU: <span className="neon-text-green">OPTIMÁLNÍ</span>
        </span>
      </div>
    </section>
  );
}
