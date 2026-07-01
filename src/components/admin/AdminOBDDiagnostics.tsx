import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gauge,
  Bluetooth,
  Terminal,
  Settings,
  Database,
  Radar,
  Activity,
  Brain,
  ScrollText,
  Cpu,
  Code,
  Car,
  TrendingUp,
  Shield,
  Layers,
  Search,
  Settings2,
  Wrench,
  Users,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

import { BLEConnectionView } from "@/components/obd/BLEConnectionView";
import { InteractiveDashboard } from "@/components/obd/InteractiveDashboard";
import { TerminalView } from "@/components/obd/TerminalView";
import { DTCView } from "@/components/obd/DTCView";
import { CANAnalyzerView } from "@/components/obd/CANAnalyzerView";
import { SmartDashboard } from "@/components/obd/SmartDashboard";
import { CodingView } from "@/components/obd/CodingView";
import { StatusBar as OBDStatusBar } from "@/components/obd/StatusBar";
import AdminObdPermissions from "@/components/admin/AdminObdPermissions";

import { useBLE, useELM327, useLiveData } from "@/hooks/obd/use-obd";
import { bleManager } from "@/lib/obd/ble-manager";

import { lazy, Suspense } from "react";

const UDSView = lazy(() => import("@/components/obd/UDSView").then(m => ({ default: m.UDSView })));
const LoggingView = lazy(() => import("@/components/obd/LoggingView").then(m => ({ default: m.LoggingView })));
const SensorDecoderView = lazy(() => import("@/components/obd/SensorDecoderView").then(m => ({ default: m.SensorDecoderView })));
const DiscoveryView = lazy(() => import("@/components/obd/DiscoveryView").then(m => ({ default: m.DiscoveryView })));
const ReverseEngineeringView = lazy(() => import("@/components/obd/ReverseEngineeringView").then(m => ({ default: m.ReverseEngineeringView })));
const OrchestrationPanel = lazy(() => import("@/components/obd/OrchestrationPanel").then(m => ({ default: m.OrchestrationPanel })));
const SecurityFlashView = lazy(() => import("@/components/obd/SecurityFlashView").then(m => ({ default: m.SecurityFlashView })));
const TrendChartsView = lazy(() => import("@/components/obd/TrendChartsView").then(m => ({ default: m.TrendChartsView })));
const DevModeView = lazy(() => import("@/components/obd/DevModeView").then(m => ({ default: m.DevModeView })));
const SettingsView = lazy(() => import("@/components/obd/SettingsView").then(m => ({ default: m.SettingsView })));

type Tab =
  | "dashboard"
  | "dtc"
  | "coding"
  | "can"
  | "connect"
  | "uds"
  | "discover"
  | "decoder"
  | "logging"
  | "terminal"
  | "devmode"
  | "security"
  | "smart"
  | "orchestrator"
  | "trends"
  | "vehicle3d"
  | "reverse"
  | "settings";

const TABS: { id: Tab; icon: typeof Gauge; label: string; group: string }[] = [
  { id: "connect", icon: Bluetooth, label: "Připojení", group: "připojení" },
  { id: "dashboard", icon: Gauge, label: "Živě", group: "vizualizace" },
  { id: "vehicle3d", icon: Car, label: "3D", group: "vizualizace" },
  { id: "trends", icon: TrendingUp, label: "Trendy", group: "vizualizace" },
  { id: "dtc", icon: Wrench, label: "DTC", group: "diagnostika" },
  { id: "smart", icon: Brain, label: "AI", group: "diagnostika" },
  { id: "coding", icon: Settings2, label: "Kódování", group: "diagnostika" },
  { id: "orchestrator", icon: Layers, label: "Auto", group: "diagnostika" },
  { id: "uds", icon: Database, label: "UDS", group: "analýza" },
  { id: "reverse", icon: Search, label: "RE", group: "analýza" },
  { id: "discover", icon: Radar, label: "Sken", group: "analýza" },
  { id: "can", icon: Activity, label: "CAN", group: "analýza" },
  { id: "decoder", icon: Cpu, label: "Dekodér", group: "nástroje" },
  { id: "logging", icon: ScrollText, label: "Záznam", group: "nástroje" },
  { id: "terminal", icon: Terminal, label: "Terminál", group: "nástroje" },
  { id: "devmode", icon: Code, label: "Dev", group: "nástroje" },
  { id: "security", icon: Shield, label: "Flash", group: "nástroje" },
  { id: "settings", icon: Settings, label: "Nastavení", group: "nastavení" },
];

type UserVehicle = {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  license_plate: string | null;
  user_id: string;
};

type Profile = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

