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
  Send,
  RefreshCw,
  Trash2,
  ListChecks,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  { id: "connect", icon: Bluetooth, label: "PÅipojenÃ­", group: "pÅipojenÃ­" },
  { id: "dashboard", icon: Gauge, label: "Å½ivÄ", group: "vizualizace" },
  { id: "vehicle3d", icon: Car, label: "3D", group: "vizualizace" },
  { id: "trends", icon: TrendingUp, label: "Trendy", group: "vizualizace" },
  { id: "dtc", icon: Wrench, label: "DTC", group: "diagnostika" },
  { id: "smart", icon: Brain, label: "AI", group: "diagnostika" },
  { id: "coding", icon: Settings2, label: "KÃ³dovÃ¡nÃ­", group: "diagnostika" },
  { id: "orchestrator", icon: Layers, label: "Auto", group: "diagnostika" },
  { id: "uds", icon: Database, label: "UDS", group: "analÃ½za" },
  { id: "reverse", icon: Search, label: "RE", group: "analÃ½za" },
  { id: "discover", icon: Radar, label: "Sken", group: "analÃ½za" },
  { id: "can", icon: Activity, label: "CAN", group: "analÃ½za" },
  { id: "decoder", icon: Cpu, label: "DekodÃ©r", group: "nÃ¡stroje" },
  { id: "logging", icon: ScrollText, label: "ZÃ¡znam", group: "nÃ¡stroje" },
  { id: "terminal", icon: Terminal, label: "TerminÃ¡l", group: "nÃ¡stroje" },
  { id: "devmode", icon: Code, label: "Dev", group: "nÃ¡stroje" },
  { id: "security", icon: Shield, label: "Flash", group: "nÃ¡stroje" },
  { id: "settings", icon: Settings, label: "NastavenÃ­", group: "nastavenÃ­" },
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
  const [customRemoteCommand, setCustomRemoteCommand] = useState("");
  const queryClient = useQueryClient();

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
  const { data: remoteCommands = [] } = useQuery({
    queryKey: ["admin-obd-remote-commands", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];

      const { data, error } = await supabase
        .from("obd_remote_commands")
        .select("*")
        .eq("user_id", selectedUserId)
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedUserId,
    refetchInterval: 1500,
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

  const sendRemoteCommand = useCallback(async (commandType: string, commandPayload: Record<string, unknown> = {}) => {
    if (!selectedUserId) return;

    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("obd_remote_commands").insert({
      user_id: selectedUserId,
      command_type: commandType,
      command_payload: commandPayload as any,
      status: "pending",
      created_by: authData.user?.id ?? null,
    });

    if (error) {
      toast({ title: "PÅÃ­kaz se nepodaÅilo odeslat", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "VzdÃ¡lenÃ½ pÅÃ­kaz odeslÃ¡n", description: commandType });
    queryClient.invalidateQueries({ queryKey: ["admin-obd-remote-commands", selectedUserId] });
  }, [queryClient, selectedUserId]);

  const sendCustomRemoteCommand = useCallback(async () => {
    const command = customRemoteCommand.trim().toUpperCase();
    if (!command) return;
    setCustomRemoteCommand("");
    await sendRemoteCommand("custom_command", { command });
  }, [customRemoteCommand, sendRemoteCommand]);

  const statusClass = (status: string) => {
    if (status === "done") return "bg-success/15 text-success border-success/30";
    if (status === "error") return "bg-destructive/15 text-destructive border-destructive/30";
    if (status === "running") return "bg-primary/15 text-primary border-primary/30";
    return "bg-muted text-muted-foreground border-border";
  };

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
            <span className="font-semibold text-sm">VÃ½bÄr zÃ¡kaznÃ­ka a vozidla</span>
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
                <SelectValue placeholder="Vyberte zÃ¡kaznÃ­ka..." />
              </SelectTrigger>
              <SelectContent>
                {profiles.map(p => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name || p.email || "Bez jmÃ©na"}
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
                <SelectValue placeholder={selectedUserId ? "Vyberte vozidlo..." : "Nejprve vyberte zÃ¡kaznÃ­ka"} />
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
              <Badge variant="secondary">{selectedProfile.full_name || selectedProfile.email || "ZÃ¡kaznÃ­k"}</Badge>

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

      {selectedUserId && (
        <AdminObdPermissions
          userId={selectedUserId}
          userLabel={selectedProfile?.full_name || selectedProfile?.email || undefined}
        />
      )}
      {selectedUserId && (
        <Card className="border-primary/20">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-primary" /> VzdÃ¡lenÃ© ovlÃ¡dÃ¡nÃ­ zÃ¡kaznickÃ© diagnostiky
                </h3>
                <p className="text-xs text-muted-foreground">
                  PÅÃ­kazy se zapÃ­Å¡ou do Supabase a provede je zÃ¡kaznickÃ¡ aplikace v globÃ¡lnÃ­m OBD contextu.
                </p>
              </div>
              {customerObdSession ? (
                <Badge className="bg-success/15 text-success border-success/30">aktivnÃ­ relace</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">offline / bez relace</Badge>
              )}
            </div>

            {customerObdSession && (
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-muted/30 p-3">
                  <strong>Live data zÃ¡kaznÃ­ka</strong>
                  <pre className="mt-2 max-h-44 overflow-auto text-[10px] whitespace-pre-wrap">
                    {JSON.stringify(customerObdSession.payload || {}, null, 2)}
                  </pre>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <strong>DTC zÃ¡kaznÃ­ka</strong>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Array.isArray(customerObdSession.dtcs) && customerObdSession.dtcs.length > 0 ? (
                      customerObdSession.dtcs.map((d: any, i: number) => (
                        <Badge key={i} variant="outline">{typeof d === "string" ? d : d.code}</Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">Å½Ã¡dnÃ© uloÅ¾enÃ© DTC v relaci.</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Heartbeat: {new Date(customerObdSession.last_seen).toLocaleString("cs-CZ")}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => sendRemoteCommand("read_dtc")} disabled={!customerObdSession}>
                <ListChecks className="w-3.5 h-3.5 mr-1" /> ÄÃ­st DTC
              </Button>
              <Button size="sm" variant="outline" onClick={() => sendRemoteCommand("clear_dtc")} disabled={!customerObdSession}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Mazat DTC
              </Button>
              <Button size="sm" variant="outline" onClick={() => sendRemoteCommand("refresh_live")} disabled={!customerObdSession}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh live dat
              </Button>
            </div>

            <div className="flex gap-2">
              <Input
                value={customRemoteCommand}
                onChange={(e) => setCustomRemoteCommand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendCustomRemoteCommand()}
                placeholder="VlastnÃ­ OBD/AT pÅÃ­kaz, napÅ. 010C"
                className="font-mono text-xs"
                disabled={!customerObdSession}
              />
              <Button size="sm" onClick={sendCustomRemoteCommand} disabled={!customerObdSession || !customRemoteCommand.trim()}>
                <Send className="w-3.5 h-3.5 mr-1" /> Odeslat
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold">Stav poslednÃ­ch pÅÃ­kazÅ¯</p>
              {remoteCommands.length === 0 ? (
                <p className="text-xs text-muted-foreground">ZatÃ­m Å¾Ã¡dnÃ© vzdÃ¡lenÃ© pÅÃ­kazy.</p>
              ) : (
                <div className="space-y-2">
                  {remoteCommands.map((cmd: any) => (
                    <div key={cmd.id} className="rounded-lg border border-border/30 p-2 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono">{cmd.command_type}</span>
                        <Badge variant="outline" className={statusClass(cmd.status)}>{cmd.status}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{new Date(cmd.created_at).toLocaleString("cs-CZ")}</p>
                      {cmd.result && (
                        <pre className="bg-muted/30 rounded p-2 text-[10px] overflow-auto max-h-28">
                          {JSON.stringify(cmd.result, null, 2)}
                        </pre>
                      )}
                      {cmd.error && <p className="text-[10px] text-destructive">{cmd.error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}



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