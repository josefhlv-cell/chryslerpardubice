import { motion } from 'framer-motion';
import { Bluetooth, BluetoothSearching, BluetoothOff, Signal, Wifi } from 'lucide-react';
import { BLEConnectionState, BLEDeviceInfo } from '@/lib/obd/ble-manager';
import { t } from '@/lib/obd/i18n';

type SignalBarsProps = {
  quality: number;
};

export function SignalBars({ quality }: SignalBarsProps) {
  const bars = 5;
  const activeBars = Math.ceil((quality / 100) * bars);

  const getColor = () => {
    if (quality >= 70) return 'bg-success';
    if (quality >= 40) return 'bg-warning';
    return 'bg-destructive';
  };

  return (
    <div className="flex items-end gap-0.5 h-4">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className={`w-1 rounded-full ${i < activeBars ? getColor() : 'bg-muted'}`}
          style={{ height: `${((i + 1) / bars) * 100}%` }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: i * 0.05 }}
        />
      ))}
    </div>
  );
}

type StatusBarProps = {
  connectionState: BLEConnectionState;
  signalQuality: number;
  device: BLEDeviceInfo | null;
  elmReady: boolean;
};

export function StatusBar({ connectionState, signalQuality, device, elmReady }: StatusBarProps) {
  const getIcon = () => {
    switch (connectionState) {
      case 'scanning': return <BluetoothSearching className="w-4 h-4 text-primary animate-pulse" />;
      case 'connecting': return <Bluetooth className="w-4 h-4 text-primary animate-pulse-glow" />;
      case 'connected': return <Bluetooth className="w-4 h-4 text-success" />;
      case 'error': return <BluetoothOff className="w-4 h-4 text-destructive" />;
      default: return <BluetoothOff className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'scanning': return t.status.scanning;
      case 'connecting': return t.status.connecting;
      case 'connected': return device?.name || t.status.connected;
      case 'error': return t.status.error;
      default: return t.status.disconnected;
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border safe-top">
      <div className="flex items-center gap-2">
        {getIcon()}
        <span className="text-xs font-medium text-foreground">{getStatusText()}</span>
      </div>
      <div className="flex items-center gap-3">
        {connectionState === 'connected' && (
          <>
            <SignalBars quality={signalQuality} />
            <div className={`w-2 h-2 rounded-full ${elmReady ? 'bg-success glow-success' : 'bg-muted'}`} />
          </>
        )}
        <span className="font-mono text-[10px] text-muted-foreground">CHDP 4.0</span>
      </div>
    </div>
  );
}
