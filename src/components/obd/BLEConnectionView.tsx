import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bluetooth, BluetoothSearching, RefreshCw, ChevronRight, Signal } from 'lucide-react';
import { BLEConnectionState, BLEDeviceInfo } from '@/lib/ble-manager';
import { InitStep } from '@/lib/elm327-engine';
import { SignalBars } from './StatusBar';
import { t } from '@/lib/i18n';

type Props = {
  connectionState: BLEConnectionState;
  devices: BLEDeviceInfo[];
  initSteps: InitStep[];
  onScan: () => void;
  onConnect: (deviceId: string) => void;
  onDisconnect: () => void;
  onInitialize: () => void;
};

export function BLEConnectionView({
  connectionState, devices, initSteps, onScan, onConnect, onDisconnect, onInitialize
}: Props) {
  const isScanning = connectionState === 'scanning';
  const isConnected = connectionState === 'connected';

  return (
    <div className="flex flex-col gap-4 p-4">
      {!isConnected && (
        <motion.button
          onClick={onScan}
          disabled={isScanning}
          className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-card border border-border text-foreground font-medium transition-colors active:bg-muted disabled:opacity-50"
          whileTap={{ scale: 0.98 }}
        >
          {isScanning ? (
            <>
              <BluetoothSearching className="w-5 h-5 text-primary animate-pulse" />
              <span>{t.ble.scanning}</span>
            </>
          ) : (
            <>
              <Bluetooth className="w-5 h-5 text-primary" />
              <span>{t.ble.scanForDevices}</span>
            </>
          )}
        </motion.button>
      )}

      {!isConnected && devices.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-label px-1">{t.ble.foundDevices}</h3>
          <AnimatePresence>
            {devices.map((device, i) => (
              <motion.button
                key={device.deviceId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => onConnect(device.deviceId)}
                className="flex items-center justify-between w-full p-4 rounded-xl bg-card border border-border active:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Bluetooth className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">{device.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{device.deviceId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <SignalBars quality={device.rssi >= -50 ? 100 : device.rssi >= -70 ? 60 : 30} />
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      {connectionState === 'connecting' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4 py-8"
        >
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Bluetooth className="w-8 h-8 text-primary animate-pulse-glow" />
          </div>
          <p className="text-sm text-muted-foreground">{t.ble.connectingToAdapter}</p>
        </motion.div>
      )}

      {isConnected && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-label px-1">{t.ble.elmInit}</h3>
            <button
              onClick={onDisconnect}
              className="text-xs text-destructive font-medium px-2 py-1"
            >
              {t.ble.disconnect}
            </button>
          </div>

          {initSteps.length === 0 && (
            <motion.button
              onClick={onInitialize}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-primary text-primary-foreground font-semibold"
              whileTap={{ scale: 0.98 }}
            >
              <RefreshCw className="w-4 h-4" />
              {t.ble.initElm}
            </motion.button>
          )}

          {initSteps.length > 0 && (
            <div className="space-y-1">
              {initSteps.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-card border border-border"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-primary w-14">{step.command}</span>
                    <span className="text-xs text-muted-foreground">{step.description}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {step.response && (
                      <span className="font-mono text-[10px] text-data-readout">{step.response}</span>
                    )}
                    <div className={`w-2 h-2 rounded-full ${
                      step.status === 'success' ? 'bg-success' :
                      step.status === 'error' ? 'bg-destructive' :
                      step.status === 'running' ? 'bg-primary animate-pulse' :
                      'bg-muted'
                    }`} />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
