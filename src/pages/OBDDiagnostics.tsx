import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Lock,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useObd } from "@/contexts/ObdContext";
import { useObdPermissions } from "@/hooks/obd/use-obd-permissions";

const GaugeCircle = ({
  value, max, label, unit, color, icon: Icon,
}: {
  value: number; max: number; label: string; unit: string; color: string; icon: any;
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
            cx="48" cy="48" r="40" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
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

const LiveGraph = ({ data, label, color, unit }: { data: number[]; label: string; color: string; unit: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "hsl(0 0% 15%)"; ctx.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    if (data.length < 2) return;
    const max = Math.max(...data, 1); const min = Math.min(...data, 0); const range = max - min || 1;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 8) - 4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
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
  const { connected, connecting, device, liveData, dtcs, connect, disconnect, readDtcs, clearDtcs } = useObd();
  const { permissions, loading: permsLoading } = useObdPermissions();

  const [rpmHistory, setRpmHistory] = useState<number[]>([]);
  const [tempHistory, setTempHistory] = useState<number[]>([]);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);

  useEffect(() => {
    if (!connected) return;
    setRpmHistory((h) => [...h.slice(-59), liveData.rpm]);
    setTempHistory((h) => [...h.slice(-59), liveData.coolantTemp]);
    setSpeedHistory((h) => [...h.slice(-59), liveData.speed]);
  }, [connected, liveData.rpm, liveData.coolantTemp, liveData.speed]);

  const handleConnect = async () => {
    try {
      toast({ title: "HledÃ¡m OBD adaptÃ©r", description: "Skenuji Bluetooth zaÅÃ­zenÃ­ v okolÃ­..." });
      await connect();
      toast({ title: "PÅipojeno", description: "OBD relace aktivnÃ­. SpojenÃ­ bÄÅ¾Ã­ i pÅi pÅechodu na jinou strÃ¡nku." });
    } catch (e) {
      toast({
        title: "Bluetooth / OBD chyba",
        description: e instanceof Error ? e.message : "NepodaÅilo se pÅipojit.",
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setRpmHistory([]); setTempHistory([]); setSpeedHistory([]);
    toast({ title: "Odpojeno" });
  };

  const severityColor = (s: string) => {
    if (s === "high") return "bg-destructive/15 text-destructive border-0";
    if (s === "medium") return "bg-warning/15 text-warning border-0";
    return "bg-success/15 text-success border-0";
  };

  const liveAllowed = permsLoading || permissions.live_data;

  const handleReadDtcs = async () => {
    try {
      const codes = await readDtcs();
      toast({ title: "DTC naÄteny", description: codes.length ? `${codes.length} kÃ³dÅ¯` : "Å½Ã¡dnÃ© chybovÃ© kÃ³dy" });
    } catch (e) {
      toast({
        title: "ÄtenÃ­ DTC selhalo",
        description: e instanceof Error ? e.message : "NepodaÅilo se naÄÃ­st DTC.",
        variant: "destructive",
      });
    }
  };

  const handleClearDtcs = async () => {
    try {
      await clearDtcs();
      toast({ title: "ChybovÃ© kÃ³dy vymazÃ¡ny" });
    } catch (e) {
      toast({
        title: "MazÃ¡nÃ­ DTC selhalo",
        description: e instanceof Error ? e.message : "NepodaÅilo se vymazat DTC.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen pb-24 bg-background">
      <PageHeader title="OBD Diagnostika" subtitle="Bluetooth Â· ELM327" />

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
                    {connected ? "PÅipojeno" : "ELM327 AdaptÃ©r"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {connected ? device?.name || "Live pÅipojenÃ­ aktivnÃ­" : "PÅipojte pÅes Bluetooth"}
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
                {connecting ? (<RefreshCw className="w-4 h-4 animate-spin mr-1" />)
                  : connected ? (<WifiOff className="w-4 h-4 mr-1" />)
                  : (<Wifi className="w-4 h-4 mr-1" />)}
                {connecting ? "HledÃ¡m..." : connected ? "Odpojit" : "PÅipojit"}
              </Button>
            </div>
          </div>
        </motion.div>

        {!liveAllowed && (
          <div className="luxury-card p-4 border-warning/30 flex items-center gap-3">
            <Lock className="w-5 h-5 text-warning" />
            <div>
              <p className="text-sm font-semibold">OBD funkce jsou pro vÃ¡Å¡ ÃºÄet vypnutÃ©</p>
              <p className="text-[11px] text-muted-foreground">
                Kontaktujte sprÃ¡vce a poÅ¾Ã¡dejte o povolenÃ­ diagnostiky.
              </p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {connected && liveAllowed && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="luxury-card p-4">
                <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" /> Å½ivÃ© hodnoty
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  <GaugeCircle value={liveData.rpm} max={7000} label="OtÃ¡Äky" unit="RPM" color="hsl(347, 77%, 50%)" icon={Gauge} />
                  <GaugeCircle value={liveData.coolantTemp} max={120} label="ChladiÄ" unit="Â°C" color={liveData.coolantTemp > 100 ? "hsl(347, 77%, 50%)" : "hsl(200, 80%, 50%)"} icon={Thermometer} />
                  <GaugeCircle value={liveData.speed} max={220} label="Rychlost" unit="km/h" color="hsl(142, 71%, 45%)" icon={Gauge} />
                  <GaugeCircle value={liveData.throttle} max={100} label="Plyn" unit="%" color="hsl(38, 92%, 50%)" icon={Zap} />
                  <GaugeCircle value={liveData.engineLoad} max={100} label="ZatÃ­Å¾enÃ­" unit="%" color="hsl(280, 70%, 55%)" icon={Activity} />
                  <GaugeCircle value={liveData.voltage} max={15} label="NapÄtÃ­" unit="V" color="hsl(50, 90%, 50%)" icon={Zap} />
                  <GaugeCircle value={liveData.fuelPressure} max={70} label="Palivo" unit="kPa" color="hsl(20, 90%, 50%)" icon={Fuel} />
                  <GaugeCircle value={liveData.intakeTemp} max={70} label="SÃ¡nÃ­" unit="Â°C" color="hsl(180, 60%, 50%)" icon={Wind} />
                  <GaugeCircle value={liveData.boostPressure} max={2.5} label="Turbo" unit="bar" color="hsl(340, 80%, 55%)" icon={Wind} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <LiveGraph data={rpmHistory} label="OtÃ¡Äky" color="hsl(347, 77%, 50%)" unit="RPM" />
                <LiveGraph data={tempHistory} label="Teplota chladiÄe" color="hsl(200, 80%, 50%)" unit="Â°C" />
                <LiveGraph data={speedHistory} label="Rychlost" color="hsl(142, 71%, 45%)" unit="km/h" />
              </div>

              <div className="luxury-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning" /> ChybovÃ© kÃ³dy (DTC)
                  </h3>
                  <div className="flex gap-1">
                    {permissions.dtc_read && (
                      <Button size="sm" variant="ghost" onClick={handleReadDtcs} className="text-xs h-7">
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> NaÄÃ­st
                      </Button>
                    )}
                    {dtcs.length > 0 && permissions.dtc_clear && (
                      <Button size="sm" variant="ghost" onClick={handleClearDtcs} className="text-xs h-7">
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Vymazat
                      </Button>
                    )}
                  </div>
                </div>
                {!permissions.dtc_read ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Lock className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">ÄtenÃ­ DTC nenÃ­ pro vÃ¡Å¡ ÃºÄet povoleno</p>
                  </div>
                ) : dtcs.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Å½Ã¡dnÃ© chybovÃ© kÃ³dy</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dtcs.map((dtc) => (
                      <div key={dtc.code} className="flex items-center justify-between p-3 rounded-xl bg-secondary/40 border border-border/20">
                        <div className="flex items-center gap-3">
                          <code className="font-display font-bold text-sm text-foreground">{dtc.code}</code>
                          <span className="text-xs text-muted-foreground">{dtc.description}</span>
                        </div>
                        <Badge className={severityColor(dtc.severity)}>
                          {dtc.severity === "high" ? "VÃ¡Å¾nÃ©" : dtc.severity === "medium" ? "StÅednÃ­" : "NÃ­zkÃ©"}
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
              <h3 className="font-display font-semibold text-lg">PÅipojte ELM327 adaptÃ©r</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                ZasuÅte OBD-II adaptÃ©r do diagnostickÃ©ho konektoru, zapnÄte Bluetooth a kliknÄte âPÅipojit". Po prvnÃ­m ÃºspÄÅ¡nÃ©m spÃ¡rovÃ¡nÃ­ se aplikace bude pÅipojovat automaticky.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                {[
                  { icon: Gauge, label: "OtÃ¡Äky & rychlost" },
                  { icon: Thermometer, label: "Teploty motoru" },
                  { icon: AlertTriangle, label: "ChybovÃ© kÃ³dy" },
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
