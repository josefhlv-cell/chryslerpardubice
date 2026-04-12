import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSensorDecoder } from '@/hooks/use-sensor-decoder';
import { Sparkline } from './Sparkline';
import { X, Wifi, WifiOff } from 'lucide-react';

import engineXray from '@/assets/engine-xray.png';
import transmissionXray from '@/assets/transmission-xray.png';
import brakesXray from '@/assets/brakes-xray.png';
import electricalXray from '@/assets/electrical-xray.png';
import hvacXray from '@/assets/hvac-xray.png';
import exhaustXray from '@/assets/exhaust-xray.png';
import steeringXray from '@/assets/steering-xray.png';
import canbusXray from '@/assets/canbus-xray.png';
import pacificaXray from '@/assets/pacifica-xray.png';
import sensorsXray from '@/assets/sensors-xray.png';

interface SubsystemDID {
  did: number;
  label: string;
  unit: string;
}

interface DiagIcon {
  label: string;
  desc: string;
  image: string;
  svg: React.ReactNode;
  dids: SubsystemDID[];
}

const icons: DiagIcon[] = [
  {
    label: 'Motor',
    desc: 'Pentastar 3.6L V6 — Řízení spalování, vstřikování, zapalování',
    image: engineXray,
    dids: [
      { did: 0xF40C, label: 'Otáčky', unit: 'RPM' },
      { did: 0xF405, label: 'Teplota chladiva', unit: '°C' },
      { did: 0xF404, label: 'Zatížení motoru', unit: '%' },
      { did: 0xF45C, label: 'Teplota oleje', unit: '°C' },
      { did: 0xF40E, label: 'Předstih zapalování', unit: '°' },
    ],
    svg: (
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <rect x={10} y={14} width={28} height={22} rx={2} fill="none" stroke="currentColor" strokeWidth="1.5" />
        {[17, 24, 31].map(x => (
          <g key={x}>
            <rect x={x - 2.5} y={16} width={5} height={8} rx={1} fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
            <motion.rect x={x - 1.5} y={18} width={3} height={3} rx={0.5} fill="currentColor" opacity={0.4}
              animate={{ y: [18, 20, 18] }} transition={{ duration: 1.2, repeat: Infinity, delay: x * 0.05 }} />
          </g>
        ))}
        <path d="M14,14 L14,10 L34,10 L34,14" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
        <path d="M12,36 L12,38 L36,38 L36,36" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      </svg>
    ),
  },
  {
    label: 'Převodovka',
    desc: '9HP48 / 62TE — Automatická převodovka, měnič momentu',
    image: transmissionXray,
    dids: [
      { did: 0xF4A6, label: 'Teplota převodovky', unit: '°C' },
      { did: 0xF4A4, label: 'Zařazený stupeň', unit: '' },
      { did: 0xF40D, label: 'Rychlost vozidla', unit: 'km/h' },
    ],
    svg: (
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <circle cx={24} cy={22} r={10} fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx={24} cy={22} r={4} fill="none" stroke="currentColor" strokeWidth="0.8" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return <line key={i} x1={24 + Math.cos(a) * 10} y1={22 + Math.sin(a) * 10} x2={24 + Math.cos(a) * 13} y2={22 + Math.sin(a) * 13} stroke="currentColor" strokeWidth="1.5" />;
        })}
        <circle cx={36} cy={34} r={6} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      </svg>
    ),
  },
  {
    label: 'Brzdy',
    desc: 'Kotoučové brzdy — Třmen, destičky, ABS/ESP',
    image: brakesXray,
    dids: [
      { did: 0xF449, label: 'Brzdový pedál', unit: '' },
      { did: 0xF40D, label: 'Rychlost vozidla', unit: 'km/h' },
    ],
    svg: (
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <circle cx={24} cy={24} r={14} fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx={24} cy={24} r={6} fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
        {[0, 60, 120, 180, 240, 300].map(deg => {
          const rad = (deg * Math.PI) / 180;
          return <line key={deg} x1={24 + Math.cos(rad) * 7} y1={24 + Math.sin(rad) * 7}
            x2={24 + Math.cos(rad) * 13} y2={24 + Math.sin(rad) * 13}
            stroke="currentColor" strokeWidth="0.5" opacity="0.4" />;
        })}
        <path d="M8,18 L8,30 L14,30 L14,18 Z" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.8" />
      </svg>
    ),
  },
  {
    label: 'Elektrika',
    desc: 'Kabeláž, pojistková skříň, relé, napájecí soustava',
    image: electricalXray,
    dids: [
      { did: 0xF442, label: 'Napětí baterie', unit: 'V' },
      { did: 0xF404, label: 'Zatížení', unit: '%' },
    ],
    svg: (
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <rect x={8} y={16} width={32} height={20} rx={2} fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x={16} y={12} width={4} height={4} rx={0.5} fill="none" stroke="currentColor" strokeWidth="1" />
        <rect x={28} y={12} width={4} height={4} rx={0.5} fill="none" stroke="currentColor" strokeWidth="1" />
        <text x={18} y={11} textAnchor="middle" fill="currentColor" fontSize="7" fontWeight="bold">+</text>
        <text x={30} y={11} textAnchor="middle" fill="currentColor" fontSize="7" fontWeight="bold">−</text>
        <path d="M20,24 L24,20 L24,26 L28,22" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
      </svg>
    ),
  },
  {
    label: 'Klimatizace',
    desc: 'HVAC systém — Kompresor, výparník, dmychadlo',
    image: hvacXray,
    dids: [
      { did: 0xF446, label: 'Venkovní teplota', unit: '°C' },
      { did: 0xF405, label: 'Teplota chladiva', unit: '°C' },
    ],
    svg: (
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <rect x={12} y={12} width={24} height={24} rx={2} fill="none" stroke="currentColor" strokeWidth="1.5" />
        {[17, 21, 25, 29, 33].map(y => (
          <line key={y} x1={14} y1={y} x2={34} y2={y} stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
        ))}
        <circle cx={24} cy={24} r={6} fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
        <motion.g animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '24px 24px' }}>
          {[0, 90, 180, 270].map(deg => {
            const rad = (deg * Math.PI) / 180;
            return <line key={deg} x1={24} y1={24} x2={24 + Math.cos(rad) * 5} y2={24 + Math.sin(rad) * 5}
              stroke="currentColor" strokeWidth="1" opacity="0.7" />;
          })}
        </motion.g>
      </svg>
    ),
  },
  {
    label: 'Karoserie',
    desc: 'BCM — Řídicí jednotka karoserie, zamykání, okna',
    image: pacificaXray,
    dids: [
      { did: 0x2100, label: 'Tlak PL', unit: 'kPa' },
      { did: 0x2101, label: 'Tlak PP', unit: 'kPa' },
      { did: 0x2102, label: 'Tlak ZL', unit: 'kPa' },
      { did: 0x2103, label: 'Tlak ZP', unit: 'kPa' },
    ],
    svg: (
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <path d="M6,32 L10,16 L18,10 L38,10 L44,18 L44,32 L6,32 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12,18 L18,12 L26,12 L26,18 Z" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
        <path d="M28,12 L36,12 L42,18 L28,18 Z" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
        <circle cx={14} cy={32} r={4} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
        <circle cx={38} cy={32} r={4} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      </svg>
    ),
  },
  {
    label: 'Řízení',
    desc: 'EPS — Elektrický posilovač řízení, hřeben, sloupek',
    image: steeringXray,
    dids: [
      { did: 0xF40D, label: 'Rychlost', unit: 'km/h' },
      { did: 0xF40C, label: 'Otáčky motoru', unit: 'RPM' },
    ],
    svg: (
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <circle cx={24} cy={24} r={15} fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx={24} cy={24} r={9} fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx={24} cy={24} r={3} fill="none" stroke="currentColor" strokeWidth="0.8" />
        {[0, 72, 144, 216, 288].map(deg => {
          const rad = (deg * Math.PI) / 180;
          return <line key={deg} x1={24 + Math.cos(rad) * 3} y1={24 + Math.sin(rad) * 3}
            x2={24 + Math.cos(rad) * 9} y2={24 + Math.sin(rad) * 9}
            stroke="currentColor" strokeWidth="0.8" opacity="0.6" />;
        })}
      </svg>
    ),
  },
  {
    label: 'Výfuk',
    desc: 'Výfukový systém — Svody, katalyzátor, tlumič',
    image: exhaustXray,
    dids: [
      { did: 0xF405, label: 'Teplota chladiva', unit: '°C' },
      { did: 0xF410, label: 'Průtok vzduchu MAF', unit: 'g/s' },
      { did: 0xF404, label: 'Zatížení', unit: '%' },
    ],
    svg: (
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <path d="M6,28 L20,28 L20,24 L32,24 L32,28 L42,28 L42,32 L32,32 L32,28" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M20,28 L20,32 L6,32" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x={22} y={20} width={8} height={12} rx={2} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.7" />
        <motion.path d="M42,27 Q45,24 44,20" fill="none" stroke="currentColor" strokeWidth="0.8" opacity={0.4}
          animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 1.5, repeat: Infinity }} />
      </svg>
    ),
  },
  {
    label: 'Senzory',
    desc: 'Teplotní, tlakové a průtokové senzory — MAF, MAP, O2',
    image: sensorsXray,
    dids: [
      { did: 0xF410, label: 'MAF průtok', unit: 'g/s' },
      { did: 0xF40F, label: 'Teplota sání', unit: '°C' },
      { did: 0xF446, label: 'Venkovní teplota', unit: '°C' },
      { did: 0xF411, label: 'Poloha škrtící klapky', unit: '%' },
    ],
    svg: (
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <circle cx={24} cy={24} r={14} fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text x={24} y={19} textAnchor="middle" fill="currentColor" fontSize="13" fontWeight="bold" fontFamily="var(--font-display)">S</text>
        <motion.circle cx={24} cy={24} r={14} fill="none" stroke="currentColor" strokeWidth="0.5" opacity={0.3}
          animate={{ r: [14, 16, 14], opacity: [0.3, 0.1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }} />
      </svg>
    ),
  },
  {
    label: 'CAN BUS',
    desc: 'CAN sběrnice — Komunikační síť řídicích jednotek',
    image: canbusXray,
    dids: [
      { did: 0xF41F, label: 'Doba běhu', unit: 's' },
      { did: 0xF421, label: 'Vzdálenost s MIL', unit: 'km' },
    ],
    svg: (
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <circle cx={14} cy={14} r={4} fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx={34} cy={14} r={4} fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx={24} cy={34} r={4} fill="none" stroke="currentColor" strokeWidth="1.2" />
        <line x1={14} y1={18} x2={24} y2={30} stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
        <line x1={34} y1={18} x2={24} y2={30} stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
        <line x1={14} y1={14} x2={34} y2={14} stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
        <motion.circle cx={24} cy={24} r={2} fill="currentColor" opacity={0.5}
          animate={{ cx: [14, 24, 34, 24, 14], cy: [14, 34, 14, 34, 14] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }} />
      </svg>
    ),
  },
];
export function PanelDiagIcons() {
  const [detail, setDetail] = useState<DiagIcon | null>(null);
  const { sensors, running } = useSensorDecoder();

  const sensorMap = useMemo(() => {
    const m = new Map<number, typeof sensors[0]>();
    sensors.forEach(s => m.set(s.did, s));
    return m;
  }, [sensors]);

  const getSensorValue = useCallback((did: number): string => {
    const s = sensorMap.get(did);
    if (s && typeof s.value === 'number') return `${s.value.toFixed(s.unit === 'RPM' || s.unit === 'km' ? 0 : 1)} ${s.unit}`;
    if (s) return `${s.value} ${s.unit}`;
    const fallbacks: Record<number, string> = {
      0xF40C: '850 RPM', 0xF405: '92 °C', 0xF404: '24 %', 0xF45C: '98 °C',
      0xF40E: '14.5 °', 0xF4A6: '78 °C', 0xF4A4: 'D4', 0xF40D: '0 km/h',
      0xF449: 'OFF', 0xF442: '13.8 V', 0xF446: '22 °C', 0x2100: '228 kPa',
      0x2101: '230 kPa', 0x2102: '225 kPa', 0x2103: '227 kPa', 0xF410: '4.2 g/s',
      0xF40F: '34 °C', 0xF411: '15.6 %', 0xF41F: '342 s', 0xF421: '0 km',
    };
    return fallbacks[did] ?? '—';
  }, [sensorMap]);

  const getSparklineData = useCallback((did: number): number[] => {
    const s = sensorMap.get(did);
    if (!s || !s.history || s.history.length < 2) return [];
    const now = Date.now();
    const window30s = s.history.filter(h => now - h.ts < 30000);
    return window30s.map(h => h.value);
  }, [sensorMap]);

  const isLive = useCallback((did: number): boolean => {
    return sensorMap.has(did) && (sensorMap.get(did)?.isLive ?? false);
  }, [sensorMap]);

  return (
    <section className="px-3 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-bold neon-text-green tracking-wide uppercase">
            Sada Diagnostických Ikon
          </h2>
          <p className="text-[10px] text-muted-foreground font-mono tracking-widest mt-0.5">
            Holografické Symboly — Klikni pro detail
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {running ? (
            <Wifi className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className="text-[8px] font-mono text-muted-foreground">
            {running ? 'ŽIVĚ' : 'DEMO'}
          </span>
        </div>
      </div>

      <div className="glass-panel p-4 neon-border-cyan">
        <div className="grid grid-cols-3 gap-4">
          {icons.map((icon, i) => (
            <motion.button key={icon.label}
              className="flex flex-col items-center gap-2"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.06 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setDetail(icon)}
            >
              <div className="w-16 h-16 text-secondary" style={{ filter: 'drop-shadow(0 0 6px hsla(185,70%,45%,0.4))' }}>
                {icon.svg}
              </div>
              <span className="text-[10px] font-display tracking-wider text-foreground text-center">
                {icon.label}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Detail Popup */}
      <AnimatePresence>
        {detail && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setDetail(null)} />
            <motion.div
              className="glass-panel p-4 neon-border-cyan w-full max-w-sm relative z-10 max-h-[85vh] overflow-y-auto"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
            >
              <button onClick={() => setDetail(null)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground z-10">
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-display text-sm font-bold neon-text-cyan tracking-wider">
                  {detail.label}
                </h3>
                {running ? (
                  <span className="text-[7px] font-mono bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">LIVE</span>
                ) : (
                  <span className="text-[7px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">DEMO</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground font-mono mb-3">
                {detail.desc}
              </p>
              <div className="rounded-lg overflow-hidden bg-background/30 p-2">
                <img
                  src={detail.image}
                  alt={`${detail.label} X-Ray`}
                  className="w-full h-40 object-contain"
                  style={{ filter: 'drop-shadow(0 0 16px hsla(185,70%,45%,0.4))' }}
                  width={768}
                  height={768}
                />
              </div>

              {/* Live DID Values with Sparklines */}
              <div className="mt-3 space-y-1.5">
                <span className="text-[9px] font-display tracking-widest text-secondary uppercase">
                  Živé DID hodnoty — {running ? '30s historie' : 'demo režim'}
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {detail.dids.map(d => {
                    const sparkData = getSparklineData(d.did);
                    const live = isLive(d.did);
                    return (
                      <div key={d.did} className="bg-background/40 rounded px-2 py-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-mono text-muted-foreground">
                            <span className={live ? 'text-green-400' : 'text-secondary/70'}>
                              0x{d.did.toString(16).toUpperCase()}
                            </span>{' '}
                            {d.label}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-foreground">
                            {getSensorValue(d.did)}
                          </span>
                        </div>
                        <Sparkline
                          data={sparkData.length > 1 ? sparkData : generateDemoSparkline(d.did)}
                          width={260}
                          height={16}
                          color={live ? 'hsl(142, 70%, 45%)' : 'hsl(185, 70%, 45%)'}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="w-10 h-10 text-secondary flex-shrink-0" style={{ filter: 'drop-shadow(0 0 4px hsla(185,70%,45%,0.3))' }}>
                  {detail.svg}
                </div>
                <div className="flex-1">
                  <div className="h-1.5 bg-secondary/20 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-secondary rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: '75%' }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground mt-0.5 block">STAV: NORMÁLNÍ</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// Generate realistic demo sparkline data for each DID
function generateDemoSparkline(did: number): number[] {
  const seed = did & 0xFF;
  const base: Record<number, [number, number]> = {
    0xF40C: [800, 900], 0xF405: [88, 95], 0xF404: [20, 30], 0xF45C: [95, 102],
    0xF40E: [12, 16], 0xF4A6: [74, 82], 0xF4A4: [3, 5], 0xF40D: [0, 5],
    0xF449: [0, 1], 0xF442: [13.5, 14.0], 0xF446: [20, 24], 0x2100: [225, 232],
    0x2101: [226, 234], 0x2102: [222, 228], 0x2103: [224, 230], 0xF410: [3.5, 5.0],
    0xF40F: [32, 36], 0xF411: [14, 18], 0xF41F: [300, 400], 0xF421: [0, 5],
  };
  const [lo, hi] = base[did] ?? [0, 100];
  const range = hi - lo;
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    return lo + range * (0.5 + 0.3 * Math.sin(t * 6 + seed) + 0.1 * Math.sin(t * 13 + seed * 2));
  });
}
