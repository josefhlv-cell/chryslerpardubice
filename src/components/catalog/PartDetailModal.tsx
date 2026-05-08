/**
 * PartDetailModal Component
 * Shows full part detail in a side panel (desktop) or bottom sheet (mobile).
 * Includes OEM cross-references and aftermarket alternatives.
 */

import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, X, ShoppingCart, Package, ArrowRight, Info, Loader2, RefreshCw, ArrowLeftRight, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { PartResult } from "@/api/partsAPI";
import { sourceLabel, getOEMCrossReferences, type CrossRefResult } from "@/api/partsAPI";
import Recommendations from "./Recommendations";

interface PartDetailModalProps {
  part: PartResult | null;
  onClose: () => void;
  onPhotoClick: (oem: string) => void;
  onOrderNew: (part: PartResult) => void;
  onOrderUsed: (part: PartResult) => void;
  onSearchOem: (oem: string) => void;
  discountPercent: number;
  disabled?: boolean;
}

const SourceBadge = ({ source }: { source: string }) => {
  const styles: Record<string, string> = {
    mopar: "bg-primary/15 text-primary border-primary/25",
    "epc-ai": "bg-primary/15 text-primary border-primary/25",
    sag: "bg-accent/15 text-accent border-accent/25",
    autokelly: "bg-amber-500/15 text-amber-500 border-amber-500/25",
    intercars: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    csv: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={`text-[10px] ${styles[source] || styles.csv}`}>{sourceLabel[source] || source}</Badge>;
};

const AvailabilityDot = ({ availability }: { availability: string }) => {
  if (availability === "available")
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />Skladem</span>;
  if (availability === "on_order")
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Na dotaz</span>;
  if (availability === "unavailable")
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Nedostupné</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />Na dotaz</span>;
};

/** Inner content used in both desktop panel and mobile sheet */
const DetailContent = ({ part, onClose, onPhotoClick, onOrderNew, onOrderUsed, onSearchOem, discountPercent, disabled }: PartDetailModalProps & { part: PartResult }) => {
  const [crossRef, setCrossRef] = useState<CrossRefResult | null>(null);
  const [crossRefLoading, setCrossRefLoading] = useState(false);
  const [crossRefLoaded, setCrossRefLoaded] = useState(false);

  const loadCrossRef = async () => {
    setCrossRefLoading(true);
    setCrossRefLoaded(true);
    const result = await getOEMCrossReferences(part.oem_number, part.name);
    setCrossRef(result);
    setCrossRefLoading(false);
  };

  const discounted = discountPercent > 0 ? {
    withVat: Math.round(part.price_without_vat * (1 - discountPercent / 100) * 1.21 * 100) / 100,
  } : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <SourceBadge source={part.catalog_source} />
          <h2 className="font-display text-lg font-bold mt-2">{part.name}</h2>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">OEM: {part.oem_number}</p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Photo area — lazy */}
      <button onClick={() => onPhotoClick(part.oem_number)}
        className="w-full aspect-[4/3] rounded-xl bg-secondary border border-border flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer">
        <ImageIcon className="w-10 h-10 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Kliknutím načtete fotografii</span>
      </button>

      {/* Price block */}
      <div className="rounded-xl bg-secondary p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Cena s DPH</span>
          <span className="text-xl font-bold">{part.price_with_vat > 0 ? `${part.price_with_vat.toLocaleString("cs")} Kč` : "Na dotaz"}</span>
        </div>
        {part.price_without_vat > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Cena bez DPH</span><span>{part.price_without_vat.toLocaleString("cs")} Kč</span>
          </div>
        )}
        {discounted && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-primary font-medium">Po slevě ({discountPercent}%)</span>
            <span className="text-primary font-bold">{discounted.withVat.toLocaleString("cs")} Kč</span>
          </div>
        )}
      </div>

      <AvailabilityDot availability={part.availability} />

      {/* Supersession info */}
      {part.superseded_by && (
        <div className="rounded-lg bg-accent/5 border border-accent/15 p-3">
          <p className="text-xs font-medium mb-1">Tento díl byl nahrazen</p>
          <p className="text-sm font-mono">{part.oem_number} → <span className="font-bold">{part.superseded_by}</span></p>
          <Button size="sm" variant="outline" className="mt-2 text-xs h-7"
            onClick={() => { onSearchOem(part.superseded_by!); onClose(); }}>Vyhledat nový díl</Button>
        </div>
      )}
      {part.supersedes && (
        <div className="rounded-lg bg-blue-500/5 border border-blue-500/15 p-3">
          <p className="text-xs">Nahrazuje: <span className="font-mono font-medium">{part.supersedes}</span></p>
        </div>
      )}

      {/* Technical info */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Technické informace</p>
        <div className="space-y-1.5 text-xs">
          {part.manufacturer && <Row label="Výrobce" value={part.manufacturer} />}
          {part.category && <Row label="Kategorie" value={part.category} />}
          {part.family && <Row label="Rodina" value={part.family} />}
          {part.segment && <Row label="Segment" value={part.segment} />}
          {part.packaging && <Row label="Balení" value={part.packaging} />}
          {part.internal_code && <Row label="Interní kód" value={part.internal_code} mono />}
          <Row label="Zdroj" value={sourceLabel[part.catalog_source] || part.catalog_source} />
        </div>
      </div>

      {part.description && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Popis</p>
          <p className="text-xs leading-relaxed">{part.description}</p>
        </div>
      )}

      {/* Kompatibilní vozy — z catalog_vehicle_compatibility, s filtrováním */}
      <CompatibleVehiclesSection part={part} />


      {/* Cross-references / Aftermarket alternatives */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Křížové reference</p>
          {!crossRefLoaded && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={loadCrossRef}>
              <ArrowLeftRight className="w-3 h-3 mr-1" />Najít alternativy
            </Button>
          )}
        </div>
        {crossRefLoading && (
          <div className="flex items-center gap-2 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Hledám aftermarket alternativy...</span>
          </div>
        )}
        {crossRef && crossRef.alternatives && crossRef.alternatives.length > 0 && (
          <div className="space-y-1.5">
            {crossRef.alternatives.map((alt, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 border border-border/50">
                <div>
                  <p className="text-xs font-medium">{alt.manufacturer}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{alt.part_number}</p>
                </div>
                {alt.note && <p className="text-[10px] text-muted-foreground max-w-[120px] text-right">{alt.note}</p>}
              </div>
            ))}
          </div>
        )}
        {crossRefLoaded && !crossRefLoading && (!crossRef?.alternatives || crossRef.alternatives.length === 0) && (
          <p className="text-xs text-muted-foreground">Nebyly nalezeny aftermarket alternativy.</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        <Button className="flex-1" onClick={() => onOrderNew(part)} disabled={disabled}>
          <ShoppingCart className="w-4 h-4 mr-1" />Objednat nový
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => onOrderUsed(part)} disabled={disabled}>
          <Package className="w-4 h-4 mr-1" />Poptat použitý
        </Button>
      </div>

      <Separator />

      {/* Recommendations */}
      <Recommendations part={part} onSelect={(p) => { onClose(); }} />
    </div>
  );
};

