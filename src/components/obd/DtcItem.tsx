/**
 * DtcItem — sdílená položka DTC kódu.
 * Základní řádek: KÓD — český popis (nic víc).
 * Po kliknutí/rozkliknutí: detail se všemi dostupnými informacemi
 * (systém, kategorie, závažnost, pravděpodobná příčina, první kontrola,
 * anglický/OEM popis, Mopar poznámka, source).
 * Prázdné položky se nezobrazují.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { resolveDTCInfo, type DTCSeverity } from "@/lib/obd/dtc-engine";

const SEVERITY_LABEL: Record<DTCSeverity, string> = {
  critical: "Kritická",
  high: "Vysoká",
  medium: "Střední",
  low: "Nízká",
};

const SYSTEM_LABEL: Record<string, string> = {
  powertrain: "Motor / hnací ústrojí",
  body: "Karoserie",
  chassis: "Podvozek",
  network: "Síťová komunikace",
};

function severityClass(s: DTCSeverity) {
  if (s === "critical" || s === "high") return "text-destructive border-destructive/40 bg-destructive/10";
  if (s === "medium") return "text-amber-500 border-amber-500/40 bg-amber-500/10";
  return "text-muted-foreground border-border bg-muted/40";
}

type Props = {
  code: string;
  /** Volitelně předaný systém (P/B/C/U). Když chybí, dopočítá se z prefixu. */
  system?: "powertrain" | "body" | "chassis" | "network";
  /** Volitelně: pending/aktivní. */
  isPending?: boolean;
  /** Kompaktní varianta pro admin/list. */
  compact?: boolean;
};

export function DtcItem({ code, system, isPending, compact }: Props) {
  const [open, setOpen] = useState(false);
  const info = resolveDTCInfo(code);
  const sys = system || guessSystem(code);
  const sevCls = severityClass(info.severity);

  return (
    <div className={`rounded-lg border ${sevCls.replace("text-", "border-").replace("bg-", "")} bg-card/50`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        )}
        <code className={`font-mono font-bold ${compact ? "text-xs" : "text-sm"}`}>{code}</code>
        <span className={`flex-1 truncate ${compact ? "text-[11px]" : "text-xs"} text-foreground`}>
          {info.description || "Neznámý kód"}
        </span>
        {isPending && (
          <Badge variant="secondary" className="text-[9px]">pending</Badge>
        )}
        {(info.severity === "high" || info.severity === "critical") && (
          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-1.5 text-[11px] text-foreground/90 border-t border-border/40">
          {info.descriptionEn && info.descriptionEn !== info.description && (
            <Row label="OEM popis" value={info.descriptionEn} />
          )}
          <Row label="Systém" value={SYSTEM_LABEL[sys] || sys} />
          {info.category && <Row label="Kategorie" value={info.category} />}
          <Row label="Závažnost" value={SEVERITY_LABEL[info.severity]} />
          {info.cause && <Row label="Pravděpodobná příčina" value={info.cause} />}
          {info.firstCheck && <Row label="První kontrola" value={info.firstCheck} />}
          {info.moparNote && <Row label="Poznámka Mopar" value={info.moparNote} />}
          {info.source && <Row label="Zdroj" value={info.source} />}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className="whitespace-pre-wrap">{value}</span>
    </div>
  );
}

function guessSystem(code: string): "powertrain" | "body" | "chassis" | "network" {
  const p = (code || "").toUpperCase()[0];
  if (p === "B") return "body";
  if (p === "C") return "chassis";
  if (p === "U") return "network";
  return "powertrain";
}
