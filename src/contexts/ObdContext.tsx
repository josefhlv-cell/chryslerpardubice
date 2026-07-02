/**
 * Globální OBD context.
 * BLE spojení, heartbeat, live data, DTC a vzdálené příkazy běží mimo konkrétní stránku.
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
import { dtcEngine, type DTCCode } from "@/lib/obd/dtc-engine";
import { LIVE_PIDS, parsePIDResponse } from "@/lib/obd/obd-pids";
import { readDpfSnapshot, type DpfSnapshot } from "@/lib/obd/dpf-engine";
import { DEFAULT_OBD_PERMISSIONS, FULL_OBD_PERMISSIONS, type ObdPermissions } from "@/hooks/obd/use-obd-permissions";

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
  dpf?: DpfSnapshot;
};

export type ObdDtc = DTCCode;

type RemoteCommandStatus = "pending" | "running" | "done" | "error";

type RemoteCommand = {
  id: string;
  user_id: string;
  command_type: string;
  command_payload: Record<string, unknown> | null;
  status: RemoteCommandStatus;
  created_at: string;
  created_by: string | null;
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

const COMMAND_PERMISSION: Record<string, keyof ObdPermissions> = {
  read_dtc: "dtc_read",
  dtc_read: "dtc_read",
  clear_dtc: "dtc_clear",
  dtc_clear: "dtc_clear",
  refresh_live: "live_data",
  live_refresh: "live_data",
  custom_command: "terminal",
  terminal: "terminal",
  can_bus: "can_bus",
  uds: "uds",
  coding: "coding",
  logging: "logging",
  reverse_engineering: "reverse_engineering",
  discovery: "discovery",
  ai_diagnostics: "ai_diagnostics",
  dev_mode: "dev_mode",
  flash: "flash",
  dpf: "dpf",
  dpf_status: "dpf",
  dpf_regen: "dpf",
};

const AUTO_KEY = "obd_auto_connect";
const DEVICE_KEY = "last_obd_device_id";

export type ObdContextValue = {
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
  readDtcs: () => Promise<ObdDtc[]>;
  clearDtcs: () => Promise<boolean>;
  refreshLiveData: () => Promise<ObdLiveData>;
  resetLive: () => void;
  sendCommand: (command: string) => Promise<string>;
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
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const connectedRef = useRef(false);
  const liveDataRef = useRef<ObdLiveData>(EMPTY_LIVE);
  const dtcsRef = useRef<ObdDtc[]>([]);
  const permissionsRef = useRef<ObdPermissions>(DEFAULT_OBD_PERMISSIONS);
  const isAdminRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const lastUpsertRef = useRef<number>(0);
  const pollIntervalRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const remoteIntervalRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const isPollingRef = useRef(false);
  const isCheckingRemoteCommandsRef = useRef(false);
  const processingCommandIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => { connectedRef.current = connected; }, [connected]);
  useEffect(() => { liveDataRef.current = liveData; }, [liveData]);
  useEffect(() => { dtcsRef.current = dtcs; }, [dtcs]);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [...prev.slice(-199), `${new Date().toLocaleTimeString()} ${message}`]);
  }, []);

  const loadPermissions = useCallback(async (uid: string) => {
    const [{ data: adminCheck }, { data: perm, error }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: uid, _role: "admin" }),
      supabase.from("obd_permissions").select("*").eq("user_id", uid).maybeSingle(),
    ]);

    const admin = !!adminCheck;
    isAdminRef.current = admin;
    if (admin) {
      permissionsRef.current = FULL_OBD_PERMISSIONS;
      return;
    }

    if (error) console.warn("[OBD] permissions load", error);
    permissionsRef.current = perm ? {
      live_data: perm.live_data ?? true,
      dtc_read: perm.dtc_read ?? true,
      dtc_clear: perm.dtc_clear ?? false,
      dpf: (perm as any).dpf ?? false,
      can_bus: perm.can_bus ?? false,
      uds: perm.uds ?? false,
      coding: perm.coding ?? false,
      terminal: perm.terminal ?? false,
      logging: perm.logging ?? true,
      reverse_engineering: perm.reverse_engineering ?? false,
      discovery: perm.discovery ?? false,
      ai_diagnostics: perm.ai_diagnostics ?? true,
      dev_mode: perm.dev_mode ?? false,
      flash: perm.flash ?? false,
    } : DEFAULT_OBD_PERMISSIONS;
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      userIdRef.current = uid;
      setAuthUserId(uid);
      if (uid) loadPermissions(uid);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      const uid = s?.user?.id ?? null;
      userIdRef.current = uid;
      setAuthUserId(uid);
      if (uid) loadPermissions(uid);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadPermissions]);

  useEffect(() => {
    if (!authUserId) return;

    const channel = supabase
      .channel(`obd-permissions-${authUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "obd_permissions", filter: `user_id=eq.${authUserId}` },
        () => loadPermissions(authUserId),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authUserId, loadPermissions]);

  useEffect(() => {
    const unsub = bleManager.subscribe((event) => {
      if (event.type === "stateChange") {
        const st = event.payload as BLEConnectionState;
        setConnectionState(st);
        setConnected(st === "connected");
        setConnecting(st === "scanning" || st === "connecting" || st === "reconnecting");
        if (st === "connected") {
          setDevice(bleManager.getConnectedDevice());
          elm327.initialize().catch((e) => console.warn("[OBD] ELM init after reconnect", e));
        }
        if (st === "disconnected" || st === "error") {
          elm327.reset();
          setDevice(null);
        }
      }
      if (event.type === "debug") addLog(String(event.payload));
    });
    return unsub;
  }, [addLog]);

  const upsertSession = useCallback(async (payload: ObdLiveData, dtcList: ObdDtc[], force = false) => {
    const now = Date.now();
    if (!force && now - lastUpsertRef.current < 2000) return;
    lastUpsertRef.current = now;

    const uid = userIdRef.current;
    if (!uid) return;

    const session = {
      user_id: uid,
      is_active: true,
      last_seen: new Date().toISOString(),
      ended_at: null,
      payload: payload as any,
      dtcs: dtcList as any,
    };

    const { error } = await supabase.from("obd_live_sessions").upsert(session as any, { onConflict: "user_id" });
    if (!error) return;

    const { error: updErr } = await supabase
      .from("obd_live_sessions")
      .update({ ...session, user_id: undefined } as any)
      .eq("user_id", uid);
    if (updErr) console.error("[OBD] session upsert error:", error, updErr);
  }, []);

  const closeSession = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    await supabase
      .from("obd_live_sessions")
      .update({ is_active: false, last_seen: new Date().toISOString(), ended_at: new Date().toISOString() } as any)
      .eq("user_id", uid);
  }, []);

  const pollLiveDataOnce = useCallback(async (forceUpsert = false): Promise<ObdLiveData> => {
    if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
    if (isPollingRef.current) {
      await upsertSession(liveDataRef.current, dtcsRef.current, forceUpsert);
      return liveDataRef.current;
    }
    if (!isAdminRef.current && !permissionsRef.current.live_data) {
      await upsertSession(liveDataRef.current, dtcsRef.current, forceUpsert);
      return liveDataRef.current;
    }

    isPollingRef.current = true;
    try {
      let next: ObdLiveData = { ...liveDataRef.current };
      for (const pid of LIVE_PIDS) {
        if (cancelledRef.current) break;
        try {
          const raw = await elm327.sendCommand(pid, "low");
          if (!raw || /NO\s*DATA|UNABLE|ERROR|STOPPED|\?/i.test(raw)) continue;
          let value = parsePIDResponse(pid, raw);
          if (value === null || Number.isNaN(value)) continue;

          const key = PID_TO_KEY[pid];
          if (!key) continue;
          if (pid === "010B") value = Math.max(0, (value - 101.3) / 100);
          next = { ...next, [key]: value };
        } catch {
          // PID failures are normal on many adapters; keep the previous value.
        }
      }

      setLiveData(next);
      liveDataRef.current = next;
      await upsertSession(next, dtcsRef.current, forceUpsert);
      return next;
    } finally {
      isPollingRef.current = false;
    }
  }, [upsertSession]);

  const readDtcs = useCallback(async (): Promise<ObdDtc[]> => {
    if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
    if (!isAdminRef.current && !permissionsRef.current.dtc_read) throw new Error("Čtení DTC není povoleno.");

    const codes = await dtcEngine.scanDTCs();
    setDtcs(codes);
    dtcsRef.current = codes;
    await upsertSession(liveDataRef.current, codes, true);
    return codes;
  }, [upsertSession]);

  const clearDtcs = useCallback(async (): Promise<boolean> => {
    if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
    if (!isAdminRef.current && !permissionsRef.current.dtc_clear) throw new Error("Mazání DTC není povoleno.");

    const ok = await dtcEngine.clearDTCs();
    if (ok) {
      setDtcs([]);
      dtcsRef.current = [];
      await upsertSession(liveDataRef.current, [], true);
    }
    return ok;
  }, [upsertSession]);

  const sendCommand = useCallback(async (command: string) => {
    if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
    if (!isAdminRef.current && !permissionsRef.current.terminal) throw new Error("Terminál není povolen.");
    return elm327.sendCommand(command, "high");
  }, []);

  const updateRemoteCommand = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("obd_remote_commands").update(patch as any).eq("id", id);
    if (error) console.error("[OBD] remote command update", error);
  }, []);

  const executeRemoteCommand = useCallback(async (command: RemoteCommand) => {
    if (processingCommandIdsRef.current.has(command.id)) return;
    processingCommandIdsRef.current.add(command.id);

    try {
      const { data: claimed, error: claimError } = await supabase
        .from("obd_remote_commands")
        .update({ status: "running", updated_at: new Date().toISOString() } as any)
        .eq("id", command.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (claimError || !claimed) return;

      const type = command.command_type;
      const permissionKey = COMMAND_PERMISSION[type] || COMMAND_PERMISSION[(type || "").toLowerCase()];
      if (permissionKey && !isAdminRef.current && !permissionsRef.current[permissionKey]) {
        throw new Error(`Příkaz ${type} není pro zákazníka povolen.`);
      }

      let result: Record<string, unknown>;
      switch (type) {
        case "read_dtc":
        case "dtc_read": {
          const codes = await readDtcs();
          result = { codes, count: codes.length };
          break;
        }
        case "clear_dtc":
        case "dtc_clear": {
          const ok = await clearDtcs();
          result = { cleared: ok };
          break;
        }
        case "refresh_live":
        case "live_refresh": {
          const data = await pollLiveDataOnce(true);
          result = { liveData: data };
          break;
        }
        case "custom_command":
        case "terminal": {
          const rawCommand = String(command.command_payload?.command || "").trim();
          if (!rawCommand) throw new Error("Chybí command_payload.command.");
          const response = await sendCommand(rawCommand);
          result = { command: rawCommand, response };
          break;
        }
        default:
          throw new Error(`Nepodporovaný vzdálený příkaz: ${type}`);
      }

      await updateRemoteCommand(command.id, {
        status: "done",
        result: result as any,
        error: null,
        executed_at: new Date().toISOString(),
      });
      addLog(`[REMOTE] ${type} done`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await updateRemoteCommand(command.id, {
        status: "error",
        error: message,
        executed_at: new Date().toISOString(),
      });
      addLog(`[REMOTE] ${command.command_type} error: ${message}`);
    } finally {
      processingCommandIdsRef.current.delete(command.id);
    }
  }, [addLog, clearDtcs, pollLiveDataOnce, readDtcs, sendCommand, updateRemoteCommand]);

  const checkRemoteCommands = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (isCheckingRemoteCommandsRef.current) return;
    isCheckingRemoteCommandsRef.current = true;

    try {
      const { data, error } = await supabase
        .from("obd_remote_commands")
        .select("id,user_id,command_type,command_payload,status,created_at,created_by")
        .eq("user_id", uid)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(5);

      if (error) {
        console.warn("[OBD] remote command fetch", error);
        return;
      }

      for (const cmd of (data || []) as RemoteCommand[]) {
        executeRemoteCommand(cmd);
      }
    } finally {
      isCheckingRemoteCommandsRef.current = false;
    }
  }, [executeRemoteCommand]);

  useEffect(() => {
    if (!connected) {
      cancelledRef.current = true;
      if (pollIntervalRef.current) { window.clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (heartbeatIntervalRef.current) { window.clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
      return;
    }

    cancelledRef.current = false;
    pollLiveDataOnce(true).catch(() => undefined);
    pollIntervalRef.current = window.setInterval(() => {
      pollLiveDataOnce(false).catch(() => undefined);
    }, 1500);

    heartbeatIntervalRef.current = window.setInterval(() => {
      upsertSession(liveDataRef.current, dtcsRef.current, true);
    }, 5000);

    return () => {
      cancelledRef.current = true;
      if (pollIntervalRef.current) { window.clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (heartbeatIntervalRef.current) { window.clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
    };
  }, [connected, pollLiveDataOnce, upsertSession]);

  useEffect(() => {
    if (!authUserId) return;

    checkRemoteCommands();
    remoteIntervalRef.current = window.setInterval(checkRemoteCommands, 2000);

    const channel = supabase
      .channel(`obd-remote-commands-${authUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "obd_remote_commands", filter: `user_id=eq.${authUserId}` },
        (payload) => {
          const cmd = payload.new as RemoteCommand;
          if (cmd.status === "pending") executeRemoteCommand(cmd);
        },
      )
      .subscribe();

    return () => {
      if (remoteIntervalRef.current) { window.clearInterval(remoteIntervalRef.current); remoteIntervalRef.current = null; }
      supabase.removeChannel(channel);
    };
  }, [authUserId, checkRemoteCommands, executeRemoteCommand]);

  const scan = useCallback(async () => bleManager.scan(), []);

  const connectToDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    const ok = await bleManager.connect(deviceId);
    if (ok) {
      localStorage.setItem(AUTO_KEY, "true");
      localStorage.setItem(DEVICE_KEY, deviceId);
      setDevice(bleManager.getConnectedDevice());
      try { await elm327.initialize(); } catch {}
      await upsertSession(EMPTY_LIVE, [], true);
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
    liveDataRef.current = EMPTY_LIVE;
    setDtcs([]);
    dtcsRef.current = [];
    setDevice(null);
  }, [closeSession]);

  const resetLive = useCallback(() => {
    setLiveData(EMPTY_LIVE);
    liveDataRef.current = EMPTY_LIVE;
  }, []);

  useEffect(() => {
    const auto = localStorage.getItem(AUTO_KEY) === "true";
    const savedId = localStorage.getItem(DEVICE_KEY);
    if (!auto || !savedId) return;
    if (connectedRef.current) return;

    const timer = window.setTimeout(async () => {
      try {
        setConnecting(true);
        const ok = await bleManager.connect(savedId);
        if (ok) {
          try { await elm327.initialize(); } catch {}
          setDevice(bleManager.getConnectedDevice());
          await upsertSession(EMPTY_LIVE, [], true);
        }
      } catch (e) {
        console.warn("[OBD] auto-connect failed", e);
      } finally {
        setConnecting(false);
      }
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [upsertSession]);

  useEffect(() => {
    const handler = () => {
      const uid = userIdRef.current;
      if (!uid) return;
      try {
        supabase
          .from("obd_live_sessions")
          .update({ is_active: false, last_seen: new Date().toISOString(), ended_at: new Date().toISOString() } as any)
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
    readDtcs,
    clearDtcs,
    refreshLiveData: () => pollLiveDataOnce(true),
    resetLive,
    sendCommand,
  };

  return <ObdContext.Provider value={value}>{children}</ObdContext.Provider>;
}

export function useObd(): ObdContextValue {
  const ctx = useContext(ObdContext);
  if (!ctx) throw new Error("useObd musí být uvnitř <ObdProvider>");
  return ctx;
}