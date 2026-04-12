import { useState, useEffect, useCallback, useRef } from 'react';
import { bleManager, BLEConnectionState, BLEDeviceInfo } from '@/lib/obd/ble-manager';
import { elm327, ELMState, InitStep } from '@/lib/obd/elm327-engine';
import { LIVE_PIDS, PIDS, parsePIDResponse } from '@/lib/obd/obd-pids';

export function useBLE() {
  const [connectionState, setConnectionState] = useState<BLEConnectionState>('disconnected');
  const [devices, setDevices] = useState<BLEDeviceInfo[]>([]);
  const [signalQuality, setSignalQuality] = useState(0);

  useEffect(() => {
    const unsub = bleManager.subscribe((event) => {
      switch (event.type) {
        case 'stateChange':
          setConnectionState(event.payload);
          setSignalQuality(bleManager.getSignalQuality());
          break;
        case 'deviceFound':
          setDevices(prev => {
            if (prev.find(d => d.deviceId === event.payload.deviceId)) return prev;
            return [...prev, event.payload];
          });
          break;
      }
    });
    return unsub;
  }, []);

  const scan = useCallback(async () => {
    setDevices([]);
    return bleManager.scan();
  }, []);

  const connect = useCallback(async (deviceId: string) => {
    return bleManager.connect(deviceId);
  }, []);

  const disconnect = useCallback(async () => {
    return bleManager.disconnect();
  }, []);

  return { connectionState, devices, signalQuality, scan, connect, disconnect };
}

export function useELM327() {
  const [elmState, setElmState] = useState<ELMState>('idle');
  const [initSteps, setInitSteps] = useState<InitStep[]>([]);

  useEffect(() => {
    const unsub1 = elm327.onStateChange(setElmState);
    const unsub2 = elm327.onInitProgress(setInitSteps);
    return () => { unsub1(); unsub2(); };
  }, []);

  const initialize = useCallback(async () => {
    return elm327.initialize();
  }, []);

  const sendCommand = useCallback(async (cmd: string) => {
    return elm327.sendCommand(cmd);
  }, []);

  return { elmState, initSteps, initialize, sendCommand };
}

export type LiveData = Record<string, { value: number; timestamp: number }>;

export function useLiveData(active: boolean) {
  const [data, setData] = useState<LiveData>({});
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const poll = async () => {
      for (const pid of LIVE_PIDS) {
        try {
          const response = await elm327.sendCommand(pid);
          const value = parsePIDResponse(pid, response);
          if (value !== null) {
            setData(prev => ({
              ...prev,
              [pid]: { value, timestamp: Date.now() },
            }));
          }
        } catch {
          // Skip failed reads
        }
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active]);

  return data;
}
