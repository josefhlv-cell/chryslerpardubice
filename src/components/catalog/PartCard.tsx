/**
 * PartCard Component
 * Displays a single part as a card with all available information.
 * Photo loads only on click (lazy).
 */

import { motion, AnimatePresence } from "framer-motion";
import { Image as ImageIcon, ChevronDown, Eye, ShoppingCart, Package, ArrowRight, Info, Wrench, Tag, Box, Star, StarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { PartResult } from "@/api/partsAPI";
import { sourceLabel } from "@/api/partsAPI";

interface PartCardProps {
  part: PartResult;
  index: number;
  isExpanded: boolean;
  isSelected: boolean;
  isFavorite: boolean;
  discountPercent: number;
  onToggleExpand: () => void;
  onSelect: () => void;
  onPhotoClick: () => void;
  onOrderNew: () => void;
  onOrderUsed: () => void;
  onSearchOem: (oem: string) => void;
  onToggleFavorite: () => void;
  disabled?: boolean;
}

// ---- Sub-components ----

const AvailabilityDot = ({ availability }: { availability: string }) => {
  if (availability === "available")
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />Skladem</span>;
  if (availability === "unavailable")
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Nedostupné</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />Na dotaz</span>;
};

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

const PartCard = ({
  part, index, isExpanded, isSelected, isFavorite, discountPercent,
  onToggleExpand, onSelect, onPhotoClick, onOrderNew, onOrderUsed,
  onSearchOem, onToggleFavorite, disabled,
}: PartCardProps) => {
  const discounted = discountPercent > 0 ? {
    price: Math.round(part.price_without_vat * (1 - discountPercent / 100) * 100) / 100,
    withVat: Math.round(part.price_without_vat * (1 - discountPercent / 100) * 1.21 * 100) / 100,
  } : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      className={`group rounded-xl border bg-card hover:border-primary/30 transition-all duration-200 ${
        isSelected ? "border-primary ring-1 ring-primary/20" : "border-border"
      }`}
    >
      <div className="p-4">
        {/* Top badges */}
        <div className="flex items-center gap-1.5 mb-2">
          <SourceBadge source={part.catalog_source} />
          <AvailabilityDot availability={part.availability} />
          {part.superseded_by && (
            <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/20">Náhrada</Badge>
          )}
          {/* Favorite button */}
          <button onClick={onToggleFavorite} className="ml-auto p-1 hover:bg-muted rounded-md transition-colors" title={isFavorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}>
            {isFavorite
              ? <Star className="w-4 h-4 text-accent fill-accent" />
              : <StarOff className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>

        {/* Main row */}
        <div className="flex gap-3">
          {/* Photo placeholder (lazy) */}
          <button onClick={onPhotoClick}
            className="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-lg bg-secondary border border-border flex items-center justify-center hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer group/photo"
            title="Zobrazit fotografii">
            <ImageIcon className="w-6 h-6 text-muted-foreground group-hover/photo:text-primary transition-colors" />
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-tight mb-0.5 truncate" title={part.name}>{part.name}</h3>
            <p className="text-xs text-muted-foreground font-mono mb-1">
              OEM: {part.oem_number}
              {part.internal_code && <span className="ml-2 opacity-60">({part.internal_code})</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {part.manufacturer && <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><Wrench className="w-2.5 h-2.5" />{part.manufacturer}</span>}
              {part.category && <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><Tag className="w-2.5 h-2.5" />{part.category}</span>}
              {part.family && <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><Box className="w-2.5 h-2.5" />{part.family}</span>}
            </div>
          </div>

          {/* Price */}
          <div className="shrink-0 text-right">
            <p className="text-base font-bold text-foreground">
              {part.price_with_vat > 0 ? `${part.price_with_vat.toLocaleString("cs")} Kč` : "Na dotaz"}
            </p>
            {part.price_without_vat > 0 && (
              <p className="text-[10px] text-muted-foreground">bez DPH: {part.price_without_vat.toLocaleString("cs")} Kč</p>
            )}
            {discounted && (
              <p className="text-xs font-semibold text-primary mt-0.5">−{discountPercent}%: {discounted.withVat.toLocaleString("cs")} Kč</p>
            )}
          </div>
        </div>

        {/* Supersession alerts */}
        {part.superseded_by && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/5 border border-accent/15">
            <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0" />
            <p className="text-[11px] text-foreground">
              <span className="font-medium">Nahrazeno:</span> <span className="font-mono">{part.oem_number}</span> → <span className="font-mono font-bold">{part.superseded_by}</span>
            </p>
            <Button size="sm" variant="ghost" className="h-5 px-2 text-[10px] ml-auto" onClick={() => onSearchOem(part.superseded_by!)}>
              Hledat nový
            </Button>
          </div>
        )}
        {part.supersedes && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <p className="text-[11px] text-foreground">Nahrazuje: <span className="font-mono">{part.supersedes}</span></p>
          </div>
        )}

        {/* Actions row */}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="ghost" className="text-[11px] text-muted-foreground h-7 px-2" onClick={onToggleExpand}>
            <ChevronDown className={`w-3.5 h-3.5 mr-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            {isExpanded ? "Méně" : "Více informací"}
          </Button>
          <Button size="sm" variant="ghost" className="text-[11px] text-muted-foreground h-7 px-2" onClick={onSelect}>
            <Eye className="w-3.5 h-3.5 mr-1" />Detail
          </Button>
          <div className="flex-1" />
          
          <Button size="sm" className="text-[11px] h-7 px-3" onClick={onOrderNew} disabled={disabled}>
            <ShoppingCart className="w-3 h-3 mr-1" />Objednat
          </Button>
        </div>

        {/* Expanded technical details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <Separator className="my-3" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                {part.description && <div className="md:col-span-2"><span className="text-muted-foreground">Popis: </span>{part.description}</div>}
                {part.compatible_vehicles && <div className="md:col-span-2"><span className="text-muted-foreground">Kompatibilní vozidla: </span>{part.compatible_vehicles}</div>}
                <div><span className="text-muted-foreground">Zdroj: </span>{sourceLabel[part.catalog_source] || part.catalog_source}</div>
                {part.category && <div><span className="text-muted-foreground">Kategorie: </span>{part.category}</div>}
                {part.segment && <div><span className="text-muted-foreground">Segment: </span>{part.segment}</div>}
                {part.family && <div><span className="text-muted-foreground">Rodina: </span>{part.family}</div>}
                {part.packaging && <div><span className="text-muted-foreground">Balení: </span>{part.packaging}</div>}
                {part.manufacturer && <div><span className="text-muted-foreground">Výrobce: </span>{part.manufacturer}</div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default PartCard;
