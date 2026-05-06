/**
 * VinAndOemSearch — Two-row search bar above catalog tree.
 *
 * Row 1: VIN  → decode → match nextis_vehicle → callback opens J+M tree for that vehicle.
 * Row 2: OEM  → finds local OEM part + ALL J+M items whose oe_numbers list contains the code.
 *
 * Pricing: untouched. Uses globalOemSearch for OEM (which already calls J+M
 * /catalogs/items-finding-by-code that returns aftermarket items carrying the
 * requested OEM code in their oe_numbers).
 */
import { useState } from "react";
import { Search, Loader2, Car, Hash, ShoppingCart, ShieldCheck, RefreshCw, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { globalOemSearch, type CatalogPart } from "@/api/catalogV2API";
import { parseVinPayload, type ParsedVinResult } from "./vinPayload";

const formatPrice = (n: number | null | undefined) =>
  n === null || n === undefined || n <= 0
    ? "Na objednávku"
    : new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(n);

interface Props {
  onOrder: (p: CatalogPart) => void;
  onVehicleSelected: (s: { brand: string; model: string; engine?: string }) => void;
}

const VinAndOemSearch = ({ onOrder, onVehicleSelected }: Props) => {
  // VIN
  const [vin, setVin] = useState("");
  const [vinLoading, setVinLoading] = useState(false);
  const [vinResult, setVinResult] = useState<ParsedVinResult | null>(null);

  // OEM
  const [oemQ, setOemQ] = useState("");
  const [oemLoading, setOemLoading] = useState(false);
  const [oemHits, setOemHits] = useState<CatalogPart[]>([]);
  const [jmHits, setJmHits] = useState<CatalogPart[]>([]);
  const [oemSearched, setOemSearched] = useState(false);

  const decodeVin = async () => {
    const code = vin.trim().toUpperCase();
    if (code.length < 11) {
      toast.error("Zadejte platný VIN (min 11 znaků).");
      return;
    }
    setVinLoading(true);
    setVinResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("vin-decode-ai", {
        body: { vin: code },
      });
      if (error) throw error;
      const parsed = parseVinPayload(data);
      setVinResult(parsed);
      if (!parsed.ok) {
        toast.error(parsed.error || "VIN se nepodařilo dekódovat.");
        return;
      }
      toast.success(`VIN: ${parsed.brand} ${parsed.model}${parsed.engine ? " · " + parsed.engine : ""}`);
      onVehicleSelected({ brand: parsed.brand, model: parsed.model, engine: parsed.engine });
    } catch (e: any) {
      const msg = "Dekódování VIN selhalo: " + (e?.message || "neznámá chyba");
      setVinResult({ ok: false, brand: "", model: "", error: msg });
      toast.error(msg);
    } finally {
      setVinLoading(false);
    }
  };

  const searchOem = async () => {
    const q = oemQ.trim();
    if (!q) return;
    setOemLoading(true);
    setOemSearched(true);
    try {
      const { oem, jm } = await globalOemSearch(q);
      setOemHits(oem);
      setJmHits(jm);
    } catch (e: any) {
      toast.error("Hledání selhalo: " + (e?.message || "neznámá chyba"));
    } finally {
      setOemLoading(false);
    }
  };

  const resetOem = () => {
    setOemQ("");
    setOemHits([]);
    setJmHits([]);
    setOemSearched(false);
  };

  return (
    <div className="space-y-2.5 mb-6">
      {/* VIN row */}
      <div className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-3">
        <div className="flex items-center gap-2">
          <Car className="w-4 h-4 text-primary shrink-0" />
          <Input
            value={vin}
            onChange={(e) => setVin(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && decodeVin()}
            placeholder="Vyhledat podle VIN — otevře katalog vozidla…"
            className="border-0 bg-transparent focus-visible:ring-0 px-0 h-9 text-sm font-mono uppercase tracking-wider"
            maxLength={17}
          />
          <Button onClick={decodeVin} disabled={vinLoading || vin.trim().length < 11} size="sm" className="h-8 text-xs px-3">
            {vinLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Otevřít"}
          </Button>
        </div>

        {vinResult && vinResult.ok && (
          <div
            data-testid="vin-result"
            className="mt-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-medium text-foreground">
              {vinResult.brand} {vinResult.model}
            </span>
            {vinResult.engine && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                {vinResult.engine}
              </Badge>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground">Otevírám katalog…</span>
          </div>
        )}
        {vinResult && !vinResult.ok && (
          <div
            data-testid="vin-error"
            role="alert"
            className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90"
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{vinResult.error || "VIN se nepodařilo dekódovat."}</span>
          </div>
        )}
      </div>

      {/* OEM row */}
      <div className="rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm p-3">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-primary shrink-0" />
          <Input
            value={oemQ}
            onChange={(e) => setOemQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchOem()}
            placeholder="Vyhledat podle OEM — najde originál i náhrady…"
            className="border-0 bg-transparent focus-visible:ring-0 px-0 h-9 text-sm"
          />
          {oemQ && (
            <Button variant="ghost" size="icon" onClick={resetOem} className="h-7 w-7 shrink-0">
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button onClick={searchOem} disabled={oemLoading || !oemQ.trim()} size="sm" className="h-8 text-xs px-3">
            {oemLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {oemSearched && (
          <div className="mt-3 space-y-2">
            {oemLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Hledám originál + náhrady…
              </div>
            )}
            {!oemLoading && oemHits.length === 0 && jmHits.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-3">
                Nic nenalezeno. Zkontrolujte zápis OEM kódu.
              </p>
            )}
            {oemHits.length > 0 && (
              <div className="text-[10px] uppercase tracking-wider text-primary font-semibold pt-1">
                Originál ({oemHits.length})
              </div>
            )}
            {oemHits.map((p) => <ResultRow key={p.id} p={p} onOrder={onOrder} />)}
            {jmHits.length > 0 && (
              <div className="text-[10px] uppercase tracking-wider text-amber-400/90 font-semibold pt-1">
                Náhrady ({jmHits.length})
              </div>
            )}
            {jmHits.map((p) => <ResultRow key={p.id} p={p} onOrder={onOrder} />)}
          </div>
        )}
      </div>
    </div>
  );
};

const ResultRow = ({ p, onOrder }: { p: CatalogPart; onOrder: (p: CatalogPart) => void }) => {
  const isOem = p.is_oem;
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-lg border bg-background",
        isOem ? "border-primary/40" : "border-border/40",
      )}
    >
      <Badge
        variant={isOem ? "default" : "secondary"}
        className={cn("text-[10px] px-1.5 py-0 h-5 shrink-0", isOem ? "bg-primary text-primary-foreground" : "")}
      >
        {isOem ? <ShieldCheck className="w-3 h-3 mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
        {isOem ? "ORIGINÁL" : "NÁHRADA"}
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

export default VinAndOemSearch;
