import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Lock, ShieldCheck, RotateCcw, Eye, Trash2, BookOpen, Zap } from 'lucide-react';
import engineXray from '@/assets/engine-xray.png';

const tabs = ['SKENOVÁNÍ', 'ŽIVÁ DATA', 'KÓDOVÁNÍ', 'REVERZNÍ INŽ.', 'NASTAVENÍ'] as const;

const codingItems = [
  { label: 'Automatické Zamykání Dveří', did: 'DID F1B0', icon: Lock, on: false },
  { label: 'Světla Follow Me Home', did: 'DID F1B1', icon: Zap, on: true },
  { label: 'Režim DRL', did: 'DID F1B2', icon: Zap, on: false },
  { label: 'Upozornění na Pásy', did: 'DID F1B3', icon: ShieldCheck, on: true },
];

export function ScreenDTC() {
  const [activeTab, setActiveTab] = useState(0);
  const [toggles, setToggles] = useState(codingItems.map(c => c.on));

  return (
    <section className="px-3 py-4 space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold neon-text-green tracking-wide">
          2. DTC DIAGNOSTIKA
        </h2>
        <p className="text-[10px] text-muted-foreground font-mono tracking-widest mt-0.5">
          Bezpečné Kódování & Diagnostika
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {tabs.map((t, i) => (
          <button key={t}
            onClick={() => setActiveTab(i)}
            className={`px-2 py-1 text-[9px] font-mono tracking-wider rounded whitespace-nowrap transition-colors
              ${i === activeTab ? 'bg-secondary/20 neon-text-cyan border border-secondary/30' : 'text-muted-foreground hover:text-foreground'}`}
          >{t}</button>
        ))}
      </div>

      {/* Active Trouble Codes with Engine Image */}
      <div className="glass-panel p-3 neon-border-red">
        <h3 className="font-display text-xs font-bold tracking-wider mb-2 neon-text-orange">
          AKTIVNÍ CHYBOVÉ KÓDY
        </h3>
        
        {/* Engine X-Ray Image */}
        <div className="relative w-full h-40 flex items-center justify-center mb-3">
          <img src={engineXray} alt="Motor X-Ray" className="h-full w-auto object-contain opacity-85"
            style={{ filter: 'drop-shadow(0 0 16px hsla(0,72%,51%,0.3))' }} width={768} height={768} loading="lazy" />
          <motion.div className="absolute top-2 left-2 bg-destructive/20 border border-destructive/40 rounded px-2 py-1"
            animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 1.5, repeat: Infinity }}>
            <span className="font-mono text-[10px] neon-text-red">P0300</span>
          </motion.div>
        </div>

        <div className="bg-destructive/10 border border-destructive/30 rounded p-2 mb-2">
          <span className="font-mono text-sm font-bold neon-text-red">P0300</span>
          <span className="text-foreground text-xs ml-1">— Náhodné Vynechání Zážehu</span>
          <p className="text-[10px] text-muted-foreground mt-1">
            Zkontrolujte zapalovací systém, vstřikovače paliva a kabeláž.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className="text-[9px] font-mono px-2 py-1 rounded border border-secondary/30 text-secondary hover:bg-secondary/10 transition-colors">
            <Eye className="w-3 h-3 inline mr-1" />ZOBRAZIT ZMRAZENÝ RÁMEC
          </button>
          <button className="text-[9px] font-mono px-2 py-1 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="w-3 h-3 inline mr-1" />VYMAZAT KÓD
          </button>
          <button className="text-[9px] font-mono px-2 py-1 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors">
            <BookOpen className="w-3 h-3 inline mr-1" />OPRAVÁRENSKÝ MANUÁL
          </button>
        </div>
      </div>

      {/* Safe Coding */}
      <div className="glass-panel p-3 neon-border-cyan">
        <h3 className="font-display text-xs font-bold tracking-wider mb-1 neon-text-cyan">
          BEZPEČNÉ KÓDOVÁNÍ
        </h3>
        <p className="text-[9px] text-muted-foreground font-mono mb-2">
          PŘÍSTUP KE KÓDOVÁNÍ: BCM/PCM
        </p>

        <div className="space-y-2">
          {codingItems.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
              <div className="flex items-center gap-2">
                <item.icon className="w-4 h-4 text-secondary" />
                <div>
                  <span className="text-xs text-foreground">{item.label}</span>
                  <span className="text-[9px] text-muted-foreground font-mono ml-1.5">{item.did}</span>
                </div>
              </div>
              <button
                onClick={() => setToggles(t => t.map((v, i) => i === idx ? !v : v))}
                className={`w-10 h-5 rounded-full relative transition-colors ${toggles[idx] ? 'bg-success/60' : 'bg-muted'}`}
              >
                <motion.div
                  className="w-4 h-4 rounded-full bg-foreground absolute top-0.5"
                  animate={{ left: toggles[idx] ? 22 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-success" />
          <span className="text-[8px] font-mono text-muted-foreground truncate">
            SHA256: Backup 5ka256635777th00foo5aa5238a
          </span>
        </div>

        <div className="mt-2 bg-warning/10 border border-warning/30 rounded p-1.5 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
          <span className="text-[10px] font-mono neon-text-orange">
            Omezení Pacifica (7F 22 33) — Blokováno
          </span>
        </div>
      </div>

      <motion.button
        className="w-full py-2.5 rounded-lg font-display text-sm font-bold tracking-wider bg-destructive/20 border border-destructive/40 neon-text-red"
        whileTap={{ scale: 0.97 }}
      >
        <RotateCcw className="w-4 h-4 inline mr-2" />
        ROLLBACK
      </motion.button>
    </section>
  );
}
