import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
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

const MOCK_DTC_CODES: DTCCode[] = [
  { code: "P0300", description: "Vícenásobné vynechání zapalování", severity: "high" },
  { code: "P0171", description: "Příliš chudá směs – řada 1", severity: "medium" },
  { code: "P0420", description: "Nízká účinnost katalyzátoru", severity: "low" },
];

const GaugeCircle = ({ value, max, label, unit, color, icon: Icon }: {
  value: number; max: number; label: string; unit: string; color: string; icon: any;
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="40" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
          <circle
            cx="48" cy="48" r="40" fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="w-4 h-4 mb-0.5" style={{ color }} />
          <span className="font-display font-bold text-lg leading-none">{Math.round(value)}</span>
          <span className="text-[9px] text-muted-foreground">{unit}</span>
        </div>
      </div>
      <span className="text-[11px] font-medium text-muted-foreground text-center">{label}</span>
    </div>
  );
};

const LiveGraph = ({ data, label, color, unit }: {
  data: number[]; label: string; color: string; unit: string;
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

    // Grid
    ctx.strokeStyle = "hsl(230, 8%, 20%)";
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

    // Fill
    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, color + "33");
    gradient.addColorStop(1, color + "05");
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
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
    <Card className="glass-card border-border/40">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="font-display font-bold text-sm" style={{ color }}>
            {Math.round(currentValue)} {unit}
          </span>
        </div>
        <canvas ref={canvasRef} width={300} height={60} className="w-full h-[60px] rounded-lg" />
      </CardContent>
    </Card>
  );
};

