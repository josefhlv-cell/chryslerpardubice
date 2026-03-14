import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Battery, Droplets, Disc3, Cog, ShieldCheck } from "lucide-react";

type HealthArea = {
  id: string;
  label: string;
  icon: any;
  status: "ok" | "warning" | "critical";
  detail: string;
  position: { top: string; left: string };
};

interface VehicleHealthDiagramProps {
  healthData?: Partial<Record<string, { status: "ok" | "warning" | "critical"; detail: string }>>;
  className?: string;
}

const DEFAULT_AREAS: HealthArea[] = [
  { id: "engine", label: "Motor", icon: Cog, status: "ok", detail: "Vše v pořádku", position: { top: "30%", left: "38%" } },
  { id: "brakes", label: "Brzdy", icon: Disc3, status: "ok", detail: "Dostatečná tloušťka", position: { top: "60%", left: "20%" } },
  { id: "oil", label: "Olej", icon: Droplets, status: "ok", detail: "Hladina OK", position: { top: "38%", left: "55%" } },
  { id: "battery", label: "Baterie", icon: Battery, status: "ok", detail: "Nabitá na 92%", position: { top: "28%", left: "22%" } },
  { id: "chassis", label: "Podvozek", icon: ShieldCheck, status: "ok", detail: "Bez závad", position: { top: "72%", left: "50%" } },
];

const STATUS_STYLES = {
  ok: { ring: "border-success/60", bg: "bg-success/20", dot: "bg-success", text: "text-success" },
  warning: { ring: "border-warning/60", bg: "bg-warning/20", dot: "bg-warning", text: "text-warning" },
  critical: { ring: "border-destructive/60", bg: "bg-destructive/20", dot: "bg-destructive", text: "text-destructive" },
};

const VehicleHealthDiagram = ({ healthData, className = "" }: VehicleHealthDiagramProps) => {
  const [selected, setSelected] = useState<string | null>(null);

  const areas = DEFAULT_AREAS.map(a => {
    const override = healthData?.[a.id];
    return override ? { ...a, status: override.status, detail: override.detail } : a;
  });

  const selectedArea = areas.find(a => a.id === selected);
  const overallOk = areas.every(a => a.status === "ok");

  return (
    <div className={`glass-card-elevated p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-sm">Stav vozidla</h3>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          overallOk ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
        }`}>
          {overallOk ? "Vše OK" : "Vyžaduje pozornost"}
        </span>
      </div>

      {/* Vehicle silhouette area */}
      <div className="relative w-full aspect-[2/1] rounded-xl bg-secondary/40 overflow-hidden">
        {/* Car silhouette SVG */}
        <svg viewBox="0 0 400 200" className="w-full h-full opacity-[0.08]" fill="currentColor">
          <path d="M60 140 Q60 120 80 110 L120 90 Q140 70 180 65 L260 60 Q300 60 320 75 L340 90 Q360 100 360 120 L360 140 Q360 155 345 155 L320 155 Q310 130 290 130 Q270 130 260 155 L160 155 Q150 130 130 130 Q110 130 100 155 L75 155 Q60 155 60 140Z" />
          <circle cx="130" cy="155" r="20" />
          <circle cx="290" cy="155" r="20" />
        </svg>

        {/* Health points */}
        {areas.map((area) => {
          const style = STATUS_STYLES[area.status];
          const Icon = area.icon;
          const isSelected = selected === area.id;
          return (
            <motion.button
              key={area.id}
              className={`absolute -translate-x-1/2 -translate-y-1/2 z-10`}
              style={{ top: area.position.top, left: area.position.left }}
              onClick={() => setSelected(isSelected ? null : area.id)}
              whileTap={{ scale: 0.9 }}
            >
              <div className={`relative w-10 h-10 rounded-full border-2 ${style.ring} ${style.bg} flex items-center justify-center transition-all duration-300 ${isSelected ? "scale-110" : ""}`}>
                <Icon className={`w-4 h-4 ${style.text}`} />
                {area.status !== "ok" && (
                  <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${style.dot} pulse-ring`} />
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Detail panel */}
      <AnimatePresence mode="wait">
        {selectedArea && (
          <motion.div
            key={selectedArea.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 p-3 rounded-xl bg-secondary/50 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${STATUS_STYLES[selectedArea.status].bg} flex items-center justify-center`}>
                <selectedArea.icon className={`w-4 h-4 ${STATUS_STYLES[selectedArea.status].text}`} />
              </div>
              <div>
                <p className="text-sm font-medium">{selectedArea.label}</p>
                <p className="text-xs text-muted-foreground">{selectedArea.detail}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Health summary dots */}
      <div className="flex items-center gap-3 mt-4">
        {areas.map(a => {
          const style = STATUS_STYLES[a.status];
          return (
            <button
              key={a.id}
              onClick={() => setSelected(selected === a.id ? null : a.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors ${
                selected === a.id ? "bg-secondary" : "hover:bg-secondary/50"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
              <span className="text-[10px] text-muted-foreground">{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default VehicleHealthDiagram;
