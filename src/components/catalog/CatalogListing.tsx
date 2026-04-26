/**
 * CatalogListing — unified OEM-first part list (Mopar + J+M only).
 * Each row shows badge ORIGINÁL (OEM, rank 1) or NÁHRADA (J+M, rank 5).
 * Clicking the row expands to show description + technical_parameters.
 */
import { useState } from "react";
import { ShieldCheck, RefreshCw, Package, ShoppingCart, ChevronDown } from "lucide-react";
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

const formatPrice = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "Cena na vyžádání"
    : new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(n);

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

const TechParams = ({ params }: { params: Record<string, string> }) => {
  const entries = Object.entries(params).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mt-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 border-b border-border/20 pb-0.5">
          <dt className="text-muted-foreground truncate">{k}</dt>
          <dd className="font-medium text-foreground text-right truncate">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
};

const PartRow = ({ p, onOrder, supersededCount }: { p: CatalogPart; onOrder: (p: CatalogPart) => void; supersededCount?: number }) => {
  const [open, setOpen] = useState(false);
  const isOem = p.is_oem;
  const photo = p.image_urls?.[0];
  const hasDetails =
    !!p.description ||
    (p.technical_parameters && Object.keys(p.technical_parameters).length > 0);

  return (
    <div
      className={cn(
        "relative flex flex-col gap-2 p-3 rounded-xl border bg-card transition-all",
        isOem ? "border-primary/40 shadow-sm" : "border-border/40"
      )}
    >
      {isOem && (
        <div className="absolute -top-px left-3 right-3 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      )}

      <div className="flex gap-3">
        <div className="w-20 h-20 shrink-0 rounded-lg bg-secondary/40 overflow-hidden flex items-center justify-center">
          {photo ? (
            <img
              src={photo}
              alt={p.name}
              className="w-full h-full object-contain"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Package className="w-8 h-8 text-muted-foreground/40" />
          )}
        </div>

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
            {p.category && (
              <span className="text-[10px] text-muted-foreground/70 truncate ml-auto">{p.category}</span>
            )}
          </div>

          <h3 className="text-sm font-medium leading-snug line-clamp-2">{p.name}</h3>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
            {p.oem_number}
            {supersededCount && supersededCount > 0 ? (
              <span className="ml-2 text-[10px] text-muted-foreground/70 font-sans">
                (nejnovější revize, +{supersededCount} starších)
              </span>
            ) : null}
          </p>

          <div className="flex items-end justify-between mt-auto pt-2 gap-2">
            <div>
              <div className={cn("text-sm font-bold", isOem ? "text-primary" : "text-foreground")}>
                {formatPrice(p.price_with_vat)}
              </div>
              {p.price_without_vat !== null && p.price_without_vat !== undefined && (
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

      {hasDetails && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors self-start"
          >
            <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
            {open ? "Skrýt detaily" : "Zobrazit detaily"}
          </button>
          {open && (
            <div className="border-t border-border/30 pt-2">
              {p.description && (
                <p className="text-[11px] text-foreground/90 leading-relaxed whitespace-pre-line">
                  {p.description}
                </p>
              )}
              {p.technical_parameters && Object.keys(p.technical_parameters).length > 0 && (
                <TechParams params={p.technical_parameters} />
              )}
              {p.compatible_vehicles && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  <span className="font-medium">Kompatibilní:</span> {p.compatible_vehicles}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/**
 * Aggressive OEM grouping ("one card" rule):
 * - Primary key is the base Mopar number: first 8 digits, without K prefix/revision suffix.
 * - For brake pads/discs and similar catalog noise, also collapse functionally identical
 *   names (front/rear + part type), so old Mopar number families like 68029806AA and
 *   68029875AB do not render as separate duplicate cards.
 * - Non-OEM (J+M aftermarket) items are never grouped.
 */
const normalizeOem = (oem: string): string =>
  (oem || "").toUpperCase().replace(/[\s\-._/]/g, "").replace(/^K/, "");

const baseEightDigits = (oem: string): string =>
  normalizeOem(oem).match(/^\d{8}/)?.[0] || normalizeOem(oem).replace(/[A-Z]{1,3}$/i, "");

const normalizeText = (value: string): string =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const functionalOemGroup = (p: CatalogPart): string => {
  const text = normalizeText(`${p.name} ${p.category || ""}`);
  const category = normalizeText(p.category || "");
  const base8 = baseEightDigits(p.oem_number || "");

  const axle = /predn|front/.test(text) ? "front" : /zadn|rear/.test(text) ? "rear" : "any";
  const side = /lev|left/.test(text) ? "left" : /prav|right/.test(text) ? "right" : "both";
  const isPads = /destic|brake pad|bremsbelag|pads/.test(text);
  const isDisc = /kotouc|disc|rotor/.test(text);
  const isFluid = /kapal|fluid|dot\s?[34]/.test(text);
  const isHose = /hadic|hose/.test(text);
  const isCaliper = /trmen|caliper/.test(text);
  const isAbs = /\babs\b|snimac|sensor/.test(text);

  if (isPads) return `OEM-FUNC::brake-pad::${axle}`;
  if (isDisc) return `OEM-FUNC::brake-disc::${axle}`;
  if (isFluid) return `OEM-FUNC::brake-fluid`;
  if (isHose) return `OEM-FUNC::brake-hose::${axle}::${side}`;
  if (isCaliper) return `OEM-FUNC::brake-caliper::${axle}::${side}`;
  if (isAbs) return `OEM-FUNC::abs-sensor::${axle}::${side}`;

  return `OEM-BASE8::${category}::${base8}`;
};

const revisionRank = (oem: string): string => {
  const normalized = normalizeOem(oem);
  const suffix = normalized.match(/[A-Z]{1,3}$/)?.[0] || "";
  return `${baseEightDigits(normalized)}-${suffix}`;
};

const scorePart = (p: CatalogPart): number => {
  const hasPhoto = p.image_urls?.some(Boolean) ? 10_000 : 0;
  const hasPrice = p.price_with_vat ? 1_000 : 0;
  return hasPhoto + hasPrice + revisionRank(p.oem_number || "").charCodeAt(revisionRank(p.oem_number || "").length - 1 || 0);
};

const collapseSupersessions = (items: CatalogPart[]): Array<CatalogPart & { supersededCount?: number }> => {
  const groups = new Map<string, CatalogPart[]>();
  const order: string[] = [];
  for (const p of items) {
    const key = p.is_oem ? functionalOemGroup(p) : `JM::${p.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(p);
  }
  return order.map((key) => {
    const group = groups.get(key)!;
    if (group.length === 1) return group[0];
    const latest = group.reduce((best, cur) => {
      const revCompare = revisionRank(cur.oem_number || "").localeCompare(revisionRank(best.oem_number || ""));
      if (revCompare !== 0) return revCompare > 0 ? cur : best;
      return scorePart(cur) > scorePart(best) ? cur : best;
    });
    return { ...latest, supersededCount: group.length - 1 };
  });
};

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

  const grouped = collapseSupersessions(items);

  // Sort "with-price first" — items with a real price come on top, then OEM, then the rest.
  const sorted = [...grouped].sort((a, b) => {
    const priceA = (a.price_with_vat ?? 0) > 0 ? 1 : 0;
    const priceB = (b.price_with_vat ?? 0) > 0 ? 1 : 0;
    if (priceA !== priceB) return priceB - priceA;
    const oemA = a.is_oem ? 1 : 0;
    const oemB = b.is_oem ? 1 : 0;
    if (oemA !== oemB) return oemB - oemA;
    return 0;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {sorted.map((p) => (
        <PartRow key={p.id} p={p} onOrder={onOrder} supersededCount={(p as any).supersededCount} />
      ))}
    </div>
  );
};

export default CatalogListing;
