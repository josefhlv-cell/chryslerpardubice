/**
 * CatalogListing — unified OEM-first part list (Mopar + J+M only).
 * Each row shows badge ORIGINÁL (OEM, rank 1) or NÁHRADA (J+M, rank 5).
 */
import { ShieldCheck, RefreshCw, Package, ShoppingCart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CatalogPart } from "@/api/catalogV2API";

interface Props {
  items: CatalogPart[];
  loading: boolean;
  onOrder: (p: CatalogPart) => void;
  emptyHint?: string;
}

const formatPrice = (n: number) =>
  n > 0 ? new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(n) : "Cena na vyžádání";

const SkeletonCard = () => (
  <div className="flex gap-3 p-3 rounded-xl border border-border/30 bg-card animate-pulse">
    <div className="w-20 h-20 shrink-0 rounded-lg bg-secondary/60" />
    <div className="flex-1 space-y-2">
      <div className="h-4 w-16 rounded bg-secondary/60" />
      <div className="h-4 w-3/4 rounded bg-secondary/60" />
      <div className="h-3 w-1/2 rounded bg-secondary/40" />
      <div className="h-7 w-24 rounded bg-secondary/60 mt-3" />
    </div>
  </div>
);

const CatalogListing = ({ items, loading, onOrder, emptyHint }: Props) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
        <Package className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">{emptyHint || "Vyberte v katalogu vlevo skupinu dílů."}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {items.map((p) => {
        const isOem = p.is_oem;
        const photo = p.image_urls?.[0];

        return (
          <div
            key={p.id}
            className={cn(
              "relative flex gap-3 p-3 rounded-xl border bg-card transition-all",
              isOem ? "border-primary/40 shadow-sm" : "border-border/40"
            )}
          >
            {/* OEM glow ribbon */}
            {isOem && (
              <div className="absolute -top-px left-3 right-3 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
            )}

            {/* Photo */}
            <div className="w-20 h-20 shrink-0 rounded-lg bg-secondary/40 overflow-hidden flex items-center justify-center">
              {photo ? (
                <img src={photo} alt={p.name} className="w-full h-full object-contain" loading="lazy" />
              ) : (
                <Package className="w-8 h-8 text-muted-foreground/40" />
              )}
            </div>

            {/* Body */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-start gap-2 mb-1">
                <Badge
                  variant={isOem ? "default" : "secondary"}
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-5 shrink-0",
                    isOem ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  {isOem ? <ShieldCheck className="w-3 h-3 mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                  {isOem ? "ORIGINÁL ⭐" : "NÁHRADA"}
                </Badge>
                {p.manufacturer && (
                  <span className="text-[10px] text-muted-foreground truncate">{p.manufacturer}</span>
                )}
              </div>

              <h3 className="text-sm font-medium leading-snug line-clamp-2">{p.name}</h3>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{p.oem_number}</p>

              <div className="flex items-end justify-between mt-auto pt-2 gap-2">
                <div>
                  <div className={cn("text-sm font-bold", isOem ? "text-primary" : "text-foreground")}>
                    {formatPrice(p.price_with_vat)}
                  </div>
                  {p.price_with_vat > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      {formatPrice(p.price_without_vat)} bez DPH
                    </div>
                  )}
                </div>
                <Button size="sm" className="h-7 text-xs px-2" onClick={() => onOrder(p)}>
                  <ShoppingCart className="w-3 h-3 mr-1" />
                  Objednat
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CatalogListing;
