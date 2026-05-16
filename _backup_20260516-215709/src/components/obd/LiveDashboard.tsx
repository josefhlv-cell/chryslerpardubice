import { motion } from 'framer-motion';
import { RadialGauge, DataCard } from '@/components/obd/Gauge';
import { PIDS } from '@/lib/obd/obd-pids';
import { LiveData } from '@/hooks/obd/use-obd';
import { t } from '@/lib/obd/i18n';

type Props = {
  data: LiveData;
  active: boolean;
};

export function LiveDashboard({ data, active }: Props) {
  const rpm = data['010C']?.value ?? 0;
  const speed = data['010D']?.value ?? 0;
  const coolant = data['0105']?.value ?? 0;
  const throttle = data['0111']?.value ?? 0;
  const voltage = data['0142']?.value ?? 0;

  if (!active) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <div className="w-20 h-20 rounded-2xl carbon-bg border border-border flex items-center justify-center">
          <span className="text-3xl">🔌</span>
        </div>
        <p className="text-sm text-muted-foreground text-center">
          {t.dashboard.connectPrompt}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-4 p-4"
    >
      {/* Primary Gauges */}
      <div className="flex justify-center gap-6">
        <RadialGauge value={rpm} min={0} max={8000} label={t.dashboard.rpm} unit="rpm" size="lg" />
        <RadialGauge value={speed} min={0} max={255} label={t.dashboard.speed} unit="km/h" size="lg" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <DataCard label={t.dashboard.coolant} value={Math.round(coolant)} unit="°C" highlight={coolant > 100} />
        <DataCard label={t.dashboard.throttle} value={Math.round(throttle)} unit="%" />
        <DataCard label={t.dashboard.battery} value={voltage.toFixed(1)} unit="V" highlight={voltage < 11.5} />
      </div>

      {/* Data Freshness */}
      <div className="flex items-center justify-center gap-2 py-1">
        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        <span className="text-[10px] text-muted-foreground font-mono">{t.dashboard.live} — {Object.keys(data).length} {t.dashboard.pidsActive}</span>
      </div>
    </motion.div>
  );
}
