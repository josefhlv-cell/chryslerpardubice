import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { bleManager, BLEConnectionState, BLEDeviceInfo } from '@/lib/obd/ble-manager';
import { elm327, ELMState, InitStep } from '@/lib/obd/elm327-engine';
import { LIVE_PIDS, parsePIDResponse } from '@/lib/obd/obd-pids';
import { elmQueue } from '@/lib/obd/adapter/elm-queue';
import { isPidOnCooldown, markPidFailed, markPidSuccess } from '@/lib/obd/unsupported-pid-cache';
import {
  CHRYSLER_CUSTOM_PIDS,
  testChryslerCustomPid,
  type ChryslerCustomPidDefinition,
  type ChryslerCustomPidKey,
} from '@/lib/obd/chrysler-custom-pids';


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
  const pollingRef = useRef(false);
  const dataRef = useRef<LiveData>({});
  // Chrysler custom PID discovery state (transmission oil temp, oil pressure)
  const customPidsRef = useRef<Partial<Record<ChryslerCustomPidKey, ChryslerCustomPidDefinition | null>>>({});
  const customPidTriedRef = useRef<Set<ChryslerCustomPidKey>>(new Set());
  const cycleRef = useRef(0);

  // Force-write session state (no 2s throttle) — used for initial heartbeat.
  const writeSession = useCallback(async (payload: LiveData, force = false) => {
    const now = Date.now();
    if (!force && now - lastSessionUpdateRef.current < 2000) return;
    lastSessionUpdateRef.current = now;

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      console.warn('[OBD live session] user není přihlášený');
      return;
    }
    sessionUserIdRef.current = user.id;

    const { error } = await supabase.from('obd_live_sessions').upsert(
      {
        user_id: user.id,
        vin: null,
        is_active: true,
        last_seen: new Date().toISOString(),
        payload: payload as any,
        dtcs: [],
      } as any,
      { onConflict: 'user_id' }
    );
    if (error) console.error('[OBD live session] upsert error:', error);
  }, []);

  const updateObdSession = useCallback((nextData: LiveData) => {
    dataRef.current = nextData;
    void writeSession(nextData, false);
  }, [writeSession]);

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
    if (error) console.error('[OBD live session] close error:', error);
  }, []);


  useEffect(() => {
    if (!active) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    let cancelled = false;

    // FIX: initial heartbeat so admin sees the customer as LIVE immediately,
    // even before the first PID returns a valid value.
    void writeSession(dataRef.current, true);
    const heartbeat = setInterval(() => {
      if (cancelled) return;
      void writeSession(dataRef.current, true);
    }, 5000);

    const pollChryslerCustom = async () => {
      // Try each definition once; remember the first supported one per key.
      const keys: ChryslerCustomPidKey[] = ['transmissionOilTemp', 'oilPressure'];
      for (const key of keys) {
        if (cancelled) return;
        const chosen = customPidsRef.current[key];
        if (chosen === null) continue; // exhausted, no support
        if (chosen) {
          // Re-read the already-known PID
          try {
            const result = await testChryslerCustomPid(chosen);
            if (result.supported && result.value !== null) {
              const pidKey = `CHRY_${key}`;
              setData((prev) => {
                const next = { ...prev, [pidKey]: { value: result.value!, timestamp: Date.now() } };
                updateObdSession(next);
                return next;
              });
            }
          } catch { /* ignore */ }
          continue;
        }
        if (customPidTriedRef.current.has(key)) continue;
        // Discovery: iterate all definitions for this key
        const candidates = CHRYSLER_CUSTOM_PIDS.filter((d) => d.key === key);
        for (const def of candidates) {
          if (cancelled) return;
          try {
            const result = await testChryslerCustomPid(def);
            if (result.supported && result.value !== null) {
              customPidsRef.current[key] = def;
              const pidKey = `CHRY_${key}`;
              setData((prev) => {
                const next = { ...prev, [pidKey]: { value: result.value!, timestamp: Date.now() } };
                updateObdSession(next);
                return next;
              });
              break;
            }
          } catch { /* try next */ }
        }
        if (!customPidsRef.current[key]) {
          customPidsRef.current[key] = null; // mark exhausted
        }
        customPidTriedRef.current.add(key);
      }
    };

    const poll = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        for (const pid of LIVE_PIDS) {
          if (cancelled) return;
          if (elmQueue.isPollingPaused() || isPidOnCooldown(pid)) continue;

          try {
            const res = await elmQueue.send(pid, { timeoutMs: 900, commandType: 'live_poll_command' });
            if (res.status !== 'ok') {
              markPidFailed(pid);
              continue;
            }
            const response = res.raw;
            const value = parsePIDResponse(pid, response);

            if (value !== null) {
              markPidSuccess(pid);
              setData((prev) => {
                const next = {
                  ...prev,
                  [pid]: { value, timestamp: Date.now() },
                };
                updateObdSession(next);
                return next;
              });
            } else {
              markPidFailed(pid);
            }
          } catch {
            markPidFailed(pid);
          }
        }

        // Every 8 cycles poll Chrysler custom PIDs (trans temp, oil pressure)
        cycleRef.current = (cycleRef.current + 1) % 8;
        if (cycleRef.current === 0 && !elmQueue.isPollingPaused()) {
          await pollChryslerCustom();
        }
      } finally {
        pollingRef.current = false;
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 500);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, updateObdSession, writeSession]);


  useEffect(() => {
    const close = () => { closeObdSession(); };
    window.addEventListener('beforeunload', close);
    return () => window.removeEventListener('beforeunload', close);
  }, [closeObdSession]);

  return data;
}