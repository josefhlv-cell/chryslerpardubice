import { useState } from 'react';
import { motion } from 'framer-motion';
import { DoorOpen, Truck, Grid3X3, ChevronDown, Cpu, Wifi } from 'lucide-react';
import { useVehicle } from '@/hooks/obd/use-vehicle';
import pacificaXray from '@/assets/pacifica-xray.png';
import tcXray from '@/assets/tc-xray.png';

const modules = [
  { name: 'PCM (Motor)', status: 'online' },
  { name: 'TCM (Převodovka)', status: 'online' },
  { name: 'BCM (Karoserie)', status: 'online' },
  { name: 'ABS/ESP', status: 'online' },
  { name: 'SRS (Airbagy)', status: 'sleep' },
  { name: 'IPC (Přístrojová deska)', status: 'online' },
];

const zones = [
  { icon: DoorOpen, label: 'Dveře' },
  { icon: Truck, label: 'Víko kufru' },
  { icon: Grid3X3, label: 'Okna' },
];

export function ScreenVehicleConfig() {
  const [simZones, setSimZones] = useState(false);
  const { vehicle, isPacifica } = useVehicle();
  const vehicleImg = isPacifica ? pacificaXray : tcXray;

  return (
    <section className="px-3 py-4 space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold neon-text-green tracking-wide">
          4. KONFIGURACE VOZIDLA
        </h2>
        <p className="text-[10px] text-muted-foreground font-mono tracking-widest mt-0.5">
          3D Pohled & Konfigurace — {vehicle.label}
        </p>
      </div>

      {/* Vehicle 3D Visual */}
      <div className="glass-panel p-4 neon-border-cyan">
        <div className="relative w-full flex items-center justify-center">
          <img src={vehicleImg} alt={`${vehicle.label} X-Ray`} className="w-full h-auto opacity-85"
            style={{ filter: 'drop-shadow(0 0 20px hsla(185,70%,45%,0.3))' }} width={1024} height={512} loading="lazy" />
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div className="absolute left-[18%] top-[38%] text-center"
              animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 2, repeat: Infinity }}>
              <span className="text-[9px] font-mono text-orange-400">MOTOR</span>
              <span className="block text-xs font-display font-bold text-orange-400" style={{ textShadow: '0 0 8px hsla(38,95%,55%,0.5)' }}>102°C</span>
            </motion.div>
            <motion.div className="absolute left-[45%] top-[48%] text-center"
              animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 2.5, repeat: Infinity }}>
              <span className="text-[9px] font-mono text-cyan-400">{isPacifica ? '9HP48' : '62TE'}</span>
              <span className="block text-xs font-display font-bold text-cyan-400" style={{ textShadow: '0 0 8px hsla(185,70%,55%,0.5)' }}>88°C</span>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Zone Controls */}
      <div className="flex gap-2">
        {zones.map(z => (
          <motion.button key={z.label}
            className="flex-1 glass-panel p-3 neon-border-cyan flex flex-col items-center gap-1.5"
            whileTap={{ scale: 0.95 }}
          >
            <z.icon className="w-5 h-5 text-secondary" />
            <span className="text-[10px] font-display tracking-wider text-foreground">{z.label}</span>
          </motion.button>
        ))}
      </div>

      {/* VIN dropdown */}
      <div className="glass-panel p-2.5 neon-border-cyan flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground">VIN:</span>
        <span className="text-[10px] font-mono text-secondary">1C4RC1BG...5VA...</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </div>

      {/* Simulate Zones Toggle */}
      <motion.button
        onClick={() => setSimZones(!simZones)}
        className={`w-full py-2 rounded-lg text-[10px] font-display font-bold tracking-wider border transition-colors
          ${simZones ? 'border-success/40 text-success bg-success/10' : 'border-secondary/30 text-secondary hover:bg-secondary/10'}`}
        whileTap={{ scale: 0.97 }}
      >
        SIMULOVAT ZÓNY {simZones ? '●' : '○'}
      </motion.button>

      {/* Active Modules */}
      <div className="glass-panel p-3 neon-border-cyan">
        <h3 className="font-display text-xs font-bold tracking-wider mb-2 neon-text-cyan">
          AKTIVNÍ MODULY
        </h3>
        <div className="space-y-1.5">
          {modules.map(m => (
            <div key={m.name} className="flex items-center justify-between py-1 border-b border-border/20 last:border-0">
              <div className="flex items-center gap-2">
                <Cpu className="w-3 h-3 text-secondary" />
                <span className="text-[10px] font-mono text-foreground">{m.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${m.status === 'online' ? 'bg-success' : 'bg-muted-foreground'}`} />
                <span className={`text-[9px] font-mono ${m.status === 'online' ? 'text-success' : 'text-muted-foreground'}`}>
                  {m.status === 'online' ? 'ONLINE' : 'SPÁNEK'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
