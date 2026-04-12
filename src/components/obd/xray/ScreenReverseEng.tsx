import { motion } from 'framer-motion';
import { Upload, Wand2 } from 'lucide-react';
import canbusXray from '@/assets/canbus-xray.png';

const hexStream = [
  { id: 210, data: '62 21 05 AA B2 A3 B2 A6 08 98 A6 68', highlight: [5, 6] },
  { id: 216, data: '0E 0E 00 06 06 00 05 00 00 00', highlight: [] },
  { id: 210, data: '02 21 05 27 83 08 06 66', highlight: [3] },
  { id: 210, data: '02 21 06 65 88 20 80 08', highlight: [4, 5] },
  { id: 210, data: '62 23 09 03 88 80 80 89', highlight: [] },
  { id: 216, data: '02 09 05 05 08 60 63 68', highlight: [] },
  { id: 210, data: '09 06 55 96 00 00 00 08', highlight: [3] },
  { id: 210, data: '03 93 05 06 88 01 06 66', highlight: [] },
  { id: 210, data: '02 56 00 06 86', highlight: [] },
];

function BitFlipGraph() {
  const w = 280, h = 60;
  const points = Array.from({ length: 30 }, (_, i) => ({
    x: (i / 29) * w,
    y: 30 + Math.sin(i * 0.5) * 15 + (Math.random() - 0.5) * 10
  }));
  const line = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="bitGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(185,70%,45%)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="hsl(185,70%,45%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill="url(#bitGrad)" />
      <polyline points={line} fill="none" stroke="hsl(185,70%,55%)" strokeWidth="1.5" />
      <text x={0} y={h - 2} fill="hsl(215,15%,50%)" fontSize="7" fontFamily="var(--font-mono)">0</text>
      <text x={w / 2} y={h - 2} fill="hsl(215,15%,50%)" fontSize="7" fontFamily="var(--font-mono)">Čas</text>
      <text x={w - 20} y={h - 2} fill="hsl(215,15%,50%)" fontSize="7" fontFamily="var(--font-mono)">60s</text>
    </svg>
  );
}

export function ScreenReverseEng() {
  return (
    <section className="px-3 py-4 space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold neon-text-green tracking-wide">
          5. REVERZNÍ INŽENÝRSTVÍ
        </h2>
        <p className="text-[10px] text-muted-foreground font-mono tracking-widest mt-0.5">
          CAN Analyzátor — Detekce Signálů
        </p>
      </div>

      {/* CAN Bus X-Ray header */}
      <div className="glass-panel p-3 neon-border-cyan">
        <img src={canbusXray} alt="CAN Bus X-Ray" className="w-full h-28 object-contain opacity-75"
          style={{ filter: 'drop-shadow(0 0 12px hsla(185,70%,45%,0.3))' }} width={768} height={512} loading="lazy" />
      </div>

      {/* Raw HEX Stream */}
      <div className="glass-panel p-3 neon-border-cyan">
        <h3 className="font-display text-xs font-bold tracking-wider mb-2 neon-text-cyan">
          CAN ANALYZÁTOR
        </h3>
        <div className="hex-scroll max-h-44 overflow-y-auto space-y-0.5">
          {hexStream.map((line, i) => (
            <motion.div key={i}
              className="flex items-center gap-2 font-mono text-[10px] py-0.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
            >
              <span className="text-muted-foreground w-8">ID: {line.id}</span>
              <span className="text-foreground/70">|</span>
              <span className="flex-1 flex flex-wrap gap-0.5">
                {line.data.split(' ').map((byte, bi) => (
                  <span key={bi}
                    className={`px-0.5 rounded ${line.highlight.includes(bi)
                      ? 'bg-warning/30 text-warning font-bold'
                      : 'text-foreground/60'}`}
                  >{byte}</span>
                ))}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Bit Flip Graph */}
      <div className="glass-panel p-3 neon-border-cyan">
        <h3 className="font-display text-xs font-bold tracking-wider mb-2 neon-text-cyan">
          SLEDOVÁNÍ ZMĚN BITŮ
        </h3>
        <BitFlipGraph />
        <div className="mt-2 text-center">
          <span className="text-[10px] font-display tracking-wider neon-text-orange animate-pulse-glow">
            DETEKCE MĚŘÍTKA
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <motion.button
          className="flex-1 py-2 rounded-lg text-[10px] font-display font-bold tracking-wider border border-secondary/30 text-secondary hover:bg-secondary/10 transition-colors"
          whileTap={{ scale: 0.97 }}
        >
          <Upload className="w-3.5 h-3.5 inline mr-1" />
          ODESLAT DO CLOUDU
        </motion.button>
        <motion.button
          className="flex-1 py-2 rounded-lg text-[10px] font-display font-bold tracking-wider border border-success/30 text-success hover:bg-success/10 transition-colors"
          whileTap={{ scale: 0.97 }}
        >
          <Wand2 className="w-3.5 h-3.5 inline mr-1" />
          AUTO-DEKÓDOVÁNÍ
        </motion.button>
      </div>
    </section>
  );
}
