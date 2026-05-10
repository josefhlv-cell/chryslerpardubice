/**
 * MotorizationDetails — zobrazí všechny motorizace pro vybranou značku/model
 * ve stylu J+M (Výkon kW/HP · Palivo · Ccm · Kód motoru · Vyrobeno).
 * Data: nextis_vehicles. Chybějící (palivo / ccm / kód) odvozujeme z názvu motoru.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, Gauge, Fuel, Cog, Hash, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Motorization {
  id: string;
  engine: string;
  power_kw: number | null;
  hp: number | null;
  fuel: string;
  ccm: number | null;
  code: string;
  years: string;
  year_from: number | null;
  year_to: number | null;
}

function deriveFuel(engine: string, raw?: string | null): string {
  if (raw && raw.trim()) return raw;
  const e = engine.toLowerCase();
  if (/(crd|cdi|tdi|cummins|ecodiesel|diesel|hdi)/.test(e)) return "Diesel";
  if (/hybrid/.test(e)) return "Hybrid";
  if (/electric|ev\b/.test(e)) return "Elektro";
  return "Benzín";
}

function deriveCcm(engine: string): number | null {
  // "3.6 V6", "5.7 HEMI", "2.8 CRD" -> 3600 / 5700 / 2800
  const m = engine.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const liters = parseFloat(m[1].replace(",", "."));
  if (!liters || liters > 10) return null;
  return Math.round(liters * 1000);
}

function deriveCode(engine: string, metadata: any): string {
  if (metadata?.code) return String(metadata.code);
  if (metadata?.engine_code) return String(metadata.engine_code);
  // fallback: tag jako V6/V8/HEMI/CRD
  const m = engine.match(/\b(HEMI|V6|V8|V10|CRD|SRT|EcoDiesel|Cummins|Hybrid|Hellcat|Pentastar)\b/i);
  return m ? m[0].toUpperCase() : "—";
}

function deriveYears(year_from: number | null, year_to: number | null): string {
  if (!year_from && !year_to) return "—";
  const from = year_from ? String(year_from) : "?";
  const to = year_to ? String(year_to) : "Nyní";
  return `${from} – ${to}`;
}

export async function fetchMotorizations(brand: string, model: string): Promise<Motorization[]> {
  const { data, error } = await supabase
    .from("nextis_vehicles")
    .select("id, engine, power_kw, fuel, year_from, year_to, metadata")
    .ilike("brand", brand)
    .ilike("model", model)
    .order("engine", { ascending: true });
  if (error || !data) return [];
  return data
    .filter((v) => v.engine)
    .map((v) => ({
      id: v.id,
      engine: v.engine!,
      power_kw: v.power_kw,
      hp: v.power_kw ? Math.round(v.power_kw * 1.3596) : null,
      fuel: deriveFuel(v.engine!, v.fuel),
      ccm: deriveCcm(v.engine!),
      code: deriveCode(v.engine!, v.metadata),
      years: deriveYears(v.year_from, v.year_to),
      year_from: v.year_from,
      year_to: v.year_to,
    }));
}

interface Props {
  brand: string;
  model: string;
  selectedEngine?: string;
  onSelect?: (engine: string) => void;
}

export default function MotorizationDetails({ brand, model, selectedEngine, onSelect }: Props) {
  const [items, setItems] = useState<Motorization[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!brand || !model) { setItems([]); return; }
    let alive = true;
    setLoading(true);
    fetchMotorizations(brand, model)
      .then((r) => { if (alive) setItems(r); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [brand, model]);

  if (!brand || !model) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Motorizace ({items.length})
      </p>
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Načítám…
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground">Žádná data motorů.</p>
      )}
      <div className="space-y-1.5">
        {items.map((m) => {
          const active = selectedEngine === m.engine;
          return (
            <Card
              key={m.id}
              onClick={() => onSelect?.(m.engine)}
              className={cn(
                "p-2.5 cursor-pointer transition-all border",
                active
                  ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                  : "border-border hover:border-primary/50 hover:bg-muted/40",
              )}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <p className="text-sm font-bold leading-tight">
                  {m.engine}{" "}
                  {m.code !== "—" && (
                    <span className="text-[10px] font-normal text-muted-foreground">({m.code})</span>
                  )}
                </p>
                {active && <span className="text-[9px] uppercase tracking-wider text-primary font-bold">Vybráno</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <span className="flex items-center gap-1 text-foreground">
                  <Gauge className="h-3 w-3 text-primary" />
                  {m.power_kw ? `${m.power_kw} kW` : "—"} {m.hp ? `/ ${m.hp} HP` : ""}
                </span>
                <span className="flex items-center gap-1 text-foreground">
                  <Fuel className="h-3 w-3 text-primary" /> {m.fuel}
                </span>
                <span className="flex items-center gap-1 text-foreground">
                  <Cog className="h-3 w-3 text-primary" /> {m.ccm ? `${m.ccm} ccm` : "—"}
                </span>
                <span className="flex items-center gap-1 text-foreground">
                  <Hash className="h-3 w-3 text-primary" /> {m.code}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground col-span-2">
                  <Calendar className="h-3 w-3 text-primary" /> {m.years}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
