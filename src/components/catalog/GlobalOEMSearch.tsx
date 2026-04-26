/**
 * GlobalOEMSearch — Phase 5 elite search bar.
 * Hybrid lookup: parallel local OEM (parts_new) + live J+M searchByCode.
 * OEM rank=1 is always pinned to the top with "ORIGINÁL ⭐" badge.
 */
import { forwardRef, useState } from "react";
import { Search, Loader2, ShieldCheck, RefreshCw, ShoppingCart, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { globalOemSearch, type CatalogPart } from "@/api/catalogV2API";

const formatPrice = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "Cena na vyžádání"
    : new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(n);

interface Props {
  onOrder: (p: CatalogPart) => void;
}

const GlobalOEMSearch = forwardRef<HTMLDivElement, Props>(({ onOrder }, ref) => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [oemHits, setOemHits] = useState<CatalogPart[]>([]);
  const [jmHits, setJmHits] = useState<CatalogPart[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const { oem, jm } = await globalOemSearch(q);
      setOemHits(oem);
      setJmHits(jm);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setQ("");
    setOemHits([]);
    setJmHits([]);
    setHasSearched(false);
  };

  return (
    <div ref={ref} className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-3 mb-6">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Vyhledat OEM kód nebo název dílu (např. 68218951AA)…"
          className="border-0 bg-transparent focus-visible:ring-0 px-0 h-9 text-sm"
        />
        {q && (
          <Button variant="ghost" size="icon" onClick={reset} className="h-7 w-7 shrink-0">
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button onClick={search} disabled={loading || !q.trim()} size="sm" className="h-8 text-xs px-3">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Hledat"}
        </Button>
      </div>

      {hasSearched && (
        <div className="mt-3 space-y-2">
          {loading && (
            <>
              <SkeletonRow />
              <SkeletonRow />
            </>
          )}

          {!loading && oemHits.length === 0 && jmHits.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              Pro zadaný kód nebyly nalezeny žádné díly.
            </p>
          )}

          {oemHits.map((p) => (
            <ResultRow key={p.id} p={p} onOrder={onOrder} />
          ))}
          {jmHits.length > 0 && (
            <div className="pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Aftermarket alternativy ({jmHits.length})
            </div>
          )}
          {jmHits.map((p) => (
            <ResultRow key={p.id} p={p} onOrder={onOrder} />
          ))}
        </div>
      )}
    </div>
  );
};

const ResultRow = ({ p, onOrder }: { p: CatalogPart; onOrder: (p: CatalogPart) => void }) => {
  const isOem = p.is_oem;
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-lg border bg-background",
        isOem ? "border-primary/40" : "border-border/40"
      )}
    >
      <Badge
        variant={isOem ? "default" : "secondary"}
        className={cn(
          "text-[10px] px-1.5 py-0 h-5 shrink-0",
          isOem ? "bg-primary text-primary-foreground" : ""
        )}
      >
        {isOem ? <ShieldCheck className="w-3 h-3 mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
        {isOem ? "ORIGINÁL ⭐" : "NÁHRADA"}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{p.name}</p>
        <p className="text-[11px] font-mono text-muted-foreground">
          {p.oem_number}
          {p.manufacturer && <span className="ml-2 text-muted-foreground/70">· {p.manufacturer}</span>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <div className={cn("text-sm font-bold", isOem ? "text-primary" : "text-foreground")}>
          {formatPrice(p.price_with_vat)}
        </div>
      </div>
      <Button size="sm" className="h-7 text-xs px-2 shrink-0" onClick={() => onOrder(p)}>
        <ShoppingCart className="w-3 h-3 mr-1" />
        Objednat
      </Button>
    </div>
  );
};

const SkeletonRow = () => (
  <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border/30 bg-background animate-pulse">
    <div className="h-5 w-16 rounded bg-secondary/60" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3 w-3/4 rounded bg-secondary/60" />
      <div className="h-2.5 w-1/3 rounded bg-secondary/40" />
    </div>
    <div className="h-5 w-20 rounded bg-secondary/60" />
  </div>
);

export default GlobalOEMSearch;
