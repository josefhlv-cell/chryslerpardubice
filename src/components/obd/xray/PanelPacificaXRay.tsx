import { motion } from 'framer-motion';
import { Thermometer, Droplets, Battery, Fuel, Gauge, Activity } from 'lucide-react';
import { useVehicle } from '@/hooks/use-vehicle';
import pacificaXray from '@/assets/pacifica-xray.png';
import tcXray from '@/assets/tc-xray.png';

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 80, h = 24;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="opacity-70">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

const sensorCards = [
  { id: 'coolant', icon: Thermometer, label: 'CHLADICÍ KAPALINA', value: 98, unit: '°C', color: 'hsl(38,95%,55%)', history: [85,88,91,94,96,97,98,98] },
  { id: 'oil', icon: Droplets, label: 'TEPLOTA OLEJE', value: 102, unit: '°C', color: 'hsl(25,90%,55%)', history: [90,93,95,98,100,101,102,102] },
  { id: 'trans', icon: Activity, label: 'TEPLOTA PŘEVODOVKY', value: 88, unit: '°C', color: 'hsl(185,70%,45%)', history: [78,80,82,84,85,86,87,88] },
  { id: 'batt', icon: Battery, label: 'BATERIE', value: 13.8, unit: 'V', color: 'hsl(142,71%,45%)', history: [13.7,13.8,13.8,13.9,13.8,13.7,13.8,13.8] },
  { id: 'fuel', icon: Fuel, label: 'PALIVO', value: 65, unit: '%', color: 'hsl(185,70%,55%)', history: [67,66,66,65,65,65,65,65] },
  { id: 'brake', icon: Gauge, label: 'BRZDY', value: 95, unit: '°C', color: 'hsl(0,72%,51%)', history: [80,84,87,90,92,93,94,95] },
];

export function PanelPacificaXRay() {
  const { vehicle, isPacifica } = useVehicle();
  const vehicleImg = isPacifica ? pacificaXray : tcXray;
  const transLabel = isPacifica ? '9HP' : '62TE';
  const transTemp = isPacifica ? '88°C' : '85°C';

  return (
    <section className="px-3 py-4 space-y-4">
      <div>
        <h2 className="font-display text-base font-bold neon-text-green tracking-wide uppercase">
          {vehicle.label} X-Ray View
        </h2>
        <p className="text-[10px] text-muted-foreground font-mono tracking-widest mt-0.5">
          Holografická Tepelná Mapa
        </p>
      </div>

      <div className="glass-panel p-4 neon-border-cyan">
        <div className="relative w-full flex items-center justify-center">
          <img src={vehicleImg} alt={`${vehicle.label} X-Ray`} className="w-full h-auto opacity-90"
            style={{ filter: 'drop-shadow(0 0 20px hsla(185,70%,45%,0.4))' }} width={1024} height={512} />
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div className="absolute left-[18%] top-[40%] text-center"
              animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, repeat: Infinity }}>
              <span className="text-[10px] font-mono text-orange-400">Motor</span>
              <span className="block text-sm font-display font-bold text-orange-400" style={{ textShadow: '0 0 10px hsla(38,95%,55%,0.6)' }}>102°C</span>
            </motion.div>
            <motion.div className="absolute left-[45%] top-[48%] text-center"
              animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2.5, repeat: Infinity }}>
              <span className="text-[10px] font-mono text-orange-400">{transLabel}</span>
              <span className="block text-sm font-display font-bold text-orange-400" style={{ textShadow: '0 0 10px hsla(38,95%,55%,0.6)' }}>{transTemp}</span>
            </motion.div>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-cyan-500/50">Telemetry</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {sensorCards.map(s => (
          <motion.div key={s.id} className="glass-panel p-2.5 neon-border-cyan" whileTap={{ scale: 0.97 }}>
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon className="w-3.5 h-3.5" style={{ color: s.color }} />
              <span className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider truncate">{s.label}</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-lg font-display font-bold" style={{ color: s.color, textShadow: `0 0 8px ${s.color}40` }}>
                {s.value}<span className="text-[10px] ml-0.5 opacity-70">{s.unit}</span>
              </span>
              <Sparkline data={s.history} color={s.color} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="glass-panel p-2.5 neon-border-green text-center">
        <span className="font-display text-xs font-bold tracking-widest neon-text-green">
          STAV SYSTÉMU: OPTIMÁLNÍ
        </span>
      </div>
    </section>
  );
}
