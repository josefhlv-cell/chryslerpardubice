/**
 * PartDetailModal Component
 * Shows full part detail in a side panel (desktop) or bottom sheet (mobile).
 * Includes OEM cross-references and aftermarket alternatives.
 */

import { useState } from "react";
import { Image as ImageIcon, X, ShoppingCart, Package, ArrowRight, Info, Loader2, RefreshCw, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
    autokelly: "bg-accent/15 text-accent border-accent/25",
    intercars: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    csv: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={`text-[10px] ${styles[source] || styles.csv}`}>{sourceLabel[source] || source}</Badge>;
};

const AvailabilityDot = ({ availability }: { availability: string }) => {
  if (availability === "available")
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />Skladem</span>;
  if (availability === "unavailable")
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Nedostupné</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />Na dotaz</span>;
};

/** Inner content used in both desktop panel and mobile sheet */
const DetailContent = ({ part, onClose, onPhotoClick, onOrderNew, onOrderUsed, onSearchOem, discountPercent, disabled }: PartDetailModalProps & { part: PartResult }) => {
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

      {part.compatible_vehicles && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kompatibilní vozidla</p>
          <p className="text-xs leading-relaxed">{part.compatible_vehicles}</p>
        </div>
      )}

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
      <Recommendations part={part} onSelect={(p) => { onClose(); /* navigate to it */ }} />
    </div>
  );
};

const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className={mono ? "font-mono" : ""}>{value}</span>
  </div>
);

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
