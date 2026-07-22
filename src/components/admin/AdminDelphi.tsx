import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Bluetooth,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleX,
  ClipboardList,
  Cpu,
  Eraser,
  Gauge,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  User,
  Wifi,
  WifiOff,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { bleManager } from "@/lib/obd/ble-manager";
import { elmQueue } from "@/lib/obd/adapter/elm-queue";
import { applyElmProfile } from "@/lib/obd/adapter/elm-init";
import { resolveDTCInfo } from "@/lib/obd/dtc-engine";
import { LiveDataPanel } from "@/components/admin/delphi/LiveDataPanel";
import { Download } from "lucide-react";
import {
  findBrandForVin,
  listBrands,
  loadBrandFunctions,
  cleanResponse,
  decodeDtcs,
  decodeValue,
  loadUdsNrcCatalog,
  runDiagFunction,
  runRawCommand,
  uniqueSorted,
  VEHICLE_PROFILES,
} from "@/lib/delphi";
import type {
  ActiveDiagContext,
  BrandManifestEntry,
  DiagFunction,
  DiagRunResult,
  VehicleProfile,
} from "@/lib/delphi";

type EcuOption = { address: string; name: string; common?: string };

type RemoteSession = {
  id: string;
  user_id: string;
  vin: string | null;
  last_seen: string;
  is_active: boolean;
  profile_name: string;
  profile_email: string;
  permissions?: {
    live_data?: boolean;
    dtc_read?: boolean;
    dtc_clear?: boolean;
    terminal?: boolean;
    can_bus?: boolean;
    uds?: boolean;
    coding?: boolean;
    flash?: boolean;
  };
};

type RemoteCommandRow = {
  id: string;
  status: string;
  result: unknown;
  error: string | null;
};

type PanelKey =
  | "dtc"
  | "live"
  | "actuators"
  | "service"
  | "ecuInfo";

type EcuScanResult = {
  ecu: EcuOption;
  stored: DiagRunResult | null;
  pending: DiagRunResult | null;
  permanent: DiagRunResult | null;
  clear?: DiagRunResult | null;
};

const panelTitles: Record<PanelKey, string> = {
  dtc: "Diagnostika závad",
  live: "Živá data",
  actuators: "Testy akčních členů",
  service: "Servisní funkce",
  ecuInfo: "Informace o ECU",
};

function normalizeText(value?: string) {
  return (value || "").toLocaleLowerCase("cs");
}