const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={mono ? "font-mono" : ""}>{value}</span>
  </div>
);

type CompatRow = {
  brand: string;
  model: string;
  engine: string | null;
  year_from: number | null;
  year_to: number | null;
  is_oem: boolean;
};

const CompatibleVehiclesSection = ({ part }: { part: PartResult }) => {
  const [rows, setRows] = useState<CompatRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [modelQuery, setModelQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Načti vazby + dotáhni názvy z nextis_vehicles
      const { data, error } = await supabase
        .from("catalog_vehicle_compatibility")
        .select("brand, model, engine, year_from, year_to, is_oem, nextis_vehicle_id")
        .eq("part_id", part.id)
        .limit(500);
      if (cancelled) return;
      if (error || !data) {
        setRows([]);
        setLoading(false);
        return;
      }
      // Doplň chybějící brand/model z nextis_vehicles, pokud je tam jen "manual-approved"
      const ids = Array.from(
        new Set(data.filter((r: any) => r.nextis_vehicle_id).map((r: any) => r.nextis_vehicle_id)),
      );
      let vehMap = new Map<string, any>();
      if (ids.length) {
        const { data: vehs } = await supabase
          .from("nextis_vehicles")
          .select("id, brand, model, engine, year_from, year_to")
          .in("id", ids);
        vehMap = new Map((vehs || []).map((v: any) => [v.id, v]));
      }
      const out: CompatRow[] = data.map((r: any) => {
        const v = r.nextis_vehicle_id ? vehMap.get(r.nextis_vehicle_id) : null;
        return {
          brand: v?.brand || (r.brand && !r.brand.startsWith("manual") ? r.brand : "—"),
          model: v?.model || (r.model && !r.model.startsWith("manual") ? r.model : "—"),
          engine: v?.engine ?? r.engine ?? null,
          year_from: v?.year_from ?? r.year_from ?? null,
          year_to: v?.year_to ?? r.year_to ?? null,
          is_oem: !!r.is_oem,
        };
      });
      // Deduplikace
      const seen = new Set<string>();
      const dedup = out.filter((r) => {
        const k = `${r.brand}|${r.model}|${r.engine || ""}|${r.year_from || ""}|${r.year_to || ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setRows(dedup);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [part.id]);

  const brands = useMemo(
    () => Array.from(new Set((rows || []).map((r) => r.brand).filter((b) => b && b !== "—"))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (brandFilter !== "all" && r.brand !== brandFilter) return false;
      if (modelQuery.trim() && !r.model.toLowerCase().includes(modelQuery.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, brandFilter, modelQuery]);

  const visible = expanded ? filtered : filtered.slice(0, 8);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Car className="w-3.5 h-3.5" /> Kompatibilní vozy
        </p>
        {rows && rows.length > 0 && <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Načítám…</span>
        </div>
      )}

      {!loading && rows && rows.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          {part.compatible_vehicles || "Žádná konkrétní vazba — díl je univerzální nebo bez specifikace vozu."}
        </p>
      )}

      {!loading && rows && rows.length > 0 && (
        <>
          <div className="flex gap-1.5">
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="text-[11px] bg-secondary border border-border rounded px-2 py-1 flex-1 min-w-0"
            >
              <option value="all">Všechny značky</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <Input
              value={modelQuery}
              onChange={(e) => setModelQuery(e.target.value)}
              placeholder="Filtr modelu…"
              className="text-[11px] h-7 flex-1 min-w-0"
            />
          </div>

          <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
            {visible.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 text-[11px] bg-secondary/40 rounded px-2 py-1.5 border border-border/30"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{r.brand} {r.model}</span>
                    {r.is_oem && <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] h-4 px-1">OEM</Badge>}
                  </div>
                  <div className="text-muted-foreground text-[10px] truncate">
                    {r.engine || "—"}
                    {r.year_from && ` · ${r.year_from}–${r.year_to || "…"}`}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length > 8 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-full text-[10px]"
              onClick={() => setExpanded((x) => !x)}
            >
              {expanded ? "Sbalit" : `Zobrazit všech ${filtered.length}`}
            </Button>
          )}

          {filtered.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">Žádný vůz nevyhovuje filtru.</p>
          )}
        </>
      )}
    </div>
  );
};


/** Desktop side panel */
export const PartDetailPanel = (props: PartDetailModalProps) => {
  if (!props.part) return null;
  return (
    <div className="hidden lg:block w-80 shrink-0">
      <div className="sticky top-32">
        <Card className="border-primary/20">
          <CardContent className="p-4 max-h-[calc(100vh-9rem)] overflow-y-auto">
            <DetailContent {...props} part={props.part} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

/** Mobile bottom sheet */
export const PartDetailSheet = (props: PartDetailModalProps) => (
  <Sheet open={!!props.part} onOpenChange={(open) => !open && props.onClose()}>
    <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-2xl">
      <SheetHeader><SheetTitle>Detail dílu</SheetTitle></SheetHeader>
      <div className="mt-4">
        {props.part && <DetailContent {...props} part={props.part} />}
      </div>
    </SheetContent>
  </Sheet>
);

export default PartDetailPanel;
