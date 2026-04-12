import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Thermometer, Gauge as GaugeIcon, Wind, X, Activity } from 'lucide-react';
import pcmXray from '@/assets/pcm-xray.png';

interface PCMSensor {
  did: string;
  label: string;
  value: string;
  color: string;
  category: 'temp' | 'pressure' | 'airflow';
  history: number[];
}

const sensors: PCMSensor[] = [
  { did: '2105', label: 'TEPLOTA_CHLADIVA', value: '95°C', color: 'hsl(38,95%,55%)', category: 'temp', history: [88,90,91,93,94,95,95,95] },
  { did: '2108', label: 'TEPLOTA_OLEJE', value: '105°C', color: 'hsl(25,90%,55%)', category: 'temp', history: [95,98,100,102,103,104,105,105] },
  { did: '1944', label: 'TEPLOTA_PŘEVODOVKY', value: '90°C', color: 'hsl(185,70%,55%)', category: 'temp', history: [80,82,85,87,88,89,90,90] },
  { did: '010F', label: 'TEPLOTA_SÁNÍ', value: '42°C', color: 'hsl(142,71%,45%)', category: 'temp', history: [38,39,40,41,41,42,42,42] },
  { did: '0146', label: 'TEPLOTA_OKOLÍ', value: '28°C', color: 'hsl(185,70%,45%)', category: 'temp', history: [27,27,28,28,28,28,28,28] },
  { did: '015C', label: 'TEPLOTA_DPF', value: '340°C', color: 'hsl(0,72%,55%)', category: 'temp', history: [300,310,320,330,335,338,339,340] },
  { did: '010B', label: 'MAP_TLAK', value: '98 kPa', color: 'hsl(185,70%,55%)', category: 'pressure', history: [95,96,97,97,98,98,98,98] },
  { did: 'AA10', label: 'TLAK_TURBA', value: '15 PSI', color: 'hsl(280,80%,60%)', category: 'pressure', history: [8,10,12,14,15,15,14,15] },
  { did: '8012', label: 'TLAK_PNEU_LF', value: '36 PSI', color: 'hsl(142,71%,45%)', category: 'pressure', history: [35,35,36,36,36,36,36,36] },
  { did: '8013', label: 'TLAK_PNEU_RF', value: '35 PSI', color: 'hsl(142,71%,45%)', category: 'pressure', history: [34,35,35,35,35,35,35,35] },
  { did: '0223', label: 'TLAK_PALIVA', value: '4500 kPa', color: 'hsl(38,95%,55%)', category: 'pressure', history: [4200,4300,4400,4450,4480,4490,4500,4500] },
  { did: '0110', label: 'MAF_PRŮTOK', value: '12.5 g/s', color: 'hsl(185,70%,55%)', category: 'airflow', history: [10,11,11.5,12,12,12.5,12.5,12.5] },
  { did: '0104', label: 'ZATÍŽENÍ_MOTORU', value: '32%', color: 'hsl(38,95%,55%)', category: 'airflow', history: [25,27,29,30,31,32,32,32] },
  { did: '0111', label: 'POLOHA_ŠKRTIDLA', value: '18%', color: 'hsl(142,71%,45%)', category: 'airflow', history: [12,14,15,16,17,18,18,18] },
];

const categories = [
  { key: 'temp' as const, label: 'TEPLOTNÍ SENZORY', icon: Thermometer },
  { key: 'pressure' as const, label: 'TLAK', icon: GaugeIcon },
  { key: 'airflow' as const, label: 'PRŮTOK VZDUCHU', icon: Wind },
];

function TinySparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 60, h = 18;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function ScreenPCMDeepDive() {
  const [popup, setPopup] = useState<PCMSensor | null>(null);

  return (
    <section className="px-3 py-4 space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold neon-text-green tracking-wide">
          6. PCM MODUL DEEP DIVE
        </h2>
        <p className="text-[10px] text-muted-foreground font-mono tracking-widest mt-0.5">
          MODUL PCM (MOTOR) — Detailní Telemetrie
        </p>
      </div>

      {/* PCM X-Ray header */}
      <div className="glass-panel p-3 neon-border-cyan">
        <img src={pcmXray} alt="PCM Modul X-Ray" className="w-full h-32 object-contain opacity-80"
          style={{ filter: 'drop-shadow(0 0 14px hsla(185,70%,45%,0.35))' }} width={768} height={768} loading="lazy" />
        <p className="text-center text-[9px] font-mono text-muted-foreground mt-1">PCM — Řídicí Jednotka Motoru</p>
      </div>

      {categories.map(cat => (
        <div key={cat.key} className="space-y-2">
          <div className="flex items-center gap-2">
            <cat.icon className="w-3.5 h-3.5 text-secondary" />
            <h3 className="font-display text-[11px] font-bold tracking-wider neon-text-cyan">{cat.label}</h3>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {sensors.filter(s => s.category === cat.key).map(s => (
              <motion.button key={s.did}
                onClick={() => setPopup(s)}
                className="glass-panel p-2 neon-border-cyan text-left"
                whileTap={{ scale: 0.96 }}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <div className="w-4 h-4 rounded flex items-center justify-center bg-secondary/10 flex-shrink-0">
                    <span className="text-[6px] font-mono text-secondary">{s.did.slice(0, 2)}</span>
                  </div>
                  <span className="text-[8px] font-mono text-muted-foreground truncate">{s.label}</span>
                </div>
                <span className="text-xs font-display font-bold block" style={{ color: s.color, textShadow: `0 0 6px ${s.color}40` }}>
                  {s.value}
                </span>
                <TinySparkline data={s.history} color={s.color} />
              </motion.button>
            ))}
          </div>
        </div>
      ))}

      {/* DID Popup */}
      <AnimatePresence>
        {popup && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-background/70" onClick={() => setPopup(null)} />
            <motion.div
              className="glass-panel p-4 neon-border-cyan w-full max-w-xs relative"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <button onClick={() => setPopup(null)} className="absolute top-2 right-2 text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-secondary" />
                <span className="font-display text-xs font-bold neon-text-cyan">ŽIVÝ GRAF</span>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground mb-1">DID: {popup.did}</p>
              <p className="text-sm font-mono text-foreground mb-2">{popup.label}</p>
              <p className="text-xl font-display font-bold mb-3" style={{ color: popup.color, textShadow: `0 0 10px ${popup.color}40` }}>
                {popup.value}
              </p>
              <div className="sparkline-bg rounded p-2">
                <svg width="100%" height="60" viewBox="0 0 200 60" preserveAspectRatio="none">
                  {(() => {
                    const d = popup.history;
                    const max = Math.max(...d, 1), min = Math.min(...d, 0), range = max - min || 1;
                    const pts = d.map((v, i) => `${(i / (d.length - 1)) * 200},${60 - ((v - min) / range) * 60}`).join(' ');
                    return (
                      <>
                        <polygon points={`0,60 ${pts} 200,60`} fill={`${popup.color}15`} />
                        <polyline points={pts} fill="none" stroke={popup.color} strokeWidth="2" />
                      </>
                    );
                  })()}
                </svg>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
