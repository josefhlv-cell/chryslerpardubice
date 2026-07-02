/**
 * Zákaznická i admin DPF karta.
 * Zobrazuje reálná data z liveData.dpf (customer) nebo obd_live_sessions.payload.dpf (admin).
 * NEPOUŽÍVÁ fake data – když PID nejsou dostupné, ukáže „nedostupné".
 */
import { Flame, Wind, Gauge, Thermometer, Activity, Clock, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DpfSnapshot } from "@/lib/obd/dpf-engine";

type Props = {
  dpf: DpfSnapshot | null | undefined;
  /** Pokud true, karta má tmavší admin styl a případně tlačítko „Načíst DPF stav". */
  admin?: boolean;
  onRequestSnapshot?: () => void;
  requestPending?: boolean;
  requestDisabledReason?: string;
};

function fmt(v: number | undefined, digits = 1, unit = "") {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return `${(Math.round(v * Math.pow(10, digits)) / Math.pow(10, digits)).toString()}${unit ? " " + unit : ""}`;
}

function confidenceLabel(c?: DpfSnapshot["confidence"]) {
  if (c === "high") return "vysoká";
  if (c === "medium") return "střední";
  if (c === "low") return "nízká";
  return "—";
}

export function DpfCard({ dpf, admin, onRequestSnapshot, requestPending, requestDisabledReason }: Props) {
  const wrapClass = admin
    ? "rounded-lg border border-border/40 bg-secondary/10 p-4 space-y-3"
    : "luxury-card p-4 space-y-3";

  const header = (
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-display font-semibold text-sm flex items-center gap-2">
        <Flame className="w-4 h-4 text-orange-500" />
        DPF – filtr pevných částic
      </h3>
      {onRequestSnapshot && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRequestSnapshot}
          disabled={requestPending || !!requestDisabledReason}
          className="h-7 text-xs"
          title={requestDisabledReason}
        >
          {requestPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Activity className="w-3.5 h-3.5 mr-1" />
          )}
          Načíst DPF stav
        </Button>
      )}
    </div>
  );

  if (!dpf) {
    return (
      <div className={wrapClass}>
        {header}
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Info className="w-3.5 h-3.5" />
          Data DPF nejsou dostupná. {onRequestSnapshot ? "Klikněte na „Načíst DPF stav" pro dotaz do vozidla." : ""}
        </p>
        {requestDisabledReason && (
          <p className="text-[11px] text-amber-500">{requestDisabledReason}</p>
        )}
      </div>
    );
  }

  if (dpf.supported === false) {
    return (
      <div className={wrapClass}>
        {header}
        <p className="text-xs text-muted-foreground">
          DPF není dostupné pro toto vozidlo (ECU nevrací standardní PIDy 017A–017E).
        </p>
        <p className="text-[10px] text-muted-foreground">
          Poslední pokus: {dpf.lastUpdated ? new Date(dpf.lastUpdated).toLocaleString("cs-CZ") : "—"}
        </p>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      {header}

      {dpf.regenActive && (
        <div className="rounded-lg border-2 border-orange-500 bg-orange-500/10 p-3 flex items-center gap-3 animate-pulse">
          <Flame className="w-6 h-6 text-orange-500" />
          <div>
            <p className="text-sm font-bold text-orange-500 uppercase tracking-wide">
              Probíhá regenerace DPF
            </p>
            <p className="text-[11px] text-muted-foreground">
              {dpf.regenStatus || "Neukončujte jízdu, dokud regenerace neproběhne."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Tile icon={Gauge} label="Zaplnění sazemi" value={fmt(dpf.sootLoad, 1, "%")} warn={dpf.sootLoad !== undefined && dpf.sootLoad > 80} />
        <Tile icon={Gauge} label="Popel" value={fmt(dpf.ashLoad, 1, "%")} />
        <Tile icon={Wind} label="Diferenční tlak" value={fmt(dpf.differentialPressure, 2, "kPa")} warn={dpf.differentialPressure !== undefined && dpf.differentialPressure > 5} />
        <Tile icon={Thermometer} label="EGT před DPF" value={fmt(dpf.exhaustTempBeforeDpf, 0, "°C")} />
        <Tile icon={Thermometer} label="EGT za DPF" value={fmt(dpf.exhaustTempAfterDpf, 0, "°C")} />
        <Tile icon={Clock} label="Km od regenerace" value={dpf.kmSinceLastRegen !== undefined ? `${dpf.kmSinceLastRegen} km` : "—"} />
        <Tile icon={Clock} label="Čas od regenerace" value={dpf.timeSinceLastRegen !== undefined ? `${dpf.timeSinceLastRegen} min` : "—"} />
        <Tile icon={Activity} label="Stav regenerace" value={dpf.regenStatus || (dpf.regenActive ? "Aktivní" : "Neaktivní")} />
        <Tile icon={Info} label="Spolehlivost" value={confidenceLabel(dpf.confidence)} />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/20">
        <span>Poslední aktualizace: {dpf.lastUpdated ? new Date(dpf.lastUpdated).toLocaleString("cs-CZ") : "—"}</span>
        <span>Reálná data z ECU</span>
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value, warn }: { icon: any; label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${warn ? "border-destructive/50 bg-destructive/5" : "border-border/30 bg-secondary/20"}`}>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-sm font-semibold tabular-nums ${warn ? "text-destructive" : ""}`}>
        {value}
      </div>
    </div>
  );
}

export default DpfCard;
