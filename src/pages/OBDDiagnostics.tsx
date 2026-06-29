import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { bleManager, BLEDeviceInfo } from "@/lib/obd/ble-manager";
import { elm327 } from "@/lib/obd/elm327-engine";
import { LIVE_PIDS, parsePIDResponse } from "@/lib/obd/obd-pids";
import {
  Bluetooth,
  BluetoothConnected,
  Thermometer,
  Gauge,
  AlertTriangle,
  Activity,
  Trash2,
  RefreshCw,
  Wifi,
  WifiOff,
  Zap,
  Fuel,
  Wind,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";

interface OBDData {
  rpm: number;
  coolantTemp: number;
  intakeTemp: number;
  speed: number;
  throttle: number;
  fuelPressure: number;
  engineLoad: number;
  voltage: number;
  boostPressure: number;
}

interface DTCCode {
  code: string;
  description: string;
  severity: "low" | "medium" | "high";
}

const EMPTY_OBD_DATA: OBDData = {
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

const GaugeCircle = ({
  value,
  max,
  label,
  unit,
  color,
  icon: Icon,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
  color: string;
  icon: any;
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="40" fill="none" stroke="hsl(0 0% 12%)" strokeWidth="5" />
          <circle
            cx="48"
            cy="48"
            r="40"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="w-3.5 h-3.5 mb-0.5" style={{ color }} />
          <span className="font-display font-bold text-lg leading-none">{Math.round(value)}</span>
          <span className="text-[9px] text-muted-foreground">{unit}</span>
        </div>
      </div>

      <span className="text-[10px] font-medium text-muted-foreground text-center">{label}</span>
    </div>
  );
};

const LiveGraph = ({
  data,
  label,
  color,
  unit,
}: {
  data: number[];
  label: string;
  color: string;
  unit: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "hsl(0 0% 15%)";
    ctx.lineWidth = 0.5;

    for (let i = 0; i < 5; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (data.length < 2) return;

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;

    ctx.beginPath();

    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [data, color]);

  const currentValue = data.length > 0 ? data[data.length - 1] : 0;

  return (
    <div className="luxury-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className="font-display font-bold text-sm" style={{ color }}>
          {Math.round(currentValue)} {unit}
        </span>
      </div>

      <canvas ref={canvasRef} width={300} height={60} className="w-full h-[60px] rounded-lg" />
    </div>
  );
};

const OBDDiagnostics = () => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [device, setDevice] = useState<BLEDeviceInfo | null>(null);
  const [obdData, setObdData] = useState<OBDData>(EMPTY_OBD_DATA);
  const [dtcCodes, setDtcCodes] = useState<DTCCode[]>([]);
  const [rpmHistory, setRpmHistory] = useState<number[]>([]);
  const [tempHistory, setTempHistory] = useState<number[]>([]);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const sessionUserIdRef = useRef<string | null>(null);
  const lastSessionUpdateRef = useRef<number>(0);

  const createOrUpdateObdSession = async (payload: Partial<OBDData> = {}) => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user) return;

    sessionUserIdRef.current = user.id;

    await supabase.from("obd_live_sessions").upsert(
      {
        user_id: user.id,
        vin: null,
        is_active: true,
        last_seen: new Date().toISOString(),
        payload,
        dtcs: dtcCodes,
      } as any,
      { onConflict: "user_id" }
    );
  };

  const updateLiveSessionPayload = async (nextData: OBDData) => {
    const now = Date.now();

    if (now - lastSessionUpdateRef.current < 2000) return;

    lastSessionUpdateRef.current = now;

    const userId = sessionUserIdRef.current;
    if (!userId) return;

    await supabase
      .from("obd_live_sessions")
      .update({
        is_active: true,
        last_seen: new Date().toISOString(),
        payload: nextData,
        dtcs: dtcCodes,
      } as any)
      .eq("user_id", userId);
  };

  const closeObdSession = async () => {
    const userId = sessionUserIdRef.current;

    if (!userId) return;

    await supabase
      .from("obd_live_sessions")
      .update({
        is_active: false,
        last_seen: new Date().toISOString(),
      } as any)
      .eq("user_id", userId);
  };

  useEffect(() => {
    const unsubscribe = bleManager.subscribe((event) => {
      if (event.type === "stateChange") {
        setConnected(event.payload === "connected");
        setConnecting(
          event.payload === "scanning" ||
            event.payload === "connecting" ||
            event.payload === "reconnecting"
        );
      }

      if (event.type === "debug") {
        const line = String(event.payload);
        setDebugLogs((prev) => [...prev.slice(-79), line]);
      }

      if (event.type === "error") {
        console.error("BLE manager error:", event.payload);
        setDebugLogs((prev) => [
          ...prev.slice(-79),
          `[ERROR] ${event.payload instanceof Error ? event.payload.message : String(event.payload)}`,
        ]);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!connected) return;

    let cancelled = false;

    const pidToKey: Record<string, keyof OBDData> = {
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

    const readVoltageFallback = async (): Promise<number | null> => {
      try {
        const raw = await elm327.sendCommand("ATRV");
        if (!raw) return null;

        const m = String(raw).match(/(\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : null;
      } catch {
        return null;
      }
    };

    const pollOnce = async () => {
      for (const pid of LIVE_PIDS) {
        if (cancelled) return;

        try {
          const raw = await elm327.sendCommand(pid);
          let value: number | null = null;

          if (raw && !/NO\s*DATA|UNABLE|ERROR|STOPPED|\?/i.test(raw)) {
            value = parsePIDResponse(pid, raw);
          }

          if (pid === "0142" && (value === null || value === 0)) {
            value = await readVoltageFallback();
          }

          if (value === null || Number.isNaN(value)) continue;

          const key = pidToKey[pid];
          if (!key) continue;

          let finalValue = value;

          if (pid === "010B") {
            finalValue = Math.max(0, (value - 101.3) / 100);
          }

          if (cancelled) return;

          setObdData((prev) => {
            const next = { ...prev, [key]: finalValue };

            updateLiveSessionPayload(next);

            return next;
          });

          if (pid === "010C") setRpmHistory((h) => [...h.slice(-59), finalValue]);
          if (pid === "0105") setTempHistory((h) => [...h.slice(-59), finalValue]);
          if (pid === "010D") setSpeedHistory((h) => [...h.slice(-59), finalValue]);
        } catch (err) {
          setDebugLogs((prev) => [
            ...prev.slice(-79),
            `[POLL ERR ${pid}] ${err instanceof Error ? err.message : String(err)}`,
          ]);
        }
      }
    };

    pollOnce();

    const interval = window.setInterval(() => {
      if (!cancelled) pollOnce();
    }, 600);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [connected, dtcCodes]);

  const resetData = () => {
    setObdData(EMPTY_OBD_DATA);
    setDtcCodes([]);
    setRpmHistory([]);
    setTempHistory([]);
    setSpeedHistory([]);
  };

  const handleConnect = async () => {
    if (connected || connecting || bleManager.getConnectedDevice()) return;

    setConnecting(true);
    setDebugLogs([]);

    try {
      toast({
        title: "Hledám OBD adaptér",
        description: "Skenuji Bluetooth zařízení v okolí...",
      });

      const devices = await bleManager.scan(10000);
      const selectedDevice = devices[0];

      if (!selectedDevice) {
        throw new Error("Nebyl nalezen žádný BLE OBD adaptér.");
      }

      toast({
        title: "Nalezen adaptér",
        description: `Připojuji: ${selectedDevice.name}`,
      });

      const success = await bleManager.connect(selectedDevice.deviceId);

      if (!success) {
        throw new Error("Adaptér byl nalezen, ale nepodařilo se navázat OBD komunikaci.");
      }

      const connectedDevice = bleManager.getConnectedDevice() || {
        ...selectedDevice,
        connected: true,
      };

      toast({
        title: "Inicializuji ELM327",
        description: "Ověřuji komunikaci s OBD adaptérem...",
      });

      const elmReady = await elm327.initialize();

      if (!elmReady) {
        throw new Error("Adaptér je připojený, ale inicializace ELM327 selhala.");
      }

      setDevice(connectedDevice);
      setConnected(true);
      resetData();

      localStorage.setItem("obd_auto_connect", "true");

      await createOrUpdateObdSession(EMPTY_OBD_DATA);

      toast({
        title: "Připojeno",
        description: `Zařízení: ${selectedDevice.name || connectedDevice.name || "OBD adaptér"}`,
      });
    } catch (error) {
      console.error("OBD connect error:", error);

      try {
        await bleManager.disconnect();
      } catch {}

      setConnected(false);
      setDevice(null);
      resetData();

      toast({
        title: "Bluetooth / OBD chyba",
        description:
          error instanceof Error
            ? error.message
            : "Nepodařilo se najít nebo připojit k OBD adaptéru.",
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    const shouldAutoConnect =
      localStorage.getItem("obd_auto_connect") === "true";

    if (!shouldAutoConnect) return;
    if (connected || connecting || bleManager.getConnectedDevice()) return;

    const timer = window.setTimeout(async () => {
      await handleConnect();
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [connected, connecting]);
useEffect(() => {
  if (!connected) return;

  let cancelled = false;

  const heartbeat = async () => {
    if (cancelled) return;
    await createOrUpdateObdSession(obdData);
  };

  heartbeat();

  const interval = window.setInterval(heartbeat, 5000);

  return () => {
    cancelled = true;
    window.clearInterval(interval);
  };
}, [connected, obdData, dtcCodes]);

// AŽ POD TÍM zůstane:

const handleDisconnect = async () => 
  const handleDisconnect = async () => {
    try {
      elm327.reset();
      await closeObdSession();
      await bleManager.disconnect();
    } catch (error) {
      console.warn("BLE disconnect warning:", error);
    }

    setConnected(false);
    setDevice(null);
    resetData();

    toast({ title: "Odpojeno" });
  };

  const clearDTC = () => {
    setDtcCodes([]);
    toast({ title: "Chybové kódy vymazány" });
  };

  const severityColor = (s: string) => {
    if (s === "high") return "bg-destructive/15 text-destructive border-0";
    if (s === "medium") return "bg-warning/15 text-warning border-0";
    return "bg-success/15 text-success border-0";
  };

  return (
    <div className="min-h-screen pb-24 bg-background">
      <PageHeader title="OBD Diagnostika" subtitle="Bluetooth · ELM327" />

      <div className="px-4 max-w-4xl mx-auto space-y-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className={`luxury-card p-4 ${connected ? "border-success/30" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {connected ? (
                  <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center glow-success">
                    <BluetoothConnected className="w-5 h-5 text-success" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl brushed-metal border border-border/40 flex items-center justify-center">
                    <Bluetooth className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}

                <div>
                  <p className="font-display font-semibold text-sm">
                    {connected ? "Připojeno" : "ELM327 Adaptér"}
                  </p>

                  <p className="text-[11px] text-muted-foreground">
                    {connected
                      ? device?.name || "Live připojení aktivní"
                      : "Připojte přes Bluetooth"}
                  </p>
                </div>
              </div>

              <Button
                size="sm"
                variant={connected ? "destructive" : "hero"}
                onClick={connected ? handleDisconnect : handleConnect}
                disabled={connecting}
                className="text-xs"
              >
                {connecting ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-1" />
                ) : connected ? (
                  <WifiOff className="w-4 h-4 mr-1" />
                ) : (
                  <Wifi className="w-4 h-4 mr-1" />
                )}

                {connecting ? "Hledám..." : connected ? "Odpojit" : "Připojit"}
              </Button>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {connected && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="luxury-card p-4">
                <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Živé hodnoty
                </h3>

                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  <GaugeCircle value={obdData.rpm} max={7000} label="Otáčky" unit="RPM" color="hsl(347, 77%, 50%)" icon={Gauge} />
                  <GaugeCircle value={obdData.coolantTemp} max={120} label="Chladič" unit="°C" color={obdData.coolantTemp > 100 ? "hsl(347, 77%, 50%)" : "hsl(200, 80%, 50%)"} icon={Thermometer} />
                  <GaugeCircle value={obdData.speed} max={220} label="Rychlost" unit="km/h" color="hsl(142, 71%, 45%)" icon={Gauge} />
                  <GaugeCircle value={obdData.throttle} max={100} label="Plyn" unit="%" color="hsl(38, 92%, 50%)" icon={Zap} />
                  <GaugeCircle value={obdData.engineLoad} max={100} label="Zatížení" unit="%" color="hsl(280, 70%, 55%)" icon={Activity} />
                  <GaugeCircle value={obdData.voltage} max={15} label="Napětí" unit="V" color="hsl(50, 90%, 50%)" icon={Zap} />
                  <GaugeCircle value={obdData.fuelPressure} max={70} label="Palivo" unit="kPa" color="hsl(20, 90%, 50%)" icon={Fuel} />
                  <GaugeCircle value={obdData.intakeTemp} max={70} label="Sání" unit="°C" color="hsl(180, 60%, 50%)" icon={Wind} />
                  <GaugeCircle value={obdData.boostPressure} max={2.5} label="Turbo" unit="bar" color="hsl(340, 80%, 55%)" icon={Wind} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <LiveGraph data={rpmHistory} label="Otáčky" color="hsl(347, 77%, 50%)" unit="RPM" />
                <LiveGraph data={tempHistory} label="Teplota chladiče" color="hsl(200, 80%, 50%)" unit="°C" />
                <LiveGraph data={speedHistory} label="Rychlost" color="hsl(142, 71%, 45%)" unit="km/h" />
              </div>

              <div className="luxury-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    Chybové kódy (DTC)
                  </h3>

                  {dtcCodes.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={clearDTC} className="text-xs h-7">
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Vymazat
                    </Button>
                  )}
                </div>

                {dtcCodes.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Žádné chybové kódy</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dtcCodes.map((dtc) => (
                      <div key={dtc.code} className="flex items-center justify-between p-3 rounded-xl bg-secondary/40 border border-border/20">
                        <div className="flex items-center gap-3">
                          <code className="font-display font-bold text-sm text-foreground">{dtc.code}</code>
                          <span className="text-xs text-muted-foreground">{dtc.description}</span>
                        </div>

                        <Badge className={severityColor(dtc.severity)}>
                          {dtc.severity === "high" ? "Vážné" : dtc.severity === "medium" ? "Střední" : "Nízké"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!connected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <div className="luxury-card p-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full brushed-metal border border-border/40 mx-auto flex items-center justify-center">
                <Bluetooth className="w-8 h-8 text-muted-foreground/40" />
              </div>

              <h3 className="font-display font-semibold text-lg">Připojte ELM327 adaptér</h3>

              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Zasuňte OBD-II adaptér do diagnostického konektoru, zapněte Bluetooth a klikněte „Připojit“.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                {[
                  { icon: Gauge, label: "Otáčky & rychlost" },
                  { icon: Thermometer, label: "Teploty motoru" },
                  { icon: AlertTriangle, label: "Chybové kódy" },
                  { icon: Activity, label: "Live grafy" },
                ].map((f) => (
                  <div key={f.label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary/30 border border-border/15">
                    <f.icon className="w-5 h-5 text-primary" />
                    <span className="text-[10px] text-muted-foreground text-center">{f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default OBDDiagnostics;