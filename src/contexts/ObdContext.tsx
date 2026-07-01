/**
 * ObdContext — GLOBÁLNÍ OBD stav v celé aplikaci.
 *
 * Cíl:
 *  1) BLE spojení a ELM327 běží nezávisle na aktuální stránce (survives navigace).
 *  2) Polling PID + heartbeat do `obd_live_sessions` běží po celou dobu, co je adaptér připojený.
 *  3) Po startu aplikace zkusí automaticky připojit posledně použitý adaptér.
 *  4) Bezpečný upsert na `obd_live_sessions` (UNIQUE user_id) — nevznikají duplicitní relace.
 *  5) Odpojí se pouze po `disconnect()`, po ztrátě BLE nebo po vypnutí aplikace.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { bleManager, BLEDeviceInfo, BLEConnectionState } from "@/lib/obd/ble-manager";
import { elm327 } from "@/lib/obd/elm327-engine";
import { LIVE_PIDS, parsePIDResponse } from "@/lib/obd/obd-pids";

export type ObdLiveData = {
  rpm: number;
  coolantTemp: number;
  intakeTemp: number;
  speed: number;
  throttle: number;
  fuelPressure: number;
  engineLoad: number;
  voltage: number;
  boostPressure: number;
};

export type ObdDtc = {
  code: string;
  description: string;
  severity: "low" | "medium" | "high";
};

const EMPTY_LIVE: ObdLiveData = {
  rpm: 0,
  coolantTemp: 0,
  intakeTemp: 0,
  speed: 0,
  throttle: 0,
  fuelPressure: 0,
  engineLoad: 0,
  voltage: 0,
  boostPressure: 0,
};

const PID_TO_KEY: Record<string, keyof ObdLiveData> = {
  "010C": "rpm",
  "010D": "speed",
  "0105": "coolantTemp",
  "0111": "throttle",
  "0104": "engineLoad",
  "010F": "intakeTemp",
  "010A": "fuelPressure",
  "010B": "boostPressure",
  "0142": "voltage",
};

const AUTO_KEY = "obd_auto_connect";
const DEVICE_KEY = "last_obd_device_id";

type ObdContextValue = {
  connected: boolean;
  connecting: boolean;
  device: BLEDeviceInfo | null;
  liveData: ObdLiveData;
  dtcs: ObdDtc[];
  logs: string[];
  connectionState: BLEConnectionState;
  connect: () => Promise<void>;
  connectToDevice: (deviceId: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  scan: () => Promise<BLEDeviceInfo[]>;
  clearDtcs: () => void;
  resetLive: () => void;
};

const ObdContext = createContext<ObdContextValue | null>(null);

export function ObdProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [device, setDevice] = useState<BLEDeviceInfo | null>(null);
  const [liveData, setLiveData] = useState<ObdLiveData>(EMPTY_LIVE);
  const [dtcs, setDtcs] = useState<ObdDtc[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<BLEConnectionState>("disconnected");

  const liveDataRef = useRef<ObdLiveData>(EMPTY_LIVE);
  const dtcsRef = useRef<ObdDtc[]>([]);
  const userIdRef = useRef<string | null>(null);
  const lastUpsertRef = useRef<number>(0);
  const pollIntervalRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { liveDataRef.current = liveData; }, [liveData]);
  useEffect(() => { dtcsRef.current = dtcs; }, [dtcs]);

  // Track auth user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      userIdRef.current = data.user?.id ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      userIdRef.current = s?.user?.id ?? null;
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // BLE state subscription
  useEffect(() => {
    const unsub = bleManager.subscribe((event) => {
      if (event.type === "stateChange") {
        const st = event.payload as BLEConnectionState;
        setConnectionState(st);
        setConnected(st === "connected");
        setConnecting(st === "scanning" || st === "connecting" || st === "reconnecting");
        if (st === "connected") {
          setDevice(bleManager.getConnectedDevice());
        }
        if (st === "disconnected" || st === "error") {
          setDevice(null);
        }
      }
      if (event.type === "debug") {
        setLogs((prev) => [...prev.slice(-199), String(event.payload)]);
      }
    });
    return unsub;
  }, []);

  // Safe upsert (UNIQUE user_id constraint now exists)
  const upsertSession = useCallback(async (payload: ObdLiveData, dtcList: ObdDtc[]) => {
    const now = Date.now();
    if (now - lastUpsertRef.current < 2000) return;
    lastUpsertRef.current = now;

    const uid = userIdRef.current;
    if (!uid) return;

    const { error } = await supabase.from("obd_live_sessions").upsert(
      {
        user_id: uid,
        is_active: true,
        last_seen: new Date().toISOString(),
        payload: payload as any,
        dtcs: dtcList as any,
      } as any,
      { onConflict: "user_id" },
    );

    if (error) {
      // Fallback: update-then-insert
      const { error: updErr } = await supabase
        .from("obd_live_sessions")
        .update({
          is_active: true,
          last_seen: new Date().toISOString(),
          payload: payload as any,
          dtcs: dtcList as any,
        } as any)
        .eq("user_id", uid);
      if (updErr) console.error("[OBD] session upsert error:", error, updErr);
    }
  }, []);

  const closeSession = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    await supabase
      .from("obd_live_sessions")
      .update({ is_active: false, last_seen: new Date().toISOString() } as any)
      .eq("user_id", uid);
  }, []);

  // Polling + heartbeat lifecycle tied to `connected`
  useEffect(() => {
    if (!connected) {
      if (pollIntervalRef.current) { window.clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (heartbeatIntervalRef.current) { window.clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
      return;
    }

    cancelledRef.current = false;

    const pollOnce = async () => {
      for (const pid of LIVE_PIDS) {
        if (cancelledRef.current) return;
        try {
          const raw = await elm327.sendCommand(pid);
          if (!raw || /NO\s*DATA|UNABLE|ERROR|STOPPED|\?/i.test(raw)) continue;
          let value = parsePIDResponse(pid, raw);
          if (value === null || Number.isNaN(value)) continue;

          const key = PID_TO_KEY[pid];
          if (!key) continue;
          if (pid === "010B") value = Math.max(0, (value - 101.3) / 100);

          setLiveData((prev) => {
            const next = { ...prev, [key]: value! };
            return next;
          });
        } catch {
          // skip
        }
      }
      // upsert after each full round
      upsertSession(liveDataRef.current, dtcsRef.current);
    };

    // Initial run
    pollOnce();
    pollIntervalRef.current = window.setInterval(pollOnce, 700);

    // Heartbeat every 5s regardless of poll cadence
    heartbeatIntervalRef.current = window.setInterval(() => {
      upsertSession(liveDataRef.current, dtcsRef.current);
    }, 5000);

    return () => {
      cancelledRef.current = true;
      if (pollIntervalRef.current) { window.clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (heartbeatIntervalRef.current) { window.clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
    };
  }, [connected, upsertSession]);

  // ---- Public API ----
  const scan = useCallback(async () => {
    return bleManager.scan();
  }, []);

  const connectToDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    const ok = await bleManager.connect(deviceId);
    if (ok) {
      localStorage.setItem(AUTO_KEY, "true");
      localStorage.setItem(DEVICE_KEY, deviceId);
      const d = bleManager.getConnectedDevice();
      setDevice(d);
      try { await elm327.initialize(); } catch {}
      await upsertSession(EMPTY_LIVE, []);
    }
    return ok;
  }, [upsertSession]);

  const connect = useCallback(async () => {
    if (connected || connecting) return;
    setConnecting(true);
    try {
      const devices = await bleManager.scan(10000);
      const best = devices[0];
      if (!best) throw new Error("Nenalezen žádný OBD adaptér.");
      await connectToDevice(best.deviceId);
    } finally {
      setConnecting(false);
    }
  }, [connected, connecting, connectToDevice]);

  const disconnect = useCallback(async () => {
    try {
      elm327.reset();
      await closeSession();
      await bleManager.disconnect();
    } catch (e) {
      console.warn("[OBD] disconnect warning", e);
    }
    localStorage.removeItem(AUTO_KEY);
    setLiveData(EMPTY_LIVE);
    setDtcs([]);
    setDevice(null);
  }, [closeSession]);

  const clearDtcs = useCallback(() => setDtcs([]), []);
  const resetLive = useCallback(() => setLiveData(EMPTY_LIVE), []);

  // Auto-connect at app start
  useEffect(() => {
    const auto = localStorage.getItem(AUTO_KEY) === "true";
    const savedId = localStorage.getItem(DEVICE_KEY);
    if (!auto || !savedId) return;
    if (connected || connecting) return;

    const timer = window.setTimeout(async () => {
      try {
        setConnecting(true);
        // Direct connect without a scan — faster & no picker
        const ok = await bleManager.connect(savedId);
        if (ok) {
          try { await elm327.initialize(); } catch {}
          setDevice(bleManager.getConnectedDevice());
          await upsertSession(EMPTY_LIVE, []);
        }
      } catch (e) {
        console.warn("[OBD] auto-connect failed", e);
      } finally {
        setConnecting(false);
      }
    }, 1500);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close session on window unload
  useEffect(() => {
    const handler = () => {
      const uid = userIdRef.current;
      if (!uid) return;
      // Fire-and-forget beacon-style update
      try {
        supabase
          .from("obd_live_sessions")
          .update({ is_active: false, last_seen: new Date().toISOString() } as any)
          .eq("user_id", uid);
      } catch {}
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const value: ObdContextValue = {
    connected,
    connecting,
    device,
    liveData,
    dtcs,
    logs,
    connectionState,
    connect,
    connectToDevice,
    disconnect,
    scan,
    clearDtcs,
    resetLive,
  };

  return <ObdContext.Provider value={value}>{children}</ObdContext.Provider>;
}

export function useObd(): ObdContextValue {
  const ctx = useContext(ObdContext);
  if (!ctx) throw new Error("useObd musí být uvnitř <ObdProvider>");
  return ctx;
}