const AdminOBDDiagnostics = () => {
  const [activeTab, setActiveTab] = useState<Tab>("connect");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [commandDelay, setCommandDelay] = useState(80);

  const { connectionState, devices, signalQuality, scan, connect, disconnect } = useBLE();
  const { elmState, initSteps, initialize, sendCommand } = useELM327();

  const localLiveData = useLiveData(elmState === "ready" && activeTab === "dashboard");
  const elmReady = elmState === "ready";
  const connectedDevice = bleManager.getConnectedDevice();

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-obd-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .order("full_name");

      if (error) throw error;
      return (data || []) as Profile[];
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["admin-obd-vehicles", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];

      const { data, error } = await supabase
        .from("user_vehicles")
        .select("id, brand, model, year, license_plate, user_id")
        .eq("user_id", selectedUserId);

      if (error) throw error;
      return (data || []) as UserVehicle[];
    },
    enabled: !!selectedUserId,
  });

  const { data: customerObdSession } = useQuery({
    queryKey: ["admin-obd-live-session", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return null;

      const { data, error } = await supabase
        .from("obd_live_sessions")
        .select("*")
        .eq("user_id", selectedUserId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!selectedUserId,
    refetchInterval: 2000,
  });

  const liveData = (customerObdSession?.payload as any) || localLiveData;
  const dashboardActive = elmReady || !!customerObdSession;

  const selectedProfile = profiles.find(p => p.user_id === selectedUserId);
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

  const handleConnect = useCallback(async (deviceId: string) => {
    await connect(deviceId);
  }, [connect]);

  const handleInitialize = useCallback(async () => {
    const success = await initialize();
    if (success) setActiveTab("dashboard");
  }, [initialize]);

  const Fallback = () => (
    <div className="flex items-center justify-center py-12">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Výběr zákazníka a vozidla</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select
              value={selectedUserId || ""}
              onValueChange={(v) => {
                setSelectedUserId(v);
                setSelectedVehicleId(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Vyberte zákazníka..." />
              </SelectTrigger>
              <SelectContent>
                {profiles.map(p => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name || p.email || "Bez jména"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedVehicleId || ""}
              onValueChange={setSelectedVehicleId}
              disabled={!selectedUserId}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedUserId ? "Vyberte vozidlo..." : "Nejprve vyberte zákazníka"} />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.brand} {v.model} {v.year || ""} {v.license_plate ? `(${v.license_plate})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProfile && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{selectedProfile.full_name || selectedProfile.email || "Zákazník"}</Badge>

              {selectedVehicle && (
                <Badge variant="outline">
                  {selectedVehicle.brand} {selectedVehicle.model} {selectedVehicle.year || ""}
                </Badge>
              )}

              {customerObdSession && (
                <Badge variant="default">
                  OBD online
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <OBDStatusBar
        connectionState={connectionState}
        signalQuality={signalQuality}
        device={connectedDevice}
        elmReady={elmReady}
      />

      <div className="flex gap-1 overflow-x-auto scrollbar-none pb-1">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "connect" && (
              <BLEConnectionView
                connectionState={connectionState}
                devices={devices}
                initSteps={initSteps}
                onScan={scan}
                onConnect={handleConnect}
                onDisconnect={disconnect}
                onInitialize={handleInitialize}
              />
            )}

            {activeTab === "dashboard" && (
              <InteractiveDashboard data={liveData} active={dashboardActive} />
            )}

            {activeTab === "dtc" && <DTCView elmReady={elmReady} />}
            {activeTab === "coding" && <CodingView elmReady={elmReady} />}
            {activeTab === "can" && <CANAnalyzerView elmReady={elmReady} />}
            {activeTab === "smart" && <SmartDashboard elmReady={elmReady} />}
            {activeTab === "terminal" && <TerminalView onSend={sendCommand} elmReady={elmReady} />}

            {activeTab === "uds" && (
              <Suspense fallback={<Fallback />}>
                <UDSView elmReady={elmReady} />
              </Suspense>
            )}

            {activeTab === "discover" && (
              <Suspense fallback={<Fallback />}>
                <DiscoveryView elmReady={elmReady} />
              </Suspense>
            )}

            {activeTab === "decoder" && (
              <Suspense fallback={<Fallback />}>
                <SensorDecoderView elmReady={elmReady} />
              </Suspense>
            )}

            {activeTab === "logging" && (
              <Suspense fallback={<Fallback />}>
                <LoggingView elmReady={elmReady} />
              </Suspense>
            )}

            {activeTab === "reverse" && (
              <Suspense fallback={<Fallback />}>
                <ReverseEngineeringView elmReady={elmReady} />
              </Suspense>
            )}

            {activeTab === "orchestrator" && (
              <Suspense fallback={<Fallback />}>
                <OrchestrationPanel />
              </Suspense>
            )}

            {activeTab === "security" && (
              <Suspense fallback={<Fallback />}>
                <SecurityFlashView />
              </Suspense>
            )}

            {activeTab === "trends" && (
              <Suspense fallback={<Fallback />}>
                <TrendChartsView elmReady={elmReady} />
              </Suspense>
            )}

            {activeTab === "devmode" && (
              <Suspense fallback={<Fallback />}>
                <DevModeView onSend={sendCommand} elmReady={elmReady} />
              </Suspense>
            )}

            {activeTab === "settings" && (
              <Suspense fallback={<Fallback />}>
                <SettingsView commandDelay={commandDelay} onDelayChange={setCommandDelay} />
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminOBDDiagnostics;