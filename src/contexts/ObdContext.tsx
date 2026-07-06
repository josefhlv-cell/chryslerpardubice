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
  type MutableRefObject,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { bleManager, BLEDeviceInfo, BLEConnectionState } from "@/lib/obd/ble-manager";
import { elm327 } from "@/lib/obd/elm327-engine";
import { dtcEngine, type DTCCode } from "@/lib/obd/dtc-engine";
import { parsePIDResponse } from "@/lib/obd/obd-pids";
import { FAST_PIDS, SLOW_PIDS } from "@/lib/obd/pid-speed-groups";
import { readDpfSnapshot, type DpfSnapshot } from "@/lib/obd/dpf-engine";
import {
  CHRYSLER_CUSTOM_PIDS,
  testChryslerCustomPid,
  type ChryslerCustomPidDefinition,
} from "@/lib/obd/chrysler-custom-pids";
import { readVinFromEcu, type DecodedVin } from "@/lib/obd/vin-decoder";
import { resolveProfileFromBrand, type VehiclePidProfile } from "@/lib/obd/pid-profile-registry";
import { isPidOnCooldown, markPidFailed, markPidSuccess, resetPidCache } from "@/lib/obd/unsupported-pid-cache";
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
  oilTemp: number;
  transmissionOilTemp: number;
  oilPressure: number;
  fuelLevel: number;
  fuelRate: number;
  maf: number;
  dpf?: DpfSnapshot;
};


/**
 * Časová razítka posledních úspěšně přečtených PIDů.
 * Chybějící klíč = data nejsou dostupná / vozidlo PID nepodporuje.
 * NIKDY nezobrazovat 0 jako reálnou hodnotu, pokud klíč chybí!
 */
export type ObdLiveAvailability = Partial<Record<keyof ObdLiveData, number>>;

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
  oilTemp: 0,
  transmissionOilTemp: 0,
  oilPressure: 0,
  fuelLevel: 0,
  fuelRate: 0,
  maf: 0,
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
  "015C": "oilTemp",
  "012F": "fuelLevel",
  "015E": "fuelRate",
  "0110": "maf",
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
  read_vin: "live_data",
  vin: "live_data",
  full_dtc_scan: "dtc_read",
  raw_uds: "uds",
  stellantis_session: "uds",
  stellantis_did: "uds",
  stellantis_basic: "uds",
  stellantis_basic_scan: "uds",
  stellantis_engine_live: "uds",
  stellantis_engine_scan: "uds",
  vehicle_info: "live_data",
  dtc_pending: "dtc_read",
  pending_dtc: "dtc_read",
  dtc_permanent: "dtc_read",
  permanent_dtc: "dtc_read",
  freeze_frame: "dtc_read",
};

const AUTO_KEY = "obd_auto_connect";
const DEVICE_KEY = "last_obd_device_id";

export type ObdVehicleInfo = {
  vin: DecodedVin | null;
  profile: VehiclePidProfile;
  loadedAt: number | null;
};

export type ObdContextValue = {
  connected: boolean;
  connecting: boolean;
  device: BLEDeviceInfo | null;
  liveData: ObdLiveData;
  liveAvailability: ObdLiveAvailability;
  dtcs: ObdDtc[];
  logs: string[];
  connectionState: BLEConnectionState;
  vehicleInfo: ObdVehicleInfo;
  connect: () => Promise<void>;
  connectToDevice: (deviceId: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  scan: () => Promise<BLEDeviceInfo[]>;
  readDtcs: () => Promise<ObdDtc[]>;
  clearDtcs: () => Promise<boolean>;
  refreshLiveData: () => Promise<ObdLiveData>;
  resetLive: () => void;
  sendCommand: (command: string) => Promise<string>;
  reloadVehicleInfo: () => Promise<ObdVehicleInfo>;
};

const ObdContext = createContext<ObdContextValue | null>(null);

export function ObdProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [device, setDevice] = useState<BLEDeviceInfo | null>(null);
  const [liveData, setLiveData] = useState<ObdLiveData>(EMPTY_LIVE);
  const [liveAvailability, setLiveAvailability] = useState<ObdLiveAvailability>({});
  const [dtcs, setDtcs] = useState<ObdDtc[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<BLEConnectionState>("disconnected");
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<ObdVehicleInfo>({
    vin: null,
    profile: resolveProfileFromBrand(),
    loadedAt: null,
  });
  const vehicleInfoRef = useRef<ObdVehicleInfo>({
    vin: null,
    profile: resolveProfileFromBrand(),
    loadedAt: null,
  });
  const customPidLoopIntervalRef = useRef<number | null>(null);
  const slowLoopIntervalRef = useRef<number | null>(null);

  const connectedRef = useRef(false);
  const liveDataRef = useRef<ObdLiveData>(EMPTY_LIVE);
  const liveAvailabilityRef = useRef<ObdLiveAvailability>({});
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

  /**
   * Custom Chrysler/Mopar PID cache:
   * null = ještě netestováno
   * false = nepodporováno a dál netestovat při každém cyklu
   * true + selected ref = funguje a čte se rovnou stejný PID
   */
  const transmissionOilTempSupportedRef = useRef<boolean | null>(null);
  const oilPressureSupportedRef = useRef<boolean | null>(null);
  const selectedTransmissionOilTempPidRef = useRef<ChryslerCustomPidDefinition | null>(null);
  const selectedOilPressurePidRef = useRef<ChryslerCustomPidDefinition | null>(null);

  useEffect(() => { connectedRef.current = connected; }, [connected]);
  useEffect(() => { liveDataRef.current = liveData; }, [liveData]);
  useEffect(() => { liveAvailabilityRef.current = liveAvailability; }, [liveAvailability]);
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

          transmissionOilTempSupportedRef.current = null;
          oilPressureSupportedRef.current = null;
          selectedTransmissionOilTempPidRef.current = null;
          selectedOilPressurePidRef.current = null;
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

    const vinfo = vehicleInfoRef.current;
    const enrichedPayload = {
      ...(payload as any),
      vehicleProfile: vinfo.vin
        ? {
            vin: vinfo.vin.vin,
            brand: vinfo.vin.brand,
            year: vinfo.vin.year,
            protocolGroup: vinfo.vin.protocolGroup,
            profileId: vinfo.profile.id,
            profileLabel: vinfo.profile.label,
            confidence: vinfo.vin.confidence,
            source: vinfo.vin.source,
          }
        : { profileId: vinfo.profile.id, profileLabel: vinfo.profile.label },
    };

    const session = {
      user_id: uid,
      is_active: true,
      last_seen: new Date().toISOString(),
      ended_at: null,
      payload: enrichedPayload as any,
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

  const readSelectedCustomPid = useCallback(async (
    selectedRef: MutableRefObject<ChryslerCustomPidDefinition | null>,
    supportedRef: MutableRefObject<boolean | null>,
    key: "transmissionOilTemp" | "oilPressure",
  ): Promise<number | null> => {
    if (supportedRef.current === false) return null;

    if (selectedRef.current) {
      const result = await testChryslerCustomPid(selectedRef.current);
      if (result.supported && result.value !== null) {
        supportedRef.current = true;
        return result.value;
      }

      supportedRef.current = false;
      selectedRef.current = null;
      return null;
    }

    const candidates = CHRYSLER_CUSTOM_PIDS.filter((pid) => pid.key === key);

    for (const candidate of candidates) {
      if (cancelledRef.current) break;

      const result = await testChryslerCustomPid(candidate);

      if (result.supported && result.value !== null) {
        selectedRef.current = candidate;
        supportedRef.current = true;
        addLog(`[OBD CUSTOM PID] ${candidate.label}: ${result.value}${result.unit} (${candidate.header}/${candidate.command})`);
        return result.value;
      }
    }

    supportedRef.current = false;
    addLog(`[OBD CUSTOM PID] ${key}: Nepodporováno`);
    return null;
  }, [addLog]);

  const readChryslerCustomLiveValues = useCallback(async (): Promise<{
    transmissionOilTemp: number | null;
    oilPressure: number | null;
    availability: ObdLiveAvailability;
  }> => {
    const availability: ObdLiveAvailability = {};
    let transmissionOilTemp: number | null = null;
    let oilPressure: number | null = null;

    try {
      transmissionOilTemp = await readSelectedCustomPid(
        selectedTransmissionOilTempPidRef,
        transmissionOilTempSupportedRef,
        "transmissionOilTemp",
      );

      if (transmissionOilTemp !== null) {
        availability.transmissionOilTemp = Date.now();
      }
    } catch (e) {
      console.warn("[OBD CUSTOM PID] transmissionOilTemp failed", e);
    }

    try {
      oilPressure = await readSelectedCustomPid(
        selectedOilPressurePidRef,
        oilPressureSupportedRef,
        "oilPressure",
      );

      if (oilPressure !== null) {
        availability.oilPressure = Date.now();
      }
    } catch (e) {
      console.warn("[OBD CUSTOM PID] oilPressure failed", e);
    }

    return {
      transmissionOilTemp,
      oilPressure,
      availability,
    };
  }, [readSelectedCustomPid]);

  /**
   * Přečte jednu skupinu PIDů (fast/slow) postupně, ale s okamžitou UI aktualizací
   * po každém přečteném PIDu, aby UI nečekalo na dokončení celé skupiny.
   * Nepodporované PIDy jsou v cooldown cache a přeskakují se.
   */
  const pollPidGroup = useCallback(async (
    pids: readonly string[],
    priority: "high" | "normal" | "low",
  ) => {
    for (const pid of pids) {
      if (cancelledRef.current) break;
      if (isPidOnCooldown(pid)) continue;
      try {
        const raw = await elm327.sendCommand(pid, priority);
        if (!raw || /NO\s*DATA|UNABLE|ERROR|STOPPED|\?/i.test(raw)) {
          markPidFailed(pid);
          continue;
        }
        let value = parsePIDResponse(pid, raw);
        if (value === null || Number.isNaN(value)) {
          markPidFailed(pid);
          continue;
        }
        const key = PID_TO_KEY[pid];
        if (!key) continue;
        if (pid === "010B") value = Math.max(0, (value - 101.3) / 100);

        markPidSuccess(pid);
        const nextData = { ...liveDataRef.current, [key]: value };
        liveDataRef.current = nextData;
        setLiveData(nextData);

        const nextAvail = { ...liveAvailabilityRef.current, [key]: Date.now() };
        liveAvailabilityRef.current = nextAvail;
        setLiveAvailability(nextAvail);
      } catch {
        markPidFailed(pid);
      }
    }
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
      // FAST skupina – přednostně, high priority
      await pollPidGroup(FAST_PIDS, "high");
      if (cancelledRef.current) return liveDataRef.current;

      // SLOW skupina jen při forceUpsert (heartbeat/ruční refresh) – jinak ji řeší samostatný slow loop
      if (forceUpsert) {
        await pollPidGroup(SLOW_PIDS, "low");
      }

      // DPF/custom NIKDY v tomto rychlém cyklu, aby to nezdržovalo FAST PIDy.
      await upsertSession(liveDataRef.current, dtcsRef.current, forceUpsert);
      return liveDataRef.current;
    } finally {
      isPollingRef.current = false;
    }
  }, [readChryslerCustomLiveValues, upsertSession]);

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
        case "dpf":
        case "dpf_status":
        case "dpf_regen": {
          if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
          const dpf = await readDpfSnapshot();
          const next = { ...liveDataRef.current, dpf };
          setLiveData(next);
          liveDataRef.current = next;
          await upsertSession(next, dtcsRef.current, true);
          if (!dpf.supported) {
            result = { dpf, note: "DPF PIDy nejsou pro toto vozidlo dostupné." };
          } else {
            result = { dpf };
          }
          break;
        }
        case "read_vin":
        case "vin":
        case "vehicle_info": {
          if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
          const info = await reloadVehicleInfo();
          result = info.vin
            ? {
                vin: info.vin.vin,
                brand: info.vin.brand,
                year: info.vin.year,
                profile: info.profile.id,
                profileLabel: info.profile.label,
                confidence: info.vin.confidence,
              }
            : {
                vin: null,
                profile: info.profile.id,
                profileLabel: info.profile.label,
                note: "VIN se nepodařilo načíst přes OBD (0902). Základní diagnostika běží.",
              };
          break;
        }
        case "dtc_pending":
        case "pending_dtc": {
          if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
          const codes = await dtcEngine.scanPendingDTCs();
          result = { codes, count: codes.length, mode: "07" };
          break;
        }
        case "dtc_permanent":
        case "permanent_dtc": {
          if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
          const codes = await dtcEngine.scanPermanentDTCs();
          result = { codes, count: codes.length, mode: "0A" };
          break;
        }
        case "freeze_frame": {
          if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
          const ff = await dtcEngine.readFreezeFrame();
          result = ff.supported
            ? { freezeFrame: ff.decoded, raw: ff.raw }
            : { freezeFrame: null, note: "Freeze Frame není pro toto vozidlo dostupný." };
          break;
        }
        case "full_dtc_scan": {
          if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
          const mod = await import("@/lib/obd/services/full-dtc-scan");
          const scan = await mod.runFullDtcScan();
          result = { scan };
          break;
        }
        case "raw_uds": {
          if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
          const rawCmd = String(command.command_payload?.command || "").trim();
          if (!rawCmd) throw new Error("Chybí command_payload.command (hex bajty).");
          const [{ elmQueue }, { parseUds }, { cleanElmResponse }] = await Promise.all([
            import("@/lib/obd/adapter/elm-queue"),
            import("@/lib/obd/protocol/uds-parser"),
            import("@/lib/obd/protocol/response-cleaner"),
          ]);
          const bytes = rawCmd.replace(/\s+/g, "").match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) || [];
          if (bytes.length === 0) throw new Error("Neplatný hex příkaz.");
          const timeoutMs = Number(command.command_payload?.timeoutMs) || 5000;
          const res = await elmQueue.send(rawCmd, { timeoutMs });
          const cleaned = cleanElmResponse(res.raw, rawCmd);
          const uds = parseUds(res.raw, bytes[0], bytes.slice(1));
          result = {
            command: rawCmd,
            raw: res.raw,
            cleaned,
            status: uds.status,
            payload: uds.payload.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" "),
            positiveMarker: uds.positiveMarker,
            warnings: uds.warnings,
          };
          break;
        }
        case "stellantis_session": {
          if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
          const { startExtendedSession } = await import("@/lib/obd/oem/stellantis");
          const session = await startExtendedSession();
          result = { session };
          break;
        }
        case "stellantis_did": {
          if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
          const did = String(command.command_payload?.did || "").replace(/\s+/g, "").toUpperCase();
          if (!/^[0-9A-F]{4}$/.test(did)) throw new Error("Neplatný DID (očekává se 4-hex, např. F190).");
          const { readStellantisDid } = await import("@/lib/obd/oem/stellantis");
          const label = String(command.command_payload?.label || did);
          const cmd = `22 ${did.substring(0, 2)} ${did.substring(2, 4)}`;
          const didRes = await readStellantisDid({ did, cmd, label, category: "basic" });
          result = { did: didRes };
          break;
        }
        case "stellantis_basic":
        case "stellantis_basic_scan": {
          if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
          const { stellantisProfile } = await import("@/lib/obd/oem/stellantis");
          const scan = await stellantisProfile.scanBasicInfo();
          result = { scan };
          break;
        }
        case "stellantis_engine_live":
        case "stellantis_engine_scan": {
          if (!connectedRef.current) throw new Error("OBD adaptér není připojen.");
          const { stellantisProfile } = await import("@/lib/obd/oem/stellantis");
          const scan = await stellantisProfile.scanEngineLive();
          result = { scan };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog, clearDtcs, pollLiveDataOnce, readDtcs, sendCommand, updateRemoteCommand, upsertSession]);

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

  const reloadVehicleInfo = useCallback(async (): Promise<ObdVehicleInfo> => {
    if (!connectedRef.current) return vehicleInfoRef.current;
    const vin = await readVinFromEcu();
    const profile = resolveProfileFromBrand(vin?.brand, vin?.protocolGroup);
    const next: ObdVehicleInfo = { vin, profile, loadedAt: Date.now() };
    vehicleInfoRef.current = next;
    setVehicleInfo(next);
    console.log("[VEHICLE RESOLVER] profile=", profile.id, "brand=", vin?.brand);

    // Načíst případný funkční PID z cache
    const uid = userIdRef.current;
    if (uid && vin?.vin) {
      try {
        const { data } = await supabase
          .from("obd_pid_cache" as any)
          .select("*")
          .eq("user_id", uid)
          .eq("vin", vin.vin)
          .eq("key", "transmissionOilTemp")
          .maybeSingle();
        if (data) {
          const candidate = CHRYSLER_CUSTOM_PIDS.find(
            (p) => p.header === (data as any).header && p.command === (data as any).command,
          );
          if (candidate) {
            selectedTransmissionOilTempPidRef.current = candidate;
            transmissionOilTempSupportedRef.current = true;
            console.log("[PID CACHE] restored", candidate.label);
          }
        }
      } catch (e) {
        console.warn("[PID CACHE] load failed", e);
      }
    }

    return next;
  }, []);

  useEffect(() => {
    if (!connected) {
      cancelledRef.current = true;
      if (pollIntervalRef.current) { window.clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (heartbeatIntervalRef.current) { window.clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
      if (slowLoopIntervalRef.current) { window.clearInterval(slowLoopIntervalRef.current); slowLoopIntervalRef.current = null; }
      if (customPidLoopIntervalRef.current) { window.clearInterval(customPidLoopIntervalRef.current); customPidLoopIntervalRef.current = null; }
      return;
    }

    cancelledRef.current = false;

    // Načíst VIN / profil hned po připojení (jen jednou)
    reloadVehicleInfo().catch(() => undefined);

    // FAST loop – RPM/rychlost/plyn/MAP/MAF/load: často
    pollLiveDataOnce(false).catch(() => undefined);
    pollIntervalRef.current = window.setInterval(() => {
      if (!isPollingRef.current) pollLiveDataOnce(false).catch(() => undefined);
    }, 600);

    // SLOW loop – teploty/napětí/palivo: pomalu
    slowLoopIntervalRef.current = window.setInterval(() => {
      if (isPollingRef.current) return;
      pollPidGroup(SLOW_PIDS, "low").catch(() => undefined);
    }, 4000);

    // CUSTOM loop – Chrysler transmission oil temp: jen když profil povolí
    customPidLoopIntervalRef.current = window.setInterval(() => {
      const prof = vehicleInfoRef.current.profile;
      if (!prof.allowChryslerCustomPids) return;
      if (isPollingRef.current) return;
      readChryslerCustomLiveValues().then((custom) => {
        const updates: Partial<ObdLiveData> = {};
        const avail: ObdLiveAvailability = { ...liveAvailabilityRef.current };
        if (custom.transmissionOilTemp !== null) {
          updates.transmissionOilTemp = custom.transmissionOilTemp;
          avail.transmissionOilTemp = Date.now();
        }
        if (custom.oilPressure !== null) {
          updates.oilPressure = custom.oilPressure;
          avail.oilPressure = Date.now();
        }
        if (Object.keys(updates).length) {
          const merged = { ...liveDataRef.current, ...updates };
          liveDataRef.current = merged;
          setLiveData(merged);
          liveAvailabilityRef.current = avail;
          setLiveAvailability(avail);

          // Uložit funkční PID do cache (jen při první úspěšné hodnotě)
          const vin = vehicleInfoRef.current.vin?.vin;
          const uid = userIdRef.current;
          const selected = selectedTransmissionOilTempPidRef.current;
          if (vin && uid && selected && custom.transmissionOilTemp !== null) {
            supabase.from("obd_pid_cache" as any).upsert({
              user_id: uid,
              vin,
              vehicle_profile: vehicleInfoRef.current.profile.id,
              key: "transmissionOilTemp",
              header: selected.header,
              command: selected.command,
              response_prefix: selected.responsePrefix,
              unit: selected.unit,
              last_valid_value: custom.transmissionOilTemp,
              confidence: "high",
              source: "obd_discovery",
            } as any, { onConflict: "user_id,vin,key" as any }).then(() => undefined);
          }
        }
      }).catch(() => undefined);
    }, 10000);

    heartbeatIntervalRef.current = window.setInterval(() => {
      upsertSession(liveDataRef.current, dtcsRef.current, true);
    }, 5000);

    return () => {
      cancelledRef.current = true;
      if (pollIntervalRef.current) { window.clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (heartbeatIntervalRef.current) { window.clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
      if (slowLoopIntervalRef.current) { window.clearInterval(slowLoopIntervalRef.current); slowLoopIntervalRef.current = null; }
      if (customPidLoopIntervalRef.current) { window.clearInterval(customPidLoopIntervalRef.current); customPidLoopIntervalRef.current = null; }
    };
  }, [connected, pollLiveDataOnce, upsertSession, pollPidGroup, readChryslerCustomLiveValues, reloadVehicleInfo]);

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

    transmissionOilTempSupportedRef.current = null;
    oilPressureSupportedRef.current = null;
    selectedTransmissionOilTempPidRef.current = null;
    selectedOilPressurePidRef.current = null;

    localStorage.removeItem(AUTO_KEY);
    setLiveData(EMPTY_LIVE);
    liveDataRef.current = EMPTY_LIVE;
    setLiveAvailability({});
    liveAvailabilityRef.current = {};
    setDtcs([]);
    dtcsRef.current = [];
    setDevice(null);
    resetPidCache();
    const emptyInfo: ObdVehicleInfo = { vin: null, profile: resolveProfileFromBrand(), loadedAt: null };
    vehicleInfoRef.current = emptyInfo;
    setVehicleInfo(emptyInfo);
  }, [closeSession]);

  const resetLive = useCallback(() => {
    transmissionOilTempSupportedRef.current = null;
    oilPressureSupportedRef.current = null;
    selectedTransmissionOilTempPidRef.current = null;
    selectedOilPressurePidRef.current = null;

    setLiveData(EMPTY_LIVE);
    liveDataRef.current = EMPTY_LIVE;
    setLiveAvailability({});
    liveAvailabilityRef.current = {};
  }, []);

  // Auto-connect (jen když má zákazník OBD povolené od admina, nebo je admin)
  useEffect(() => {
    if (!authUserId) return;
    const auto = localStorage.getItem(AUTO_KEY) === "true";
    const savedId = localStorage.getItem(DEVICE_KEY);
    if (!auto || !savedId) return;
    if (connectedRef.current) return;

    const timer = window.setTimeout(async () => {
      // Ověření oprávnění – musí být admin nebo mít alespoň live_data
      const p = permissionsRef.current;
      const allowed = isAdminRef.current || p.live_data || p.dtc_read || p.dpf;
      if (!allowed) {
        console.info("[OBD] auto-connect přeskočen: chybí oprávnění.");
        return;
      }
      if (connectedRef.current) return;

      try {
        setConnecting(true);
        const ok = await bleManager.connect(savedId);
        if (ok) {
          try { await elm327.initialize(); } catch {}
          setDevice(bleManager.getConnectedDevice());
          await upsertSession(EMPTY_LIVE, [], true);
        } else {
          console.info("[OBD] Poslední adaptér není dostupný – vyžadováno ruční připojení.");
        }
      } catch (e) {
        console.warn("[OBD] auto-connect failed", e);
      } finally {
        setConnecting(false);
      }
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [authUserId, upsertSession]);


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
    liveAvailability,
    dtcs,
    logs,
    connectionState,
    vehicleInfo,
    connect,
    connectToDevice,
    disconnect,
    scan,
    readDtcs,
    clearDtcs,
    refreshLiveData: () => pollLiveDataOnce(true),
    resetLive,
    sendCommand,
    reloadVehicleInfo,
  };

  return <ObdContext.Provider value={value}>{children}</ObdContext.Provider>;
}

export function useObd(): ObdContextValue {
  const ctx = useContext(ObdContext);
  if (!ctx) throw new Error("useObd musí být uvnitř <ObdProvider>");
  return ctx;
}