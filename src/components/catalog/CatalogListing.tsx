/**
 * CatalogListing — unified OEM-first part list (Mopar + J+M only).
 * Each row shows badge ORIGINÁL (OEM, rank 1) or NÁHRADA (J+M, rank 5).
 * Always visible: photo, manufacturer, stock pill, OE preview, TecDoc section.
 * On expand: lazy fetches full J+M detail (images, all OE numbers, tech params).
 */
import { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Package, ShoppingCart, ChevronDown, Loader2, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { CatalogPart } from "@/api/catalogV2API";

interface Props {
  items: CatalogPart[];
  loading: boolean;
  onOrder: (p: CatalogPart) => void;
  emptyHint?: string;
}

const formatPrice = (n: number | null | undefined) =>
  n === null || n === undefined || n <= 0
    ? "Na dotaz"
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

const StockPill = ({ stock, hasPrice }: { stock?: number | null; hasPrice: boolean }) => {
  if (stock && stock > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        {stock} ks skladem
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      {hasPrice ? "Na objednávku" : "Na dotaz"}
    </span>
  );
};

const PartRow = ({ p, onOrder, supersededCount }: { p: CatalogPart; onOrder: (p: CatalogPart) => void; supersededCount?: number }) => {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Partial<CatalogPart> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoaded, setDetailLoaded] = useState(false);

  const isOem = p.is_oem;
  const isJm = p.catalog_source?.toLowerCase() === "jm";

  // Merge what we have with lazily-fetched detail
  const m = { ...p, ...(detail || {}) } as CatalogPart;
  const photo = m.image_urls?.[0];
  const oePreview = (m.oe_numbers || []).slice(0, 3);
  const hasPrice = !!(m.price_with_vat && m.price_with_vat > 0);

  // Lazy-load full J+M detail on first expand (images, OE numbers, tech params).
  useEffect(() => {
    if (!open || detailLoaded || !isJm) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailLoaded(true);
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("jm-proxy", {
          body: { action: "partDetail", payload: { code: p.oem_number } },
        });
        const item = data?.data?.item || data?.item;
        if (!cancelled && item) {
          setDetail({
            image_urls: Array.isArray(item.image_urls) && item.image_urls.length > 0 ? item.image_urls : p.image_urls,
            oe_numbers: Array.isArray(item.oe_numbers) && item.oe_numbers.length > 0 ? item.oe_numbers : p.oe_numbers,
            technical_parameters: item.technical_parameters && Object.keys(item.technical_parameters).length > 0
              ? item.technical_parameters
              : p.technical_parameters,
            description: item.description || p.description,
            stock: typeof item.stock === "number" ? item.stock : p.stock,
          });
        }
      } catch (e) {
        console.warn("[CatalogListing] partDetail failed", e);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, detailLoaded, isJm, p.oem_number]);

  const hasExpandableDetail =
    !!m.description ||
    (m.technical_parameters && Object.keys(m.technical_parameters).length > 0) ||
    (m.oe_numbers && m.oe_numbers.length > 0) ||
    (m.image_urls && m.image_urls.length > 1) ||
    isJm;

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
        <div className="w-20 h-20 shrink-0 rounded-lg bg-secondary/40 overflow-hidden flex items-center justify-center border border-border/30">
          {photo ? (
            <img
              src={photo}
              alt={m.name}
              className="w-full h-full object-contain"
              loading="lazy"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                img.style.display = "none";
                const parent = img.parentElement;
                if (parent && !parent.querySelector(".photo-fallback")) {
                  const div = document.createElement("div");
                  div.className = "photo-fallback flex items-center justify-center w-full h-full";
                  div.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-muted-foreground/40"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';
                  parent.appendChild(div);
                }
              }}
            />
          ) : (
            <Package className="w-8 h-8 text-muted-foreground/40" />
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top badges: ORIGINÁL/NÁHRADA + manufacturer + stock + TecDoc */}
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
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
            {m.manufacturer && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0 h-5 shrink-0 font-semibold uppercase tracking-wide",
                  isOem
                    ? "border-primary/30 text-primary"
                    : "border-amber-500/40 text-amber-600 dark:text-amber-400"
                )}
                title="Výrobce"
              >
                {m.manufacturer}
              </Badge>
            )}
            <StockPill stock={m.stock} hasPrice={hasPrice} />
            {(m.tecdoc_section || m.category) && (
              <span className="text-[10px] text-muted-foreground/70 truncate ml-auto" title="TecDoc sekce">
                {m.tecdoc_section || m.category}
              </span>
            )}
          </div>

          <h3 className="text-sm font-medium leading-snug line-clamp-2">{m.name}</h3>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
            {m.oem_number}
            {supersededCount && supersededCount > 0 ? (
              <span className="ml-2 text-[10px] text-muted-foreground/70 font-sans">
                (nejnovější revize, +{supersededCount} starších)
              </span>
            ) : null}
          </p>

          {/* OE numbers preview (first 3) — always visible when available */}
          {oePreview.length > 0 && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 font-semibold">OE:</span>
              {oePreview.map((oe) => (
                <span key={oe} className="text-[10px] font-mono bg-secondary/60 text-foreground/80 px-1 py-px rounded">
                  {oe}
                </span>
              ))}
              {(m.oe_numbers?.length || 0) > 3 && (
                <span className="text-[10px] text-muted-foreground/70">+{(m.oe_numbers!.length - 3)}</span>
              )}
            </div>
          )}

          <div className="flex items-end justify-between mt-auto pt-2 gap-2">
            <div>
              <div className={cn("text-sm font-bold", isOem ? "text-primary" : "text-foreground")}>
                {formatPrice(m.price_with_vat)}
              </div>
              {m.price_without_vat !== null && m.price_without_vat !== undefined && (
                <div className="text-[10px] text-muted-foreground">
                  {formatPrice(m.price_without_vat)} bez DPH
                </div>
              )}
            </div>
            <Button size="sm" className="h-7 text-xs px-2" onClick={() => onOrder(m)}>
              <ShoppingCart className="w-3 h-3 mr-1" />
              {hasPrice ? "Objednat" : "Poptat"}
            </Button>
          </div>
        </div>
      </div>

      {hasExpandableDetail && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors self-start"
          >
            {detailLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
            )}
            {open ? "Skrýt detaily" : "Zobrazit detaily a parametry"}
          </button>
          {open && (
            <div className="border-t border-border/30 pt-2 space-y-2">
              {/* Photo gallery */}
              {m.image_urls && m.image_urls.length > 1 && (
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {m.image_urls.slice(0, 8).map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener"
                      className="w-16 h-16 shrink-0 rounded border border-border/30 bg-secondary/40 overflow-hidden flex items-center justify-center hover:border-primary/40 transition-colors"
                    >
                      <img src={url} alt={`${m.name} ${i + 1}`} className="w-full h-full object-contain" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}

              {detailLoading && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Načítám plný detail z J+M…
                </div>
              )}

              {m.description && (
                <p className="text-[11px] text-foreground/90 leading-relaxed whitespace-pre-line">
                  {m.description}
                </p>
              )}

              {m.technical_parameters && Object.keys(m.technical_parameters).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Technické parametry
                  </p>
                  <TechParams params={m.technical_parameters} />
                </div>
              )}

              {m.compatible_vehicles && Array.isArray(m.compatible_vehicles) && m.compatible_vehicles.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Kompatibilní vozidla
                  </p>
                  <ul className="text-[11px] text-foreground/90 space-y-0.5 max-h-40 overflow-y-auto pr-1">
                    {m.compatible_vehicles.slice(0, 20).map((v, i) => (
                      <li key={i}>• {v}</li>
                    ))}
                    {m.compatible_vehicles.length > 20 && (
                      <li className="text-muted-foreground/70">+{m.compatible_vehicles.length - 20} dalších</li>
                    )}
                  </ul>
                </div>
              )}

              {m.oe_numbers && m.oe_numbers.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Všechna OE čísla ({m.oe_numbers.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {m.oe_numbers.map((oe) => (
                      <span
                        key={oe}
                        className="text-[10px] font-mono bg-secondary/60 text-foreground px-1.5 py-0.5 rounded"
                      >
                        {oe}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!detailLoading && isJm && !m.description && (!m.technical_parameters || Object.keys(m.technical_parameters).length === 0) && (!m.oe_numbers || m.oe_numbers.length === 0) && (
                <p className="text-[11px] text-muted-foreground italic">
                  Dodavatel pro tuto položku neposkytuje další detail.
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

  // J+M mirror rule: genuine OEM first, then priced aftermarket, then on-order items.
  const sorted = [...grouped].sort((a, b) => {
    const oemA = a.is_oem ? 1 : 0;
    const oemB = b.is_oem ? 1 : 0;
    if (oemA !== oemB) return oemB - oemA;
    const priceA = (a.price_with_vat ?? 0) > 0 ? 1 : 0;
    const priceB = (b.price_with_vat ?? 0) > 0 ? 1 : 0;
    if (priceA !== priceB) return priceB - priceA;
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