function normalizeAddress(value?: string) {
  return (value || "")
    .replace(/^0x/i, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function ecuMatchesProfile(ecu: EcuOption, profile: VehicleProfile) {
  const text = normalizeText(`${ecu.name} ${ecu.common || ""}`);
  return profile.ecuHints.some((hint) => text.includes(normalizeText(hint)));
}

function isWriteFunction(fn: DiagFunction) {
  return fn.kind === "routine" || fn.kind === "actuator_test" || Boolean(fn.destructive);
}

function statusClass(status?: string) {
  if (status === "ok") return "border-emerald-600 bg-emerald-50 text-emerald-800";
  if (status === "pending") return "border-amber-500 bg-amber-50 text-amber-800";
  if (status === "nrc") return "border-orange-500 bg-orange-50 text-orange-800";
  return "border-red-500 bg-red-50 text-red-800";
}

function collectCodes(result: DiagRunResult | null): string[] {
  if (!result || result.status !== "ok") return [];
  return result.decoded
    .map((item) => String(item.value ?? item.name ?? "").trim())
    .filter((value) => value && value !== "Žádné DTC" && value !== "no_dtc");
}

function resultText(result: DiagRunResult | null) {
  if (!result) return "Nespouštěno";
  if (result.status === "ok") return "OK";
  if (result.status === "no_data") return "Bez dat";
  if (result.status === "timeout") return "Timeout";
  if (result.status === "nrc") return `NRC ${result.nrc?.code || ""}`.trim();
  return "Chyba";
}

/** Vrátí lidský význam a možné příčiny stavu odpovědi. */
function explainStatus(result: DiagRunResult | null): { title: string; causes: string[] } | null {
  if (!result) return null;
  if (result.status === "ok") return null;
  if (result.status === "no_data") {
    return {
      title: "Jednotka nevrátila platná data pro tento požadavek.",
      causes: [
        "DID/PID není podporovaný touto ECU.",
        "Je potřeba jiná diagnostická session (10 03 / 10 02).",
        "Je potřeba security access (27 XX).",
        "Nesprávná TX/RX adresa nebo ECU není přítomná ve výbavě vozidla.",
        "Nesplněné podmínky (zapalování, otáčky motoru, rychlost, teplota).",
      ],
    };
  }
  if (result.status === "timeout") {
    return {
      title: "ECU neodpověděla v časovém limitu.",
      causes: [
        "Jednotka je na jiné CAN větvi (Body/Chassis CAN vs. Powertrain CAN).",
        "Špatná TX/RX adresa nebo špatný CAN speed (500k vs 125k).",
        "Adaptér nepodporuje danou sběrnici (např. SW-CAN, MS-CAN).",
        "ECU spí — probuď zapalováním nebo Wake-Up frame.",
        "Příkaz byl přerušen souběžným pollingem (nemělo by nastat — runExclusive).",
      ],
    };
  }
  if (result.status === "nrc") {
    return {
      title: `Negativní odpověď ECU (NRC ${result.nrc?.code || ""}): ${result.nrc?.description || "Podrobnosti viz UDS katalog."}`,
      causes: [
        "Aktivuj správnou diagnostickou session (Extended 10 03).",
        "Ověř podmínky spuštění pro danou funkci.",
        "Některé funkce vyžadují security access (27 01/03).",
      ],
    };
  }
  return {
    title: "Odpověď adaptéru je chybová.",
    causes: [
      "Ověř připojení OBD adaptéru a napětí baterie.",
      "Ověř zvolený transport (lokální BLE / vzdálená relace).",
      "Zkontroluj TX/RX hlavičky a příkaz.",
    ],
  };
}

const AdminDelphiWowLazy = lazy(() => import("./delphi/AdminDelphiWow"));

import {
  DeveloperModeBadge,
  DeveloperConfirmDialog,
  type DevConfirmDetails,
} from "./delphi/DeveloperMode";
import {
  isDeveloperModeActive,
  subscribeDeveloperMode,
  logDevExecution,
} from "@/lib/delphi/developer-mode";

/** Odhad úrovně rizika neověřené funkce podle typu / destructive příznaku. */
function assessRisk(fn: DiagFunction): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (fn.kind === "routine" && fn.destructive) return "CRITICAL";
  if (fn.kind === "actuator_test") return "HIGH";
  if (fn.kind === "routine") return "HIGH";
  if (fn.kind === "raw") return "MEDIUM";
  if (fn.destructive) return "HIGH";
  return "LOW";
}

export default function AdminDelphi() {
  const [wowOpen, setWowOpen] = useState(false);
  const [brands, setBrands] = useState<BrandManifestEntry[]>([]);
  const [brandKey, setBrandKey] = useState("OBD2");
  const [vin, setVin] = useState("");
  const [functions, setFunctions] = useState<DiagFunction[]>([]);
  const [ecus, setEcus] = useState<EcuOption[]>([]);
  const [ecuAddress, setEcuAddress] = useState("__all");
  const [bleState, setBleState] = useState(bleManager.getState());
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Krok 0 — zdroj OBD: tento telefon nebo aktivní zákaznická relace.
  const [remoteSessions, setRemoteSessions] = useState<RemoteSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [transportSource, setTransportSource] = useState<string>("");
  const [selectedRemoteSession, setSelectedRemoteSession] = useState<RemoteSession | null>(null);

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [generation, setGeneration] = useState("");
  const [year, setYear] = useState("");
  const [profileId, setProfileId] = useState("");

  const [openPanel, setOpenPanel] = useState<PanelKey | null>("dtc");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DiagFunction | null>(null);
  const [result, setResult] = useState<DiagRunResult | null>(null);
  const [running, setRunning] = useState(false);

  const [fullScanRunning, setFullScanRunning] = useState(false);
  const [fullClearRunning, setFullClearRunning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [scanResults, setScanResults] = useState<EcuScanResult[]>([]);

  // Auto-detekce dostupných ECU (non-destructive: Tester Present 3E 00).
  const [detectingEcus, setDetectingEcus] = useState(false);
  const [detectProgress, setDetectProgress] = useState("");
  const [detectedEcus, setDetectedEcus] = useState<Set<string>>(new Set());
  const [probedEcus, setProbedEcus] = useState<Set<string>>(new Set());

  // Reset key increments whenever the active vehicle or ECU changes; consumed by LiveDataPanel to stop polling and clear samples.
  const [liveResetKey, setLiveResetKey] = useState(0);
  // Per-ECU history of previous DTC codes, so we can flag codes that returned after clearing.
  const [previousCodesByEcu, setPreviousCodesByEcu] = useState<Record<string, string[]>>({});
  // Single-ECU busy tracker for per-ECU rescan / clear controls.
  const [busyEcu, setBusyEcu] = useState<string | null>(null);

  // Developer Mode (session-only unlock, klíč 1607).
  const [devActive, setDevActive] = useState(isDeveloperModeActive());
  const [devConfirm, setDevConfirm] = useState<DevConfirmDetails | null>(null);
  const [devPending, setDevPending] = useState<null | (() => Promise<void>)>(null);
  useEffect(() => subscribeDeveloperMode(setDevActive), []);

  useEffect(
    () =>
      bleManager.subscribe((event) => {
        if (event.type === "stateChange") setBleState(event.payload);
      }),
    [],
  );

  const isRemoteSessionLive = (session: RemoteSession) =>
    session.is_active && Date.now() - new Date(session.last_seen).getTime() < 60_000;

  const fetchRemoteSessions = async () => {
    setLoadingSessions(true);
    try {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("obd_live_sessions")
        .select("*")
        .order("last_seen", { ascending: false })
        .limit(100);

      if (sessionsError) throw sessionsError;

      const rawSessions = (sessionsData || []) as Array<Record<string, any>>;
      const userIds = [...new Set(rawSessions.map((item) => item.user_id).filter(Boolean))];

      if (userIds.length === 0) {
        setRemoteSessions([]);
        return;
      }

      const [{ data: profiles }, { data: permissions }] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds),
        supabase
          .from("obd_permissions")
          .select("*")
          .in("user_id", userIds),
      ]);

      const profileMap = new Map(
        (profiles || []).map((item: any) => [item.user_id, item]),
      );
      const permissionMap = new Map(
        (permissions || []).map((item: any) => [item.user_id, item]),
      );

      const mapped: RemoteSession[] = rawSessions.map((item) => ({
        id: String(item.id),
        user_id: String(item.user_id),
        vin: item.vin ? String(item.vin) : null,
        last_seen: String(item.last_seen),
        is_active: Boolean(item.is_active),
        profile_name: profileMap.get(item.user_id)?.full_name || "Bez jména",
        profile_email: profileMap.get(item.user_id)?.email || "—",
        permissions: permissionMap.get(item.user_id) || undefined,
      }));

      setRemoteSessions(mapped);
      setSelectedRemoteSession((current) =>
        current ? mapped.find((item) => item.id === current.id) || null : null,
      );
    } catch (error) {
      toast({
        title: "Nepodařilo se načíst OBD relace",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchRemoteSessions();

    const channel = supabase
      .channel("delphi-remote-session-selector")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "obd_live_sessions" },
        () => fetchRemoteSessions(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    listBrands()
      .then(setBrands)
      .catch((error) =>
        toast({
          title: "Katalog Delphi se nepodařilo načíst",
          description: String(error),
          variant: "destructive",
        }),
      );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingCatalog(true);

    loadBrandFunctions(brandKey)
      .then((data) => {
        if (cancelled) return;

        setFunctions(data.functions);

        const map = new Map<string, EcuOption>();
        for (const ecu of data.catalog.ecus || []) {
          const key = normalizeAddress(ecu.address);
          if (!key) continue;
          map.set(key, {
            address: ecu.address,
            name: ecu.name,
            common: ecu.common_name,
          });
        }

        setEcus(
          Array.from(map.values()).sort((a, b) =>
            (a.common || a.name).localeCompare(b.common || b.name, "cs"),
          ),
        );

        setEcuAddress("__all");
        setSelected(null);
        setResult(null);
        setScanResults([]);
      })
      .catch((error) =>
        toast({
          title: "Chyba katalogu Delphi",
          description: String(error),
          variant: "destructive",
        }),
      )
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandKey]);

  const makes = useMemo(
    () => uniqueSorted(VEHICLE_PROFILES.map((item) => item.make)),
    [],
  );

  const models = useMemo(
    () =>
      uniqueSorted(
        VEHICLE_PROFILES.filter((item) => item.make === make).map((item) => item.model),
      ),
    [make],
  );

  const generations = useMemo(
    () =>
      uniqueSorted(
        VEHICLE_PROFILES.filter(
          (item) => item.make === make && item.model === model,
        ).map((item) => item.generation),
      ),
    [make, model],
  );

  const years = useMemo(() => {
    const values = new Set<number>();
    VEHICLE_PROFILES.filter(
      (item) =>
        item.make === make &&
        item.model === model &&
        item.generation === generation,
    ).forEach((item) => {
      for (let current = item.yearFrom; current <= item.yearTo; current += 1) {
        values.add(current);
      }
    });
    return [...values].sort((a, b) => b - a);
  }, [make, model, generation]);

  const matchingProfiles = useMemo(
    () =>
      VEHICLE_PROFILES.filter((item) => {
        const selectedYear = Number(year);
        return (
          item.make === make &&
          item.model === model &&
          item.generation === generation &&
          (!selectedYear ||
            (selectedYear >= item.yearFrom && selectedYear <= item.yearTo))
        );
      }),
    [make, model, generation, year],
  );

  const profile = useMemo(
    () => VEHICLE_PROFILES.find((item) => item.id === profileId) || null,
    [profileId],
  );

  useEffect(() => {
    if (profile && profile.brandKey !== brandKey) {
      setBrandKey(profile.brandKey);
    }
  }, [profile, brandKey]);

  // Vehicle or ECU changed → clear scan/selected/result and signal Live panel to stop & reset samples.
  useEffect(() => {
    setScanResults([]);
    setSelected(null);
    setResult(null);
    setPreviousCodesByEcu({});
    setLiveResetKey((k) => k + 1);
  }, [profileId, ecuAddress, brandKey]);

  const brand = useMemo(
    () => brands.find((item) => item.key === brandKey),
    [brands, brandKey],
  );

  const availableEcus = useMemo(() => ecus, [ecus]);

  const recommendedEcuAddresses = useMemo(() => {
    if (!profile) return new Set<string>();
    return new Set(
      ecus
        .filter((ecu) => ecuMatchesProfile(ecu, profile))
        .map((ecu) => normalizeAddress(ecu.address)),
    );
  }, [ecus, profile]);

  const selectedEcu = useMemo(
    () =>
      availableEcus.find(
        (item) => normalizeAddress(item.address) === normalizeAddress(ecuAddress),
      ),
    [availableEcus, ecuAddress],
  );

  const usingLocalTransport = transportSource === "local";
  const usingRemoteTransport = transportSource.startsWith("remote:");
  const remoteLive = selectedRemoteSession
    ? isRemoteSessionLive(selectedRemoteSession)
    : false;
  const transportReady = usingLocalTransport
    ? bleState === "connected"
    : usingRemoteTransport && remoteLive;
  const transportChosen = usingLocalTransport || usingRemoteTransport;

  const activeContext: ActiveDiagContext | null = useMemo(() => {
    if (!brand) return null;
    return {
      brandKey: brand.key,
      brandLabel: brand.display_name,
      isOem: brand.key !== "OBD2",
      vin: vin || null,
      ecuAddress: selectedEcu?.address,
      ecuName: selectedEcu?.common || selectedEcu?.name,
    };
  }, [brand, selectedEcu, vin]);

  const dtcFunctions = useMemo(
    () => functions.filter((fn) => fn.kind === "dtc_scan"),
    [functions],
  );

  const storedDtcFn = dtcFunctions.find((fn) => fn.command.trim() === "03") || null;
  const pendingDtcFn = dtcFunctions.find((fn) => fn.command.trim() === "07") || null;
  const permanentDtcFn = dtcFunctions.find((fn) => fn.command.trim().toUpperCase() === "0A") || null;

  const liveFunctions = useMemo(
    () =>
      functions.filter((fn) =>
        ["live_pid", "obd2_pid", "did"].includes(fn.kind),
      ),
    [functions],
  );

  const actuatorFunctions = useMemo(
    () => functions.filter((fn) => fn.kind === "actuator_test"),
    [functions],
  );

  const serviceFunctions = useMemo(
    () => functions.filter((fn) => fn.kind === "routine"),
    [functions],
  );

  const functionGroups = useMemo(() => {
    const source =
      openPanel === "live"
        ? liveFunctions
        : openPanel === "actuators"
          ? actuatorFunctions
          : openPanel === "service"
            ? serviceFunctions
            : [];

    const query = search.trim().toLocaleLowerCase("cs");
    const filtered = source.filter((fn) => {
      if (
        ecuAddress !== "__all" &&
        fn.ecuAddress &&
        normalizeAddress(fn.ecuAddress) !== normalizeAddress(ecuAddress)
      ) {
        return false;
      }

      if (!query) return true;

      return [
        fn.name,
        fn.description,
        fn.category,
        fn.ecuCommonName,
        fn.ecu,
        fn.routineId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("cs")
        .includes(query);
    });

    const ecuGroups = new Map<
      string,
      {
        ecuLabel: string;
        ecuAddress: string;
        categories: Map<string, DiagFunction[]>;
      }
    >();

    for (const fn of filtered) {
      const address = normalizeAddress(fn.ecuAddress) || "GENERAL";
      const ecuLabel =
        fn.ecuCommonName ||
        fn.ecu ||
        (address === "GENERAL" ? "Obecné OBD-II funkce" : `ECU ${address}`);
      const category = fn.category || "Ostatní";

      const existing = ecuGroups.get(address) || {
        ecuLabel,
        ecuAddress: address,
        categories: new Map<string, DiagFunction[]>(),
      };

      const categoryFunctions = existing.categories.get(category) || [];
      categoryFunctions.push(fn);
      existing.categories.set(category, categoryFunctions);
      ecuGroups.set(address, existing);
    }

    return [...ecuGroups.values()]
      .map((group) => ({
        ...group,
        categories: [...group.categories.entries()]
          .map(([category, items]) => ({
            category,
            items: items.sort((a, b) => a.name.localeCompare(b.name, "cs")),
          }))
          .sort((a, b) => a.category.localeCompare(b.category, "cs")),
      }))
      .sort((a, b) => a.ecuLabel.localeCompare(b.ecuLabel, "cs"));
  }, [
    openPanel,
    liveFunctions,
    actuatorFunctions,
    serviceFunctions,
    search,
    ecuAddress,
  ]);

  const totalDtc = useMemo(
    () =>
      scanResults.reduce(
        (sum, item) =>
          sum +
          collectCodes(item.stored).length +
          collectCodes(item.pending).length +
          collectCodes(item.permanent).length,
        0,
      ),
    [scanResults],
  );

  function resetBelow(level: "make" | "model" | "generation" | "year") {
    if (level === "make") {
      setModel("");
      setGeneration("");
      setYear("");
      setProfileId("");
    } else if (level === "model") {
      setGeneration("");
      setYear("");
      setProfileId("");
    } else if (level === "generation") {
      setYear("");
      setProfileId("");
    } else {
      setProfileId("");
    }

    setEcuAddress("__all");
    setSelected(null);
    setResult(null);
    setScanResults([]);
  }

  async function decodeVin() {
    const found = await findBrandForVin(vin);
    if (!found) {
      toast({
        title: "VIN nebyl rozpoznán",
        description: "Vyber vozidlo ručně.",
        variant: "destructive",
      });
      return;
    }

    setBrandKey(found.key);
    toast({
      title: "Výrobce rozpoznán",
      description: `${found.display_name}. Model, rok a motor vyber ručně.`,
    });
  }

  function contextForEcu(ecu: EcuOption): ActiveDiagContext {
    return {
      brandKey: brand?.key || brandKey,
      brandLabel: brand?.display_name || brandKey,
      isOem: (brand?.key || brandKey) !== "OBD2",
      vin: vin || null,
      ecuAddress: ecu.address,
      ecuName: ecu.common || ecu.name,
    };
  }

  function extractRemoteRaw(result: unknown): string {
    if (typeof result === "string") return result;
    if (!result || typeof result !== "object") return "";

    const value = result as Record<string, unknown>;
    const candidates = [
      value.rawResponse,
      value.raw_response,
      value.raw,
      value.response,
      value.output,
      value.data,
      value.value,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string") return candidate;
      if (candidate && typeof candidate === "object") {
        const nested = candidate as Record<string, unknown>;
        for (const key of ["rawResponse", "raw", "response", "output", "value"]) {
          if (typeof nested[key] === "string") return nested[key] as string;
        }
      }
    }

    return JSON.stringify(result);
  }

  async function sendRemoteRawCommand(
    command: string,
    timeoutMs = 30_000,
  ): Promise<{ status: string; raw: string; error: string | null }> {
    if (!selectedRemoteSession) {
      throw new Error("Není vybraný zákaznický OBD uživatel.");
    }

    if (!isRemoteSessionLive(selectedRemoteSession)) {
      throw new Error("Vybraný zákazník je offline.");
    }

    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("obd_remote_commands")
      .insert({
        user_id: selectedRemoteSession.user_id,
        command_type: "custom_command",
        command_payload: {
          command: command.trim().toUpperCase(),
          source: "delphi",
          session_id: selectedRemoteSession.id,
        } as any,
        status: "pending",
        created_by: authData.user?.id ?? null,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(error?.message || "Vzdálený příkaz se nepodařilo vytvořit.");
    }

    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));

      const { data: row, error: readError } = await supabase
        .from("obd_remote_commands")
        .select("id, status, result, error")
        .eq("id", data.id)
        .single();

      if (readError) throw new Error(readError.message);

      const commandRow = row as RemoteCommandRow;
      if (commandRow.status === "done") {
        return {
          status: "ok",
          raw: extractRemoteRaw(commandRow.result),
          error: null,
        };
      }

      if (commandRow.status === "error") {
        return {
          status: "error",
          raw: extractRemoteRaw(commandRow.result),
          error: commandRow.error || "Vzdálený příkaz skončil chybou.",
        };
      }
    }

    return {
      status: "timeout",
      raw: "",
      error: "Vzdálený příkaz překročil časový limit.",
    };
  }

  function responseHeaderFromRequest(request?: string) {
    const clean = normalizeAddress(request);
    if (/^7E[0-7]$/.test(clean)) {
      return (parseInt(clean, 16) + 8).toString(16).toUpperCase();
    }
    return clean;
  }

  async function runRemoteFunction(
    fn: DiagFunction,
    context: ActiveDiagContext | null,
    serviceMode = false,
  ): Promise<DiagRunResult> {
    const started = Date.now();
    const warnings: string[] = [];
    const tx = normalizeAddress(context?.ecuAddress || fn.ecuAddress);
    const rx = responseHeaderFromRequest(tx);

    try {
      if (tx) {
        const header = await sendRemoteRawCommand(`AT SH ${tx}`, 10_000);
        if (header.status !== "ok") warnings.push(`AT SH ${tx}: ${header.status}`);
      }

      if (rx) {
        const filter = await sendRemoteRawCommand(`AT CRA ${rx}`, 10_000);
        if (filter.status !== "ok") warnings.push(`AT CRA ${rx}: ${filter.status}`);
      }

      if (
        serviceMode &&
        fn.isOem &&
        (fn.kind === "routine" || fn.kind === "actuator_test")
      ) {
        const session = await sendRemoteRawCommand("10 03", 15_000);
        if (session.status !== "ok") warnings.push(`10 03: ${session.status}`);
      }

      const remote = await sendRemoteRawCommand(
        fn.command,
        fn.kind === "routine" || fn.kind === "actuator_test" ? 45_000 : 30_000,
      );

      const nrcCatalog = await loadUdsNrcCatalog().catch(() => undefined);
      const cleaned = cleanResponse(fn.command, remote.raw, nrcCatalog);
      warnings.push(...cleaned.warnings);

      let decoded: DiagRunResult["decoded"] = [];
      if (remote.status === "ok" && cleaned.status === "ok") {
        if (fn.kind === "dtc_scan") {
          const codes = decodeDtcs(cleaned.bytes);
          decoded = codes.length
            ? codes.map((code) => ({
                name: code,
                value: code,
                unit: null,
                description: null,
              }))
            : [{
                name: "no_dtc",
                value: "Žádné DTC",
                unit: null,
                description: null,
              }];
        } else {
          decoded = decodeValue(fn, cleaned.bytes);
        }
      }

      return {
        fn,
        command: fn.command,
        rawResponse: remote.raw,
        cleanedResponse: cleaned.cleanedHex,
        status:
          remote.status === "ok"
            ? cleaned.status
            : remote.status === "timeout"
              ? "timeout"
              : "error",
        decoded,
        warnings,
        nrc: cleaned.nrc,
        error: remote.error,
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        fn,
        command: fn.command,
        rawResponse: "",
        cleanedResponse: "",
        status: "error",
        decoded: [],
        warnings,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      };
    } finally {
      await sendRemoteRawCommand("AT CRA", 8_000).catch(() => undefined);
    }
  }

  async function runThroughSelectedTransport(
    fn: DiagFunction,
    context: ActiveDiagContext | null,
    serviceMode = false,
  ) {
    if (!transportChosen) {
      throw new Error("Nejdřív vyber zdroj OBD v kroku 0.");
    }

    if (usingRemoteTransport) {
      return runRemoteFunction(fn, context, serviceMode);
    }

    return runDiagFunction(fn, {
      activeContext: context,
      vin: vin || null,
      serviceMode,
    });
  }

  async function runRawThroughSelectedTransport(
    command: string,
    context: ActiveDiagContext | null,
    serviceMode = false,
  ): Promise<DiagRunResult> {
    if (usingRemoteTransport) {
      const fn: DiagFunction = {
        id: `remote-raw:${command}`,
        brandKey: context?.brandKey || "OBD2",
        brandLabel: context?.brandLabel || "Raw",
        isOem: Boolean(context?.isOem),
        ecuAddress: context?.ecuAddress,
        ecu: context?.ecuName,
        kind: "raw",
        name: `Raw: ${command}`,
        command,
        sourceFile: "remote",
        originalName: command,
      };
      return runRemoteFunction(fn, context, serviceMode);
    }

    return runRawCommand(command, context, {
      activeContext: context,
      vin: vin || null,
      serviceMode,
    });
  }

  /**
   * Non-destruktivní auto-detekce ECU.
   * Pro každou ECU z katalogu pošle Tester Present (3E 00) na TX/CRA adresy.
   * Jednotka, která odpoví (pozitivně 7E, negativně NRC 7F, nebo cokoliv
   * není-NO_DATA/UNABLE), je označena jako přítomná. Nezápisuje, nemění
   * session ani coding. Po dokončení ELM se vrátí do "simple" profilu
   * s broadcast SH 7DF, aby živé PIDy fungovaly dál.
   */
  async function detectAvailableEcus() {
    if (!transportReady) {
      toast({
        title: usingRemoteTransport ? "Vybraný zákazník je offline" : "OBD adaptér není připojen",
        variant: "destructive",
      });
      return;
    }
    if (usingRemoteTransport) {
      toast({
        title: "Detekce ECU je zatím jen pro lokální BLE",
        description: "Vzdálený režim není v této iteraci podporován.",
      });
      return;
    }
    if (availableEcus.length === 0) {
      toast({ title: "Katalog neobsahuje žádné ECU pro tuto značku", variant: "destructive" });
      return;
    }

    setDetectingEcus(true);
    setDetectProgress("Připravuji ELM…");
    const found = new Set<string>();
    const probed = new Set<string>();

    try {
      await elmQueue.runExclusive(async () => {
        await applyElmProfile("debug", true).catch(() => undefined);

        for (let i = 0; i < availableEcus.length; i++) {
          const ecu = availableEcus[i];
          const tx = normalizeAddress(ecu.address);
          if (!tx || !/^[0-9A-F]{3,8}$/.test(tx)) continue;
          const rx = tx.length === 3 && tx.startsWith("7E")
            ? (parseInt(tx, 16) + 8).toString(16).toUpperCase().padStart(3, "0")
            : tx;

          setDetectProgress(`Testuji ${ecu.common || ecu.name} [${tx}] (${i + 1}/${availableEcus.length})`);

          try {
            await elmQueue.send(`AT SH ${tx}`, { commandType: "delphi_diag_init", timeoutMs: 900 });
            await elmQueue.send(`AT CRA ${rx}`, { commandType: "delphi_diag_init", timeoutMs: 900 });
            const r = await elmQueue.send("3E 00", {
              commandType: "delphi_diag_read",
              timeoutMs: 900,
            });
            probed.add(tx);
            const raw = (r.raw || "").toUpperCase();
            const isNoData = /NO\s*DATA|UNABLE|CAN\s*ERROR|BUS\s*INIT|STOPPED|BUFFER/.test(raw);
            const isAck = /\b7E\s?00\b/.test(raw) || /\b7F\s?3E\b/.test(raw);
            if (r.status === "ok" && !isNoData) {
              if (isAck || /^[0-9A-F ]+$/.test(raw.trim())) {
                found.add(tx);
              }
            }
          } catch {
            // pokračuj na další ECU
          }
        }

        // Obnova: broadcast a simple profil
        try { await elmQueue.send("AT CRA", { commandType: "delphi_diag_restore", timeoutMs: 900 }); } catch {}
        try { await elmQueue.send("AT SH 7DF", { commandType: "delphi_diag_restore", timeoutMs: 900 }); } catch {}
        try { await applyElmProfile("simple", true); } catch {}
      });

      setDetectedEcus(found);
      setProbedEcus(probed);
      toast({
        title: `Detekce dokončena: ${found.size} / ${probed.size} ECU odpovědělo`,
        description: found.size === 0
          ? "Žádná ECU neodpověděla — zkontroluj profil vozidla a připojení."
          : "Dostupné jednotky jsou zvýrazněné v seznamu.",
      });
    } catch (e) {
      toast({
        title: "Detekce ECU selhala",
        description: String((e as Error)?.message || e),
        variant: "destructive",
      });
    } finally {
      setDetectingEcus(false);
      setDetectProgress("");
    }
  }

  async function scanAllFaults() {
    if (!transportReady) {
      toast({
        title: usingRemoteTransport ? "Vybraný zákazník je offline" : "OBD adaptér není připojen",
        variant: "destructive",
      });
      return;
    }

    if (!profile) {
      toast({
        title: "Nejdřív vyber vozidlo",
        description: "Vyber značku, model, generaci, rok a motor.",
        variant: "destructive",
      });
      return;
    }

    if (!storedDtcFn) {
      toast({
        title: "V katalogu chybí čtení DTC",
        description: "Nebyla nalezena funkce Mode 03.",
        variant: "destructive",
      });
      return;
    }

    const targets = availableEcus;
    if (targets.length === 0) {
      toast({
        title: "Pro značku nejsou dostupné ECU",
        variant: "destructive",
      });
      return;
    }

    setFullScanRunning(true);
    setScanResults([]);
    setResult(null);

    const collected: EcuScanResult[] = [];

    try {
      for (let index = 0; index < targets.length; index += 1) {
        const ecu = targets[index];
        setScanProgress(
          `${index + 1}/${targets.length} · ${ecu.common || ecu.name}`,
        );

        const ctx = contextForEcu(ecu);

        const stored = await runThroughSelectedTransport(storedDtcFn, ctx);

        const pending = pendingDtcFn
          ? await runThroughSelectedTransport(pendingDtcFn, ctx)
          : null;

        const permanent = permanentDtcFn
          ? await runThroughSelectedTransport(permanentDtcFn, ctx)
          : null;

        const row = { ecu, stored, pending, permanent };
        collected.push(row);
        setScanResults([...collected]);
      }

      toast({
        title: "Kompletní diagnostika dokončena",
        description: `Zkontrolováno ${targets.length} jednotek, nalezeno ${collected.reduce(
          (sum, item) =>
            sum +
            collectCodes(item.stored).length +
            collectCodes(item.pending).length +
            collectCodes(item.permanent).length,
          0,
        )} DTC.`,
      });
    } finally {
      setFullScanRunning(false);
      setScanProgress("");
    }
  }

  async function clearAllFaults() {
    if (!transportReady) {
      toast({
        title: usingRemoteTransport ? "Vybraný zákazník je offline" : "OBD adaptér není připojen",
        variant: "destructive",
      });
      return;
    }

    if (!profile) {
      toast({
        title: "Nejdřív vyber vozidlo",
        variant: "destructive",
      });
      return;
    }

    const targets = availableEcus;
    if (targets.length === 0) return;

    const confirmed = window.confirm(
      [
        "SMAZAT CHYBY VE VŠECH DOSTUPNÝCH JEDNOTKÁCH?",
        "",
        "Zapalování musí být zapnuté a motor podle požadavků výrobce vypnutý.",
        "Po vymazání se automaticky znovu načtou chyby.",
      ].join("\n"),
    );
    if (!confirmed) return;

    setFullClearRunning(true);

    const cleared: EcuScanResult[] = [];

    try {
      for (let index = 0; index < targets.length; index += 1) {
        const ecu = targets[index];
        setScanProgress(
          `${index + 1}/${targets.length} · mazání · ${ecu.common || ecu.name}`,
        );

        const ctx = contextForEcu(ecu);
        const clear = await runRawThroughSelectedTransport("04", ctx, true);

        const stored = storedDtcFn
          ? await runThroughSelectedTransport(storedDtcFn, ctx)
          : null;

        const pending = pendingDtcFn
          ? await runThroughSelectedTransport(pendingDtcFn, ctx)
          : null;

        const permanent = permanentDtcFn
          ? await runThroughSelectedTransport(permanentDtcFn, ctx)
          : null;

        const row = { ecu, clear, stored, pending, permanent };
        cleared.push(row);
        setScanResults([...cleared]);
      }

      toast({
        title: "Mazání dokončeno",
        description: "Proběhla následná kontrola chyb.",
      });
    } finally {
      setFullClearRunning(false);
      setScanProgress("");
    }
  }

  async function rescanEcu(target: EcuOption) {
    if (!transportReady || !storedDtcFn) return;
    const addr = normalizeAddress(target.address);
    setBusyEcu(addr);
    try {
      const ctx = contextForEcu(target);
      const stored = await runThroughSelectedTransport(storedDtcFn, ctx);
      const pending = pendingDtcFn ? await runThroughSelectedTransport(pendingDtcFn, ctx) : null;
      const permanent = permanentDtcFn ? await runThroughSelectedTransport(permanentDtcFn, ctx) : null;
      const row: EcuScanResult = { ecu: target, stored, pending, permanent };
      setScanResults((prev) => {
        const idx = prev.findIndex((r) => normalizeAddress(r.ecu.address) === addr);
        if (idx === -1) return [...prev, row];
        const next = prev.slice();
        next[idx] = { ...row, clear: prev[idx].clear };
        return next;
      });
    } finally {
      setBusyEcu(null);
    }
  }

  async function clearEcuFaults(target: EcuOption) {
    if (!transportReady) return;
    const addr = normalizeAddress(target.address);
    const confirmed = window.confirm(
      `SMAZAT CHYBY V JEDNOTCE ${target.common || target.name} [${addr}]?\n\nZapalování ON, motor podle podmínek výrobce.\nPo vymazání proběhne automatické znovunačtení.`
    );
    if (!confirmed) return;
    setBusyEcu(addr);
    try {
      const prevCodes = collectCodes(scanResults.find((r) => normalizeAddress(r.ecu.address) === addr)?.stored || null);
      setPreviousCodesByEcu((m) => ({ ...m, [addr]: prevCodes }));
      const ctx = contextForEcu(target);
      const clear = await runRawThroughSelectedTransport("04", ctx, true);
      const stored = storedDtcFn ? await runThroughSelectedTransport(storedDtcFn, ctx) : null;
      const pending = pendingDtcFn ? await runThroughSelectedTransport(pendingDtcFn, ctx) : null;
      const permanent = permanentDtcFn ? await runThroughSelectedTransport(permanentDtcFn, ctx) : null;
      setScanResults((prev) => {
        const idx = prev.findIndex((r) => normalizeAddress(r.ecu.address) === addr);
        const row: EcuScanResult = { ecu: target, stored, pending, permanent, clear };
        if (idx === -1) return [...prev, row];
        const next = prev.slice();
        next[idx] = row;
        return next;
      });
      toast({ title: `Mazání v ECU ${target.common || target.name} dokončeno` });
    } finally {
      setBusyEcu(null);
    }
  }

  function saveDtcReport() {
    if (scanResults.length === 0) {
      toast({ title: "Není co uložit", description: "Nejdřív načti chyby.", variant: "destructive" });
      return;
    }
    const report = {
      generatedAt: new Date().toISOString(),
      vehicle: profile ? { make: profile.make, model: profile.model, generation: profile.generation, year, engine: profile.engine, engineCode: profile.engineCode } : null,
      vin: vin || null,
      brand: brand?.display_name || brandKey,
      transport: usingLocalTransport ? "local-ble" : usingRemoteTransport ? `remote:${selectedRemoteSession?.profile_name || ""}` : "unknown",
      totalEcus: scanResults.length,
      totalDtc,
      ecus: scanResults.map((row) => ({
        address: normalizeAddress(row.ecu.address),
        name: row.ecu.common || row.ecu.name,
        storedStatus: row.stored?.status || null,
        stored: collectCodes(row.stored),
        pending: collectCodes(row.pending),
        permanent: collectCodes(row.permanent),
        clear: row.clear ? { status: row.clear.status, response: row.clear.rawResponse } : null,
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `delphi-dtc-report-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Report uložen" });
  }

  async function executeSelected() {
    if (!selected) return;
    setRunning(true);
    try {
      const output = await runThroughSelectedTransport(selected, activeContext, true);
      setResult(output);
      if (isDeveloperModeActive()) {
        void logDevExecution({
          vin: vin || null,
          hardware: usingRemoteTransport ? "remote" : "local-ble",
          ecu: selected.ecu || selected.ecuAddress || null,
          protocol: selected.isOem ? "OEM (CAN/UDS)" : "OBD-II",
          request: output.command,
          response: output.rawResponse,
          parsed: output.decoded,
          session: isWriteFunction(selected) ? "10 03 (extended)" : "10 01 (default)",
          result_status: output.status,
          risk_level: assessRisk(selected),
          function_id: selected.id,
          function_name: selected.name,
          function_kind: selected.kind,
          reason_unverified:
            "Funkce nebyla ověřena pro konkrétní SW variantu ECU tohoto vozidla.",
          tx: activeContext?.manualTx || activeContext?.ecuAddress || null,
          rx: activeContext?.manualRx || activeContext?.responseHeader || null,
          transport_log: (output.warnings || []).join("\n") || null,
        });
      }
    } catch (error) {
      toast({
        title: "Funkci se nepodařilo spustit",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  }

  async function runSelected() {
    if (!selected) return;

    // Developer Mode: candidate/blocked funkce → strukturovaný confirm s druhým potvrzením.
    if (isDeveloperModeActive() && (isWriteFunction(selected) || selected.destructive)) {
      setDevConfirm({
        functionName: selected.name,
        functionKind: selected.kind,
        ecu: selected.ecu || selected.ecuAddress || null,
        protocol: selected.isOem ? "OEM (CAN/UDS)" : "OBD-II",
        request: selected.command,
        session: isWriteFunction(selected) ? "10 03 (extended)" : "10 01 (default)",
        hardware: usingRemoteTransport ? "Vzdálený zákaznický OBD" : "Lokální BLE OBD",
        tx: activeContext?.manualTx || activeContext?.ecuAddress || null,
        rx: activeContext?.manualRx || activeContext?.responseHeader || null,
        requirements: [
          "Zapalování ON, motor podle podmínek výrobce.",
          "Napětí baterie v normě (>12.4V).",
          "Vybraná správná ECU pro dané vozidlo.",
        ],
        limitations: [
          "Funkce nebyla ověřena pro tuto konkrétní SW variantu ECU.",
          "Odpověď nemusí být korektně dekódována.",
        ],
        reasonUnverified:
          selected.safetyWarning ||
          "Chybí ověřená komunikační definice pro tento konkrétní model / SW ECU.",
        consequences: [
          "Změna coding/adaptací, ztráta naučených hodnot, nutnost kalibrace.",
        ],
        risk: assessRisk(selected),
      });
      setDevPending(() => executeSelected);
      return;
    }

    // Standardní režim — původní chování (window.confirm pro destruktivní funkce).
    const warning = isWriteFunction(selected)
      ? [
          "VAROVÁNÍ – ODBORNÝ REŽIM",
          "",
          selected.safetyWarning ||
            "Tato funkce může změnit stav řídicí jednotky nebo vozidla.",
          "",
          "Funkce nemusí být ověřena pro konkrétní SW variantu ECU.",
          "Zkontroluj vybranou ECU, napětí, zapalování a podmínky výrobce.",
          "",
          "Spustit funkci?",
        ].join("\n")
      : selected.destructive
        ? `Pozor: ${selected.safetyWarning || "Tato funkce může změnit stav vozidla."}\n\nPokračovat?`
        : null;

    if (warning && !window.confirm(warning)) return;
    await executeSelected();
  }

  function togglePanel(panel: PanelKey) {
    setOpenPanel((current) => (current === panel ? null : panel));
    setSelected(null);
    setResult(null);
    setSearch("");
  }

  return (
    <div className="min-w-0 space-y-3 pb-[env(safe-area-inset-bottom)]">
      <div className="overflow-hidden rounded-xl border border-slate-500 bg-gradient-to-b from-slate-100 to-slate-300 text-slate-950 shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b border-slate-500 bg-gradient-to-b from-slate-700 to-slate-950 px-4 py-3 text-white">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">
              Samostatná diagnostika
            </p>
            <h1 className="text-xl font-extrabold tracking-tight">
              Delphi Diagnostic
            </h1>
          </div>

          <Badge
            variant="outline"
            className={
              transportReady
                ? "border-emerald-400 bg-emerald-950/50 text-emerald-200"
                : "border-red-400 bg-red-950/50 text-red-200"
            }
          >
            {usingRemoteTransport ? (
              <Wifi className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Bluetooth className="mr-1 h-3.5 w-3.5" />
            )}
            {!transportChosen
              ? "Vyber OBD zdroj"
              : transportReady
                ? usingRemoteTransport
                  ? "Vzdálené OBD LIVE"
                  : "Lokální OBD připojeno"
                : usingRemoteTransport
                  ? "Zákazník offline"
                  : "Lokální OBD odpojeno"}
          </Badge>
          <DeveloperModeBadge />
        </div>

        <div className="space-y-3 p-3 sm:p-4">
          {/* 0. VÝBĚR UŽIVATELE / OBD ZDROJE */}
          <section className="overflow-hidden rounded-xl border border-slate-500 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-slate-400 bg-slate-200 px-3 py-2">
              <span className="text-sm font-bold">0. Vyber uživatele / OBD relaci</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={fetchRemoteSessions}
                disabled={loadingSessions}
                className="h-7 text-slate-700"
              >
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loadingSessions ? "animate-spin" : ""}`} />
                Obnovit
              </Button>
            </div>

            <div className="space-y-2 p-3">
              <button
                type="button"
                onClick={() => {
                  setTransportSource("local");
                  setSelectedRemoteSession(null);
                  setScanResults([]);
                  setResult(null);
                }}
                className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                  usingLocalTransport
                    ? "border-blue-600 bg-blue-50"
                    : "border-slate-300 bg-white hover:bg-slate-50"
                }`}
              >
                <Bluetooth className="h-5 w-5 shrink-0 text-blue-700" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-950">Tento telefon – lokální OBD</p>
                  <p className="text-xs text-slate-600">
                    Použije adaptér připojený přímo k tomuto zařízení.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    bleState === "connected"
                      ? "border-emerald-400 text-emerald-700"
                      : "border-red-400 text-red-700"
                  }
                >
                  {bleState === "connected" ? "Připojeno" : "Odpojeno"}
                </Badge>
              </button>

              <div className="pt-1">
                <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
                  <User className="h-4 w-4" />
                  Zákaznické OBD relace
                </p>

                {loadingSessions && remoteSessions.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 p-5 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Načítám uživatele…
                  </div>
                ) : remoteSessions.length === 0 ? (
                  <p className="rounded-lg border border-slate-300 p-4 text-sm text-slate-600">
                    Nebyla nalezena žádná zákaznická OBD relace.
                  </p>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {remoteSessions.map((session) => {
                      const live = isRemoteSessionLive(session);
                      const active = transportSource === `remote:${session.id}`;

                      return (
                        <button
                          type="button"
                          key={session.id}
                          onClick={() => {
                            setTransportSource(`remote:${session.id}`);
                            setSelectedRemoteSession(session);
                            if (session.vin) setVin(session.vin.toUpperCase());
                            setScanResults([]);
                            setResult(null);
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                            active
                              ? "border-orange-500 bg-orange-50"
                              : "border-slate-300 bg-white hover:bg-slate-50"
                          }`}
                        >
                          {live ? (
                            <Wifi className="h-5 w-5 shrink-0 text-emerald-600" />
                          ) : (
                            <WifiOff className="h-5 w-5 shrink-0 text-slate-500" />
                          )}

                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold text-slate-950">
                              {session.profile_name}
                            </p>
                            <p className="truncate text-xs text-slate-600">
                              {session.profile_email}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              VIN: {session.vin || "—"} · poslední signál{" "}
                              {new Date(session.last_seen).toLocaleString("cs-CZ")}
                            </p>
                          </div>

                          <Badge
                            variant="outline"
                            className={
                              live
                                ? "border-emerald-400 text-emerald-700"
                                : "border-slate-400 text-slate-600"
                            }
                          >
                            {live ? "LIVE" : "Offline"}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {transportChosen && (
                <div className={`rounded-lg border p-3 text-sm ${
                  transportReady
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-amber-300 bg-amber-50 text-amber-900"
                }`}>
                  <p className="font-bold">
                    Aktivní zdroj:{" "}
                    {usingLocalTransport
                      ? "Tento telefon"
                      : selectedRemoteSession?.profile_name || "Vzdálený uživatel"}
                  </p>
                  <p className="mt-1 text-xs">
                    {transportReady
                      ? "Diagnostické příkazy budou odesílány přes tento OBD transport."
                      : "Zdroj je vybraný, ale momentálně není online."}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* 1. VÝBĚR VOZIDLA */}
          <section className="overflow-hidden rounded-xl border border-slate-500 bg-white">
            <div className="border-b border-slate-400 bg-slate-200 px-3 py-2 text-sm font-bold">
              1. Vyber vozidlo
            </div>

            <div className="space-y-3 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label className="text-xs font-bold text-slate-700">VIN</Label>
                  <Input
                    value={vin}
                    maxLength={17}
                    onChange={(event) => setVin(event.target.value.toUpperCase())}
                    placeholder="17 znaků VIN"
                    className="mt-1 border-slate-400 bg-white font-mono text-slate-950"
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={decodeVin}
                  disabled={vin.length < 3}
                  className="self-end border border-slate-500"
                >
                  Identifikovat
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label className="text-xs font-bold text-slate-700">Značka</Label>
                  <Select
                    value={make}
                    onValueChange={(value) => {
                      setMake(value);
                      resetBelow("make");
                    }}
                  >
                    <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                      <SelectValue placeholder="Vyber značku" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {makes.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700">Model</Label>
                  <Select
                    value={model}
                    onValueChange={(value) => {
                      setModel(value);
                      resetBelow("model");
                    }}
                    disabled={!make}
                  >
                    <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                      <SelectValue placeholder="Vyber model" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {models.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700">Generace</Label>
                  <Select
                    value={generation}
                    onValueChange={(value) => {
                      setGeneration(value);
                      resetBelow("generation");
                    }}
                    disabled={!model}
                  >
                    <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                      <SelectValue placeholder="Vyber generaci" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {generations.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700">Modelový rok</Label>
                  <Select
                    value={year}
                    onValueChange={(value) => {
                      setYear(value);
                      resetBelow("year");
                    }}
                    disabled={!generation}
                  >
                    <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                      <SelectValue placeholder="Vyber rok" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {years.map((value) => (
                        <SelectItem key={value} value={String(value)}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-2">
                  <Label className="text-xs font-bold text-slate-700">Motor</Label>
                  <Select
                    value={profileId}
                    onValueChange={(value) => {
                      setProfileId(value);
                      setEcuAddress("__all");
                      setSelected(null);
                      setResult(null);
                      setScanResults([]);
                    }}
                    disabled={!year}
                  >
                    <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                      <SelectValue placeholder="Vyber motor" />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {matchingProfiles.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.engine} · {item.engineCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </section>

          {/* 2. VÝBĚR SYSTÉMU */}
          <section className="overflow-hidden rounded-xl border border-slate-500 bg-white">
            <div className="border-b border-slate-400 bg-slate-200 px-3 py-2 text-sm font-bold">
              2. Vyber systém
            </div>

            <div className="space-y-3 p-3">
              <div>
                <Label className="text-xs font-bold text-slate-700">
                  Řídicí jednotka / systém
                </Label>
                <Select
                  value={ecuAddress}
                  onValueChange={(value) => {
                    setEcuAddress(value);
                    setSelected(null);
                    setResult(null);
                  }}
                  disabled={!profile || loadingCatalog}
                >
                  <SelectTrigger className="mt-1 border-slate-400 bg-white text-slate-950">
                    <SelectValue placeholder="Vyber systém" />
                  </SelectTrigger>
                  <SelectContent className="max-h-96">
                    <SelectItem value="__all">Všechny dostupné systémy</SelectItem>
                    {availableEcus.map((ecu) => {
                      const addr = normalizeAddress(ecu.address);
                      const recommended = recommendedEcuAddresses.has(addr);
                      const wasProbed = probedEcus.has(addr);
                      const isDetected = detectedEcus.has(addr);
                      const badge = isDetected
                        ? " · ✓ dostupná"
                        : wasProbed
                          ? " · ✗ neodpovídá"
                          : recommended
                            ? " · doporučená"
                            : "";
                      return (
                        <SelectItem
                          key={addr}
                          value={ecu.address}
                          className={
                            isDetected
                              ? "font-semibold text-emerald-700"
                              : wasProbed
                                ? "text-slate-400"
                                : ""
                          }
                        >
                          {ecu.common || ecu.name} [{addr}]{badge}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={detectAvailableEcus}
                  disabled={detectingEcus || !transportReady || availableEcus.length === 0}
                  className="border-emerald-500 text-emerald-800 hover:bg-emerald-50"
                >
                  {detectingEcus ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Auto-detekce ECU (bezpečné)
                </Button>
                {detectedEcus.size > 0 && (
                  <Badge variant="outline" className="border-emerald-600 text-emerald-700">
                    Nalezeno {detectedEcus.size} / {probedEcus.size}
                  </Badge>
                )}
                {detectingEcus && detectProgress && (
                  <span className="text-xs text-slate-600">{detectProgress}</span>
                )}
              </div>

              <div className="rounded-lg border border-slate-400 bg-slate-100 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Car className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                  <div className="min-w-0">
                    <p className="font-bold">
                      {profile
                        ? `${profile.make} ${profile.model} ${profile.generation}`
                        : "Vozidlo není vybrané"}
                    </p>
                    <p className="text-xs text-slate-600">
                      {profile
                        ? `${year} · ${profile.engine} · ${profile.engineCode}`
                        : "Vyber vozidlo shora dolů"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {selectedEcu?.common ||
                        selectedEcu?.name ||
                        "Všechny dostupné systémy"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Katalog obsahuje {availableEcus.length} jednotek
                      {recommendedEcuAddresses.size > 0
                        ? ` · doporučených ${recommendedEcuAddresses.size}`
                        : ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3. DIAGNOSTICKÉ FUNKCE */}
          <section className="overflow-hidden rounded-xl border border-slate-500 bg-white">
            <div className="border-b border-slate-400 bg-slate-200 px-3 py-2 text-sm font-bold">
              3. Diagnostické funkce
            </div>

            <div className="divide-y divide-slate-300">
              {/* DTC */}
              <div>
                <button
                  type="button"
                  onClick={() => togglePanel("dtc")}
                  className="flex w-full items-center gap-3 px-3 py-4 text-left hover:bg-slate-100"
                >
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-950">Diagnostika závad</p>
                    <p className="text-xs text-slate-600">
                      Načíst nebo vymazat chyby ve všech dostupných jednotkách
                    </p>
                  </div>
                  {openPanel === "dtc" ? (
                    <ChevronDown className="h-5 w-5 text-slate-600" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-600" />
                  )}
                </button>

                {openPanel === "dtc" && (
                  <div className="space-y-3 border-t border-slate-300 bg-slate-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        onClick={scanAllFaults}
                        disabled={fullScanRunning || fullClearRunning || !transportReady}
                        className="bg-blue-700 hover:bg-blue-600"
                      >
                        {fullScanRunning ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Načíst všechny chyby
                      </Button>

                      <Button
                        onClick={clearAllFaults}
                        disabled={fullScanRunning || fullClearRunning || !transportReady}
                        variant="destructive"
                      >
                        {fullClearRunning ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Eraser className="mr-2 h-4 w-4" />
                        )}
                        Smazat všechny chyby
                      </Button>
                    </div>

                    {(fullScanRunning || fullClearRunning) && (
                      <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{scanProgress || "Probíhá diagnostika…"}</span>
                        </div>
                      </div>
                    )}

                    {scanResults.length > 0 && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-400 bg-white p-3 text-center">
                          <div>
                            <p className="text-lg font-black">{scanResults.length}</p>
                            <p className="text-[10px] uppercase text-slate-500">Jednotek</p>
                          </div>
                          <div>
                            <p className="text-lg font-black text-red-700">{totalDtc}</p>
                            <p className="text-[10px] uppercase text-slate-500">DTC</p>
                          </div>
                          <div>
                            <p className="text-lg font-black text-emerald-700">
                              {
                                scanResults.filter(
                                  (item) =>
                                    item.stored?.status === "ok" &&
                                    collectCodes(item.stored).length +
                                      collectCodes(item.pending).length +
                                      collectCodes(item.permanent).length ===
                                      0,
                                ).length
                              }
                            </p>
                            <p className="text-[10px] uppercase text-slate-500">Bez chyb</p>
                          </div>
                        </div>

                        {scanResults.map((item) => {
                          const storedCodes = collectCodes(item.stored);
                          const pendingCodes = collectCodes(item.pending);
                          const permanentCodes = collectCodes(item.permanent);
                          const allCodes = [
                            ...storedCodes.map((code) => ({ code, type: "Uložená" })),
                            ...pendingCodes.map((code) => ({ code, type: "Čekající" })),
                            ...permanentCodes.map((code) => ({ code, type: "Trvalá" })),
                          ];
                          const respondedOk = item.stored?.status === "ok";
                          const ecuFailStatus = item.stored?.status;
                          const badgeLabel =
                            allCodes.length > 0
                              ? `${allCodes.length} chyb`
                              : respondedOk
                                ? "Bez chyb"
                                : ecuFailStatus === "timeout"
                                  ? "Timeout"
                                  : ecuFailStatus === "no_data"
                                    ? "Bez dat"
                                    : "Nedostupná";
                          const badgeClass = allCodes.length > 0
                            ? "border-red-400 text-red-700"
                            : respondedOk
                              ? "border-emerald-400 text-emerald-700"
                              : "border-amber-400 text-amber-800";
                          const icon = allCodes.length > 0
                            ? <CircleX className="h-5 w-5 shrink-0 text-red-600" />
                            : respondedOk
                              ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                              : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />;

                          return (
                            <details
                              key={normalizeAddress(item.ecu.address)}
                              className="overflow-hidden rounded-lg border border-slate-400 bg-white"
                              open={allCodes.length > 0 || !respondedOk}
                            >
                              <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3">
                                {icon}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-bold">
                                    {item.ecu.common || item.ecu.name}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    ECU {normalizeAddress(item.ecu.address)} · {allCodes.length} DTC
                                  </p>
                                </div>
                                <Badge variant="outline" className={badgeClass}>
                                  {badgeLabel}
                                </Badge>
                              </summary>

                              <div className="space-y-2 border-t border-slate-300 bg-slate-50 p-3">
                                {item.clear && (
                                  <p className="text-xs text-slate-600">
                                    Mazání: <strong>{resultText(item.clear)}</strong>
                                  </p>
                                )}

                                {allCodes.length === 0 && respondedOk ? (
                                  <p className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                                    Jednotka odpověděla a nehlásí žádný dekódovaný DTC.
                                  </p>
                                ) : allCodes.length === 0 ? (
                                  (() => {
                                    const explain = explainStatus(item.stored);
                                    return (
                                      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
                                        <p className="font-bold">
                                          {explain?.title || `Jednotka nevrátila platná DTC data (stav: ${resultText(item.stored)}).`}
                                        </p>
                                        {explain?.causes && (
                                          <ul className="list-disc pl-5 text-xs space-y-0.5">
                                            {explain.causes.map((c) => <li key={c}>{c}</li>)}
                                          </ul>
                                        )}
                                      </div>
                                    );
                                  })()
                                ) : (
                                  allCodes.map((entry, index) => {
                                    const info = resolveDTCInfo(entry.code);
                                    return (
                                      <div
                                        key={`${entry.type}-${entry.code}-${index}`}
                                        className="rounded border border-red-300 bg-red-50 p-3"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0 flex-1">
                                            <strong className="font-mono text-red-900">
                                              {entry.code}
                                            </strong>
                                            <p className="mt-1 text-sm font-semibold text-red-950">
                                              {info.description || "Popis chyby není v databázi dostupný."}
                                            </p>
                                            <div className="mt-2 flex flex-wrap gap-1">
                                              {info.category && (
                                                <Badge variant="outline" className="border-red-300 text-red-700">
                                                  {info.category}
                                                </Badge>
                                              )}
                                              {info.severity && (
                                                <Badge variant="outline" className="border-red-300 text-red-700">
                                                  Závažnost: {info.severity}
                                                </Badge>
                                              )}
                                            </div>
                                          </div>
                                          <Badge variant="outline" className="shrink-0 border-red-300 text-red-700">
                                            {entry.type}
                                          </Badge>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}

                                <details className="rounded border border-slate-300 bg-white">
                                  <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-600">
                                    Technické výsledky
                                  </summary>
                                  <div className="space-y-1 border-t border-slate-200 p-3 text-xs text-slate-600">
                                    <p>Uložené: {resultText(item.stored)}</p>
                                    <p>Čekající: {resultText(item.pending)}</p>
                                    <p>Trvalé: {resultText(item.permanent)}</p>
                                  </div>
                                </details>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    )}

                    {scanResults.length === 0 && !fullScanRunning && !fullClearRunning && (
                      <div className="rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-600">
                        Stiskni <strong>Načíst všechny chyby</strong>. Aplikace projde dostupné
                        řídicí jednotky postupně a zobrazí výsledky podle systému.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* LIVE */}
              <FunctionPanelHeader
                panel="live"
                openPanel={openPanel}
                title="Živá data"
                description={`${liveFunctions.length} položek · rozděleno do skupin`}
                icon={<Gauge className="h-5 w-5 text-blue-700" />}
                onToggle={togglePanel}
              />

              {/* ACTUATORS */}
              <FunctionPanelHeader
                panel="actuators"
                openPanel={openPanel}
                title="Testy akčních členů"
                description={`${actuatorFunctions.length} funkcí · všechny dostupné`}
                icon={<Activity className="h-5 w-5 text-violet-700" />}
                onToggle={togglePanel}
              />

              {/* SERVICE */}
              <FunctionPanelHeader
                panel="service"
                openPanel={openPanel}
                title="Servisní funkce"
                description={`${serviceFunctions.length} funkcí · rozbal, vyber a spusť`}
                icon={<Wrench className="h-5 w-5 text-amber-700" />}
                onToggle={togglePanel}
              />

              {/* ECU INFO */}
              <div>
                <button
                  type="button"
                  onClick={() => togglePanel("ecuInfo")}
                  className="flex w-full items-center gap-3 px-3 py-4 text-left hover:bg-slate-100"
                >
                  <Info className="h-5 w-5 text-slate-700" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-950">Informace o ECU</p>
                    <p className="text-xs text-slate-600">
                      Vybraná jednotka, adresa, katalog a vozidlo
                    </p>
                  </div>
                  {openPanel === "ecuInfo" ? (
                    <ChevronDown className="h-5 w-5 text-slate-600" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-600" />
                  )}
                </button>

                {openPanel === "ecuInfo" && (
                  <div className="space-y-2 border-t border-slate-300 bg-slate-50 p-3">
                    <InfoRow label="Výrobce" value={brand?.display_name || "—"} />
                    <InfoRow label="Vozidlo" value={profile ? `${profile.make} ${profile.model}` : "—"} />
                    <InfoRow label="Generace" value={profile?.generation || "—"} />
                    <InfoRow label="Rok" value={year || "—"} />
                    <InfoRow label="Motor" value={profile ? `${profile.engine} (${profile.engineCode})` : "—"} />
                    <InfoRow label="ECU" value={selectedEcu?.common || selectedEcu?.name || "Všechny"} />
                    <InfoRow label="TX adresa" value={selectedEcu ? normalizeAddress(selectedEcu.address) : "—"} />
                    <InfoRow label="Katalog" value={brand?.file || "—"} />
                  </div>
                )}
              </div>

              {(openPanel === "live" ||
                openPanel === "actuators" ||
                openPanel === "service") && (
                <div className="space-y-3 border-t border-slate-300 bg-slate-50 p-3">
                  {openPanel === "live" && (
                    <LiveDataPanel
                      liveFunctions={liveFunctions}
                      activeContext={activeContext}
                      transportReady={transportReady}
                      vehicleSelected={!!profile}
                      ecuSelected={ecuAddress !== "__all"}
                      resetKey={liveResetKey}
                    />
                  )}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={`Hledat v sekci ${panelTitles[openPanel]}…`}
                      className="border-slate-400 bg-white pl-9 text-slate-950"
                    />
                  </div>

                  {(openPanel === "actuators" || openPanel === "service") && (
                    <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
                      <div className="flex items-start gap-2">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>
                          Všechny katalogové funkce jsou viditelné a spustitelné.
                          Neověřená funkce před spuštěním zobrazí varování.
                        </p>
                      </div>
                    </div>
                  )}

                  {loadingCatalog ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Načítám katalog…
                    </div>
                  ) : functionGroups.length === 0 ? (
                    <p className="rounded-lg border border-slate-300 bg-white p-5 text-center text-sm text-slate-600">
                      Pro tento výběr nejsou v katalogu žádné položky.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {functionGroups.map((ecuGroup) => (
                        <details
                          key={ecuGroup.ecuAddress}
                          className="overflow-hidden rounded-lg border border-slate-500 bg-white"
                          open={ecuAddress !== "__all"}
                        >
                          <summary className="flex cursor-pointer list-none items-center gap-3 bg-slate-200 px-3 py-3">
                            <Cpu className="h-5 w-5 shrink-0 text-blue-800" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-black text-slate-950">
                                {ecuGroup.ecuLabel}
                              </p>
                              <p className="text-[11px] text-slate-600">
                                {ecuGroup.ecuAddress === "GENERAL"
                                  ? "Obecné funkce"
                                  : `Adresa ${ecuGroup.ecuAddress}`}
                              </p>
                            </div>
                            <Badge variant="outline" className="border-slate-500 text-slate-800">
                              {ecuGroup.categories.reduce(
                                (sum, category) => sum + category.items.length,
                                0,
                              )}
                            </Badge>
                            <ChevronDown className="h-4 w-4 text-slate-600" />
                          </summary>

                          <div className="space-y-2 border-t border-slate-400 bg-slate-50 p-2">
                            {ecuGroup.categories.map((categoryGroup) => (
                              <details
                                key={`${ecuGroup.ecuAddress}:${categoryGroup.category}`}
                                className="overflow-hidden rounded-lg border border-slate-300 bg-white"
                              >
                                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3">
                                  <ClipboardList className="h-4 w-4 shrink-0 text-blue-700" />
                                  <span className="min-w-0 flex-1 truncate font-bold text-slate-950">
                                    {categoryGroup.category}
                                  </span>
                                  <Badge variant="outline" className="border-slate-400 text-slate-700">
                                    {categoryGroup.items.length}
                                  </Badge>
                                  <ChevronDown className="h-4 w-4 text-slate-600" />
                                </summary>

                                <div className="divide-y divide-slate-200 border-t border-slate-300">
                                  {categoryGroup.items.map((fn) => (
                                    <button
                                      type="button"
                                      key={fn.id}
                                      onClick={() => {
                                        setSelected(fn);
                                        setResult(null);
                                      }}
                                      className={`flex w-full items-start gap-3 px-3 py-3 text-left ${
                                        selected?.id === fn.id
                                          ? "bg-blue-50"
                                          : "bg-white hover:bg-slate-50"
                                      }`}
                                    >
                                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-500" />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="font-bold text-slate-950">{fn.name}</p>
                                          {isWriteFunction(fn) && (
                                            <Badge
                                              variant="outline"
                                              className="border-amber-400 text-[10px] text-amber-800"
                                            >
                                              ODBORNÝ REŽIM
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="mt-1 text-xs text-slate-600">
                                          {fn.description || "Bez dalšího popisu v katalogu."}
                                        </p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </details>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}

                  {selected && (
                    <div className="overflow-hidden rounded-xl border border-slate-500 bg-white">
                      <div className="border-b border-slate-400 bg-slate-200 px-4 py-3">
                        <p className="text-xs font-bold uppercase text-slate-500">
                          Vybraná funkce
                        </p>
                        <h3 className="mt-1 text-lg font-black text-slate-950">
                          {selected.name}
                        </h3>
                      </div>

                      <div className="space-y-3 p-4 text-slate-950">
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-500">Popis</p>
                          <p className="mt-1 text-sm">
                            {selected.description || "K funkci není v katalogu další popis."}
                          </p>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <InfoRow
                            label="Cílová ECU"
                            value={selected.ecuCommonName || selected.ecu || selectedEcu?.common || selectedEcu?.name || "—"}
                          />
                          <InfoRow
                            label="Adresa"
                            value={normalizeAddress(selected.ecuAddress || selectedEcu?.address) || "—"}
                          />
                          <InfoRow label="Kategorie" value={selected.category || "—"} />
                          <InfoRow label="Příkaz" value={selected.command || "—"} mono />
                        </div>

                        {isWriteFunction(selected) && (
                          <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
                            <p className="font-bold">Podmínky před spuštěním</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                              <li>Zkontroluj správně vybranou řídicí jednotku.</li>
                              <li>Zapalování a motor nastav podle požadavků funkce.</li>
                              <li>Zajisti stabilní napětí baterie.</li>
                              <li>Neodpojuj adaptér během provádění.</li>
                            </ul>
                          </div>
                        )}

                        {selected.safetyWarning && (
                          <div className="rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-900">
                            {selected.safetyWarning}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelected(null);
                              setResult(null);
                            }}
                            className="border-slate-500"
                          >
                            Zrušit
                          </Button>
                          <Button
                            onClick={runSelected}
                            disabled={running || !transportReady}
                            className="bg-blue-700 hover:bg-blue-600"
                          >
                            {running ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="mr-2 h-4 w-4" />
                            )}
                            {running ? "Provádím…" : "Start"}
                          </Button>
                        </div>

                        {!transportReady && (
                          <p className="text-center text-xs font-bold text-red-700">
                            Nejdřív v kroku 0 vyber online OBD zdroj.
                          </p>
                        )}

                        {result && (
                          <div className="space-y-3 rounded-xl border border-slate-400 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-black">Výsledek</p>
                              <Badge variant="outline" className={statusClass(result.status)}>
                                {result.status.toUpperCase()}
                              </Badge>
                            </div>

                            {result.decoded.length > 0 && (
                              <div className="space-y-1.5">
                                {result.decoded.map((value, index) => (
                                  <div
                                    key={`${value.name}-${index}`}
                                    className="flex items-center justify-between gap-3 rounded border border-slate-300 bg-white p-2 text-sm"
                                  >
                                    <span className="text-slate-600">{value.name}</span>
                                    <strong>
                                      {String(value.value ?? "—")} {value.unit || ""}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            )}

                            {(() => {
                              const explain = explainStatus(result);
                              if (!explain) return null;
                              return (
                                <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
                                  <p className="font-bold">{explain.title}</p>
                                  {explain.causes.length > 0 && (
                                    <>
                                      <p className="text-xs font-semibold uppercase text-amber-800">Možné příčiny</p>
                                      <ul className="list-disc pl-5 text-xs space-y-0.5">
                                        {explain.causes.map((c) => <li key={c}>{c}</li>)}
                                      </ul>
                                    </>
                                  )}
                                </div>
                              );
                            })()}

                            {result.nrc && (
                              <div className="rounded border border-orange-400 bg-orange-50 p-3 text-sm text-orange-900">
                                <p className="font-bold">
                                  NRC {result.nrc.code}: {result.nrc.description || "Negativní odpověď ECU"}
                                </p>
                              </div>
                            )}

                            {result.error && (
                              <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900">
                                {result.error}
                              </div>
                            )}

                            <Tabs defaultValue="summary">
                              <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="summary">Souhrn</TabsTrigger>
                                <TabsTrigger value="technical">Technické</TabsTrigger>
                              </TabsList>
                              <TabsContent value="summary" className="space-y-1 text-sm">
                                <p>Doba odezvy: {result.durationMs} ms</p>
                                <p>Stav: {result.status}</p>
                                <p>Transport: {usingLocalTransport ? "Lokální BLE" : usingRemoteTransport ? `Vzdálený (${selectedRemoteSession?.profile_name || "?"})` : "—"}</p>
                              </TabsContent>
                              <TabsContent value="technical" className="space-y-2 text-xs">
                                <div className="grid grid-cols-2 gap-2">
                                  <InfoRow label="TX (AT SH)" value={normalizeAddress(activeContext?.manualTx || activeContext?.ecuAddress || selected?.ecuAddress) || "default"} mono />
                                  <InfoRow label="RX (AT CRA)" value={normalizeAddress(activeContext?.manualRx || activeContext?.responseHeader) || "auto"} mono />
                                  <InfoRow label="ECU" value={activeContext?.ecuName || selected?.ecu || "—"} />
                                  <InfoRow label="Profil ELM" value={selected?.isOem ? "debug (ATH1)" : "simple (ATH0)"} />
                                </div>
                                <p className="break-all">
                                  <strong>Příkaz:</strong> {result.command}
                                </p>
                                <p className="break-all">
                                  <strong>Cleaned:</strong> <span className="font-mono">{result.cleanedResponse || "—"}</span>
                                </p>
                                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-3 text-slate-100">
                                  {result.rawResponse || "Bez odpovědi"}
                                </pre>
                                {result.warnings.length > 0 && (
                                  <div className="rounded border border-slate-300 bg-white p-2">
                                    <p className="text-[10px] font-bold uppercase text-slate-500">Warnings</p>
                                    <ul className="mt-1 list-disc pl-5 space-y-0.5">
                                      {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                    </ul>
                                  </div>
                                )}
                              </TabsContent>
                            </Tabs>

                            <Button
                              variant="outline"
                              className="w-full border-slate-500"
                              onClick={() => setResult(null)}
                            >
                              OK
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* WOW/Würth katalog – pouze metadata a nápověda, viz src/components/admin/delphi/AdminDelphiWow.tsx */}
          <section className="overflow-hidden rounded-xl border border-slate-500 bg-white">
            <button
              type="button"
              onClick={() => setWowOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 border-b border-slate-400 bg-slate-200 px-3 py-2 text-left text-sm font-bold"
            >
              <span>WOW / Würth katalog (metadata + nápověda)</span>
              {wowOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {wowOpen ? (
              <div className="p-3">
                <Suspense fallback={<div className="flex items-center gap-2 p-4 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Načítám WOW modul…</div>}>
                  <AdminDelphiWowLazy
                    vehicleContext={{
                      vin: vin || null,
                      brandKey: brand?.key ?? null,
                      brandLabel: brand?.display_name ?? null,
                      make: make || null,
                      model: model || null,
                      generation: generation || null,
                      year: year || null,
                      ecuName: selectedEcu?.common || selectedEcu?.name || null,
                      ecuAddress: selectedEcu?.address ?? null,
                      selectedFunction: selected?.name ?? null,
                    }}
                  />
                </Suspense>
              </div>
            ) : null}

          </section>
        </div>
      </div>

      <DeveloperConfirmDialog
        open={devConfirm !== null}
        details={devConfirm}
        onCancel={() => { setDevConfirm(null); setDevPending(null); }}
        onConfirm={async () => {
          const runner = devPending;
          setDevConfirm(null);
          setDevPending(null);
          if (runner) await runner();
        }}
      />
    </div>
  );
}

function FunctionPanelHeader({
  panel,
  openPanel,
  title,
  description,
  icon,
  onToggle,
}: {
  panel: PanelKey;
  openPanel: PanelKey | null;
  title: string;
  description: string;
  icon: ReactNode;
  onToggle: (panel: PanelKey) => void;
}) {
  const open = panel === openPanel;
  return (
    <button
      type="button"
      onClick={() => onToggle(panel)}
      className="flex w-full items-center gap-3 px-3 py-4 text-left hover:bg-slate-100"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-slate-950">{title}</p>
        <p className="text-xs text-slate-600">{description}</p>
      </div>
      {open ? (
        <ChevronDown className="h-5 w-5 text-slate-600" />
      ) : (
        <ChevronRight className="h-5 w-5 text-slate-600" />
      )}
    </button>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded border border-slate-300 bg-white p-2">
      <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
      <p className={`mt-0.5 break-words text-sm text-slate-950 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}