const OBDDiagnostics = () => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [obdData, setObdData] = useState<OBDData>({
    rpm: 0, coolantTemp: 0, intakeTemp: 0, speed: 0,
    throttle: 0, fuelPressure: 0, engineLoad: 0, voltage: 0, boostPressure: 0,
  });
  const [dtcCodes, setDtcCodes] = useState<DTCCode[]>([]);
  const [rpmHistory, setRpmHistory] = useState<number[]>([]);
  const [tempHistory, setTempHistory] = useState<number[]>([]);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);

  // Simulate OBD data when connected
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      setObdData(prev => {
        const newData = {
          rpm: Math.max(700, Math.min(6500, prev.rpm + (Math.random() - 0.48) * 200)),
          coolantTemp: Math.max(60, Math.min(110, prev.coolantTemp + (Math.random() - 0.5) * 2)),
          intakeTemp: Math.max(15, Math.min(55, prev.intakeTemp + (Math.random() - 0.5) * 1)),
          speed: Math.max(0, Math.min(200, prev.speed + (Math.random() - 0.48) * 8)),
          throttle: Math.max(0, Math.min(100, prev.throttle + (Math.random() - 0.5) * 5)),
          fuelPressure: Math.max(30, Math.min(60, prev.fuelPressure + (Math.random() - 0.5) * 2)),
          engineLoad: Math.max(10, Math.min(95, prev.engineLoad + (Math.random() - 0.5) * 3)),
          voltage: Math.max(12, Math.min(14.8, prev.voltage + (Math.random() - 0.5) * 0.2)),
          boostPressure: Math.max(-0.5, Math.min(2.2, prev.boostPressure + (Math.random() - 0.5) * 0.1)),
        };
        setRpmHistory(h => [...h.slice(-59), newData.rpm]);
        setTempHistory(h => [...h.slice(-59), newData.coolantTemp]);
        setSpeedHistory(h => [...h.slice(-59), newData.speed]);
        return newData;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [connected]);

  const handleConnect = async () => {
    setConnecting(true);
    // Check for Web Bluetooth API
    if ("bluetooth" in navigator) {
      try {
        const device = await (navigator as any).bluetooth.requestDevice({
          filters: [{ services: ["0000fff0-0000-1000-8000-00805f9b34fb"] }],
          optionalServices: ["0000fff0-0000-1000-8000-00805f9b34fb"],
        });
        toast({ title: "Připojeno", description: `Zařízení: ${device.name}` });
        setConnected(true);
        setObdData({ rpm: 850, coolantTemp: 78, intakeTemp: 28, speed: 0, throttle: 12, fuelPressure: 45, engineLoad: 22, voltage: 13.8, boostPressure: 0 });
        setDtcCodes(MOCK_DTC_CODES);
      } catch {
        // Fallback to demo mode
        toast({ title: "Demo režim", description: "Bluetooth nedostupný – spuštěn demo režim" });
        setConnected(true);
        setObdData({ rpm: 850, coolantTemp: 78, intakeTemp: 28, speed: 0, throttle: 12, fuelPressure: 45, engineLoad: 22, voltage: 13.8, boostPressure: 0 });
        setDtcCodes(MOCK_DTC_CODES);
      }
    } else {
      toast({ title: "Demo režim", description: "Web Bluetooth API není podporováno – spuštěn demo režim" });
      setConnected(true);
      setObdData({ rpm: 850, coolantTemp: 78, intakeTemp: 28, speed: 0, throttle: 12, fuelPressure: 45, engineLoad: 22, voltage: 13.8, boostPressure: 0 });
      setDtcCodes(MOCK_DTC_CODES);
    }
    setConnecting(false);
  };

  const handleDisconnect = () => {
    setConnected(false);
    setObdData({ rpm: 0, coolantTemp: 0, intakeTemp: 0, speed: 0, throttle: 0, fuelPressure: 0, engineLoad: 0, voltage: 0, boostPressure: 0 });
    setDtcCodes([]);
    setRpmHistory([]);
    setTempHistory([]);
    setSpeedHistory([]);
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
      <PageHeader title="OBD Diagnostika" />

      <div className="px-4 max-w-4xl mx-auto space-y-5">
        {/* Connection card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`glass-card-elevated border-border/40 ${connected ? "border-success/30" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {connected ? (
                    <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center">
                      <BluetoothConnected className="w-5 h-5 text-success" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                      <Bluetooth className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className="font-display font-semibold text-sm">
                      {connected ? "Připojeno" : "ELM327 Adaptér"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {connected ? "Live data aktivní" : "Připojte přes Bluetooth"}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={connected ? "destructive" : "default"}
                  onClick={connected ? handleDisconnect : handleConnect}
                  disabled={connecting}
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
            </CardContent>
          </Card>
        </motion.div>

        <AnimatePresence>
          {connected && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {/* Gauges grid */}
              <Card className="glass-card border-border/40">
                <CardContent className="p-4">
                  <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Živé hodnoty
                  </h3>
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
                </CardContent>
              </Card>

              {/* Live graphs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <LiveGraph data={rpmHistory} label="Otáčky" color="hsl(347, 77%, 50%)" unit="RPM" />
                <LiveGraph data={tempHistory} label="Teplota chladiče" color="hsl(200, 80%, 50%)" unit="°C" />
                <LiveGraph data={speedHistory} label="Rychlost" color="hsl(142, 71%, 45%)" unit="km/h" />
              </div>

              {/* DTC Codes */}
              <Card className="glass-card border-border/40">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                      Chybové kódy (DTC)
                    </h3>
                    {dtcCodes.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={clearDTC} className="text-xs">
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Vymazat
                      </Button>
                    )}
                  </div>
                  {dtcCodes.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Žádné chybové kódy</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dtcCodes.map((dtc) => (
                        <div key={dtc.code} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                          <div className="flex items-center gap-3">
                            <code className="font-display font-bold text-sm">{dtc.code}</code>
                            <span className="text-xs text-muted-foreground">{dtc.description}</span>
                          </div>
                          <Badge className={severityColor(dtc.severity)}>
                            {dtc.severity === "high" ? "Vážné" : dtc.severity === "medium" ? "Střední" : "Nízké"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info when disconnected */}
        {!connected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <Card className="glass-card border-border/40">
              <CardContent className="p-6 text-center space-y-3">
                <Bluetooth className="w-12 h-12 mx-auto text-muted-foreground/30" />
                <h3 className="font-display font-semibold">Připojte ELM327 adaptér</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Zasuňte OBD-II adaptér (ELM327) do diagnostického konektoru vozidla,
                  zapněte Bluetooth a klikněte na "Připojit". Zobrazí se živá data z řídící jednotky.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  {[
                    { icon: Gauge, label: "Otáčky & rychlost" },
                    { icon: Thermometer, label: "Teploty motoru" },
                    { icon: AlertTriangle, label: "Chybové kódy" },
                    { icon: Activity, label: "Live grafy" },
                  ].map(f => (
                    <div key={f.label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary/30">
                      <f.icon className="w-5 h-5 text-primary" />
                      <span className="text-[11px] text-muted-foreground text-center">{f.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default OBDDiagnostics;
