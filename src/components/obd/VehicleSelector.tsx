import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, ChevronDown, Check } from 'lucide-react';
import { useVehicle, type VehicleModel } from '@/hooks/use-vehicle';
import { t } from '@/lib/i18n';

export function VehicleSelector() {
  const { vehicle, vehicles, setVehicle } = useVehicle();
  const [open, setOpen] = useState(false);
  const [filterModel, setFilterModel] = useState<VehicleModel | 'all'>('all');

  const filtered = filterModel === 'all' ? vehicles : vehicles.filter(v => v.model === filterModel);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted/50"
      >
        <Car className="w-3.5 h-3.5 text-primary" />
        <span className="truncate max-w-[120px]">{vehicle.label}</span>
        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg w-56 overflow-hidden"
            >
              {/* Model filter */}
              <div className="flex gap-1 p-2 border-b border-border">
                {(['all', 'tc', 'pacifica'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setFilterModel(m)}
                    className={`flex-1 py-1 rounded text-[9px] font-medium transition-colors ${
                      filterModel === m ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    {m === 'all' ? t.vehicle.all : m === 'tc' ? t.vehicle.tc : t.vehicle.pacifica}
                  </button>
                ))}
              </div>

              {/* Vehicle list */}
              <div className="max-h-48 overflow-y-auto p-1">
                {filtered.map(v => {
                  const active = v.model === vehicle.model && v.year === vehicle.year;
                  return (
                    <button
                      key={`${v.model}-${v.year}`}
                      onClick={() => { setVehicle(v); setOpen(false); }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] transition-colors ${
                        active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <span>{v.label}</span>
                      {active && <Check className="w-3 h-3" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
