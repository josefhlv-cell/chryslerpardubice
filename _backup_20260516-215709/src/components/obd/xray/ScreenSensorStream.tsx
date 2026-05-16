import { motion } from 'framer-motion';
import { Download, Plus, Cpu } from 'lucide-react';
import sensorsXray from '@/assets/sensors-xray.png';

interface SensorItem {
  id: string;
  did: string;
  label: string;
  value: string;
  color: string;
  module: string;
  history: number[];
}

const initialSensors: SensorItem[] = [
  { id: '1', did: '2100', label: 'RPM_MOTORU', value: '1800', color: 'hsl(38,95%,55%)', module: 'PCM', history: [1650,1700,1750,1800,1820,1790,1800,1800] },
  { id: '2', did: '2105', label: 'TEPLOTA_CHLADICÍ_KAPALINY', value: '95°C', color: 'hsl(142,71%,45%)', module: 'PCM', history: [88,90,91,92,93,94,94,95] },
  { id: '3', did: '2108', label: 'TEPLOTA_OLEJE', value: '105°C', color: 'hsl(25,90%,55%)', module: 'PCM', history: [95,97,99,101,102,103,104,105] },
  { id: '4', did: '1944', label: 'TEPLOTA_PŘEVODOVKY', value: '90°C', color: 'hsl(185,70%,55%)', module: 'TCM', history: [80,82,84,86,87,88,89,90] },
  { id: '5', did: '8012', label: 'TLAK_PNEU_LF', value: '36 PSI', color: 'hsl(185,70%,45%)', module: 'BCM', history: [35,35,36,36,36,36,36,36] },
  { id: '6', did: 'AA10', label: 'TLAK_TURBA', value: '15 PSI', color: 'hsl(280,80%,60%)', module: 'PCM', history: [8,10,12,14,15,15,14,15] },
];

function MiniGraph({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100, h = 28;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  const fillPts = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polygon points={fillPts} fill={`${color}15`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export function ScreenSensorStream() {
  return (
    <section className="px-3 py-4 space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold neon-text-green tracking-wide">
          3. DATOVÝ TOK SENZORŮ
        </h2>
        <p className="text-[10px] text-muted-foreground font-mono tracking-widest mt-0.5">
          Živý Datový Stream — Multi-ECU
        </p>
      </div>

      {/* Sensors X-Ray header image */}
      <div className="glass-panel p-3 neon-border-cyan">
        <img src={sensorsXray} alt="Senzory X-Ray" className="w-full h-28 object-contain opacity-75"
          style={{ filter: 'drop-shadow(0 0 12px hsla(185,70%,45%,0.3))' }} width={768} height={512} loading="lazy" />
      </div>

      {/* Sensor List */}
      <div className="space-y-2">
        {initialSensors.map((s, i) => (
          <motion.div key={s.id}
            className="glass-panel p-2.5 neon-border-cyan"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded flex items-center justify-center bg-secondary/10 border border-secondary/20 flex-shrink-0">
                <Cpu className="w-3.5 h-3.5 text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono text-muted-foreground">{s.module}:</span>
                  <span className="text-[10px] font-mono text-secondary">{s.did}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-mono text-foreground truncate">{s.label}</span>
                  <span className="text-sm font-display font-bold" style={{ color: s.color, textShadow: `0 0 6px ${s.color}40` }}>
                    {s.value}
                  </span>
                </div>
              </div>
              <MiniGraph data={s.history} color={s.color} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <motion.button
          className="flex-1 py-2 rounded-lg text-[10px] font-display font-bold tracking-wider border border-secondary/30 text-secondary hover:bg-secondary/10 transition-colors"
          whileTap={{ scale: 0.97 }}
        >
          <Download className="w-3.5 h-3.5 inline mr-1" />
          EXPORT RELACE
        </motion.button>
        <motion.button
          className="flex-1 py-2 rounded-lg text-[10px] font-display font-bold tracking-wider border border-success/30 text-success hover:bg-success/10 transition-colors"
          whileTap={{ scale: 0.97 }}
        >
          <Plus className="w-3.5 h-3.5 inline mr-1" />
          PŘIDAT SENZOR
        </motion.button>
      </div>
    </section>
  );
}
