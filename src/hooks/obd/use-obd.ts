import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { bleManager, BLEConnectionState, BLEDeviceInfo } from '@/lib/obd/ble-manager';
import { elm327, ELMState, InitStep } from '@/lib/obd/elm327-engine';
import { LIVE_PIDS, parsePIDResponse } from '@/lib/obd/obd-pids';

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
          setDevices((prev) => {
            if (prev.find((d) => d.deviceId === event.payload.deviceId)) return prev;
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

    return () => {
      unsub1();
      unsub2();
    };
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);
  const lastSessionUpdateRef = useRef<number>(0);

  const updateObdSession = useCallback(async (nextData: LiveData) => {
    const now = Date.now();

    if (now - lastSessionUpdateRef.current < 2000) return;

    lastSessionUpdateRef.current = now;

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      console.warn('OBD live session: user není přihlášený');
      return;
    }

    sessionUserIdRef.current = user.id;

    const { error } = await supabase.from('obd_live_sessions').upsert(
      {
        user_id: user.id,
        vin: null,
        is_active: true,
        last_seen: new Date().toISOString(),
        payload: nextData,
        dtcs: [],
      } as any,
      { onConflict: 'user_id' }
    );

    if (error) {
      console.error('OBD live session upsert error:', error);
    }
  }, []);

  const closeObdSession = useCallback(async () => {
    const userId = sessionUserIdRef.current;

    if (!userId) return;

    const { error } = await supabase
      .from('obd_live_sessions')
      .update({
        is_active: false,
        last_seen: new Date().toISOString(),
      } as any)
      .eq('user_id', userId);

    if (error) {
      console.error('OBD live session close error:', error);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      closeObdSession();
      return;
    }

    let cancelled = false;

    const poll = async () => {
      for (const pid of LIVE_PIDS) {
        if (cancelled) return;

        try {
          const response = await elm327.sendCommand(pid);
          const value = parsePIDResponse(pid, response);

          if (value !== null) {
            setData((prev) => {
              const next = {
                ...prev,
                [pid]: { value, timestamp: Date.now() },
              };

              updateObdSession(next);

              return next;
            });
          }
        } catch {
          // Skip failed reads
        }
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 500);

    return () => {
      cancelled = true;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      closeObdSession();
    };
  }, [active, updateObdSession, closeObdSession]);

  return data;
}