/**
 * CatalogListing — unified OEM-first part list.
 * Card shows: photo, manufacturer, name, OE preview, stock, price.
 * Detail (gallery, all OE, technical parameters, description) opens in a modal
 * with client-side cache, 3s timeout, and background prefetch of top items.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, RefreshCw, Package, ShoppingCart, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

// --------- Detail cache + fetch (with 3s timeout) ---------
type DetailPatch = Partial<Pick<CatalogPart, "image_urls" | "oe_numbers" | "technical_parameters" | "description" | "stock" | "compatible_vehicles" | "price_with_vat" | "price_without_vat" | "availability">>;
const detailCache = new Map<string, DetailPatch | "unavailable">();
const inflight = new Map<string, Promise<DetailPatch | "unavailable">>();

function detailKey(code: string, manufacturer?: string | null) {
  return `${manufacturer || ""}|${code}`.toUpperCase().replace(/[\s\-._/]/g, "");
}

async function kitoemFallback(code: string): Promise<DetailPatch | null> {
  try {
    const { data } = await (supabase as any)
      .from("kitoem_parts")
      .select("name, description, image_urls, technical_params, price_with_vat, price_without_vat")
      .eq("oem_number", code)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      image_urls: Array.isArray(data.image_urls) && data.image_urls.length ? data.image_urls : undefined,
      technical_parameters: data.technical_params && typeof data.technical_params === "object" ? data.technical_params : undefined,
      description: data.description || undefined,
      price_with_vat: typeof data.price_with_vat === "number" ? data.price_with_vat : undefined,
      price_without_vat: typeof data.price_without_vat === "number" ? data.price_without_vat : undefined,
    };
  } catch { return null; }
}

function fetchPartDetail(code: string, manufacturer?: string | null, timeoutMs = 10000): Promise<DetailPatch | "unavailable"> {
  if (!code) return Promise.resolve("unavailable");
  const key = detailKey(code, manufacturer);
  const cached = detailCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const ongoing = inflight.get(key);
  if (ongoing) return ongoing;

  const run = (async (): Promise<DetailPatch | "unavailable"> => {
    try {
      const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs));
      const call = supabase.functions.invoke("jm-proxy", {
        body: { action: "partDetail", payload: { code, manufacturer } },
      });
      const res = await Promise.race([call, timeout]);
      if (res === "timeout") {
        const fb = await kitoemFallback(code);
        if (fb) { detailCache.set(key, fb); return fb; }
        return "unavailable";
      }
      const { data } = res as any;
      const item = data?.data?.item || data?.item;
      if (!item) {
        const fb = await kitoemFallback(code);
        if (fb) { detailCache.set(key, fb); return fb; }
        detailCache.set(key, "unavailable");
        return "unavailable";
      }
      const patch: DetailPatch = {
        image_urls: Array.isArray(item.image_urls) && item.image_urls.length > 0 ? item.image_urls : undefined,
        oe_numbers: Array.isArray(item.oe_numbers) && item.oe_numbers.length > 0 ? item.oe_numbers : undefined,
        technical_parameters:
          item.technical_parameters && Object.keys(item.technical_parameters).length > 0 ? item.technical_parameters : undefined,
        description: item.description || undefined,
        stock: typeof item.stock === "number" ? item.stock : undefined,
        compatible_vehicles: Array.isArray(item.compatible_vehicles) && item.compatible_vehicles.length > 0 ? item.compatible_vehicles : undefined,
        price_with_vat: typeof item.price_with_vat === "number" ? item.price_with_vat : undefined,
        price_without_vat: typeof item.price_without_vat === "number" ? item.price_without_vat : undefined,
        availability: item.availability || undefined,
      };
      if (!patch.image_urls || !patch.description || !patch.technical_parameters) {
        const fb = await kitoemFallback(code);
        if (fb) {
          if (!patch.image_urls && fb.image_urls) patch.image_urls = fb.image_urls;
          if (!patch.description && fb.description) patch.description = fb.description;
          if (!patch.technical_parameters && fb.technical_parameters) patch.technical_parameters = fb.technical_parameters;
        }
      }
      detailCache.set(key, patch);
      return patch;
    } catch {
      const fb = await kitoemFallback(code);
      if (fb) { detailCache.set(key, fb); return fb; }
      return "unavailable";
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

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

// --------- Detail modal ---------
const PartDetailModal = ({
  open,
  onOpenChange,
  part,
  onOrder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  part: CatalogPart;
  onOrder: (p: CatalogPart) => void;
}) => {
  const isJm = part.catalog_source?.toLowerCase() === "jm";
  const [patch, setPatch] = useState<DetailPatch | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");

  useEffect(() => {
    if (!open || !isJm) return;
    const cached = detailCache.get(detailKey(part.oem_number, part.manufacturer));
    if (cached && cached !== "unavailable") {
      setPatch(cached);
      setState("ready");
      return;
    }
    setState("loading");
    let cancelled = false;
    fetchPartDetail(part.oem_number, part.manufacturer).then((res) => {
      if (cancelled) return;
      if (res === "unavailable") {
        setState("unavailable");
      } else {
        setPatch(res);
        setState("ready");
      }
    });
    return () => { cancelled = true; };
  }, [open, isJm, part.oem_number, part.manufacturer]);

  const m = { ...part, ...(patch || {}) } as CatalogPart;
  const photos = (m.image_urls && m.image_urls.length > 0 ? m.image_urls : []).filter(Boolean);
  const hasPrice = !!(m.price_with_vat && m.price_with_vat > 0);
  const isOem = m.is_oem;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug pr-6">{m.name}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant={isOem ? "default" : "secondary"}
            className={cn("text-[10px] px-1.5 py-0 h-5", isOem ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
          >
            {isOem ? <ShieldCheck className="w-3 h-3 mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            {isOem ? "ORIGINÁL ⭐" : "NÁHRADA"}
          </Badge>
          {m.manufacturer && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-semibold uppercase">
              {m.manufacturer}
            </Badge>
          )}
          <StockPill stock={m.stock} hasPrice={hasPrice} />
          <span className="text-[10px] text-muted-foreground font-mono ml-auto">{m.oem_number}</span>
        </div>

        {/* Photo gallery */}
        {photos.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.slice(0, 12).map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener"
                className="w-28 h-28 shrink-0 rounded border border-border/30 bg-secondary/40 overflow-hidden flex items-center justify-center hover:border-primary/40 transition-colors"
              >
                <img src={url} alt={`${m.name} ${i + 1}`} className="w-full h-full object-contain" loading="lazy" />
              </a>
            ))}
          </div>
        ) : (
          <div className="w-full h-40 rounded bg-secondary/40 flex items-center justify-center text-muted-foreground/60">
            <Package className="w-10 h-10" />
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg bg-secondary/40 border border-border/30 p-3">
          <div>
            <div className={cn("text-xl font-bold", isOem ? "text-primary" : "text-foreground")}>{formatPrice(m.price_with_vat)}</div>
            {m.price_without_vat !== null && m.price_without_vat !== undefined && (
              <div className="text-[10px] text-muted-foreground">{formatPrice(m.price_without_vat)} bez DPH</div>
            )}
          </div>
          <Button onClick={() => onOrder(m)}>
            <ShoppingCart className="w-4 h-4 mr-2" />
            {hasPrice ? "Objednat" : "Poptat"}
          </Button>
        </div>

        {/* Loading / unavailable states */}
        {state === "loading" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Načítám detail…
          </div>
        )}
        {state === "unavailable" && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-2">
            <AlertTriangle className="w-4 h-4" />
            Zobrazujeme základní data. Detailní informace dohledáme do několika minut.
          </div>
        )}

        {m.technical_parameters && Object.keys(m.technical_parameters).length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Technické parametry
            </p>
            <TechParams params={m.technical_parameters} />
          </div>
        )}

        {m.oe_numbers && m.oe_numbers.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              OE čísla ({m.oe_numbers.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {m.oe_numbers.map((oe) => (
                <span key={oe} className="text-[10px] font-mono bg-secondary/60 text-foreground px-1.5 py-0.5 rounded">
                  {oe}
                </span>
              ))}
            </div>
          </div>
        )}

        {m.description && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Popis</p>
            <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line">{m.description}</p>
          </div>
        )}

        {m.compatible_vehicles && Array.isArray(m.compatible_vehicles) && m.compatible_vehicles.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Kompatibilní vozidla
            </p>
            <ul className="text-xs text-foreground/90 space-y-0.5 max-h-40 overflow-y-auto pr-1">
              {m.compatible_vehicles.slice(0, 30).map((v, i) => (
                <li key={i}>• {v}</li>
              ))}
              {m.compatible_vehicles.length > 30 && (
                <li className="text-muted-foreground/70">+{m.compatible_vehicles.length - 30} dalších</li>
              )}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// --------- Row (no inline lazy load — modal-only) ---------
const PartRow = ({ p, onOrder, supersededCount }: { p: CatalogPart; onOrder: (p: CatalogPart) => void; supersededCount?: number }) => {
  const [open, setOpen] = useState(false);
  const isOem = p.is_oem;
  const photo = p.image_urls?.[0];
  const oePreview = (p.oe_numbers || []).slice(0, 3);
  const hasPrice = !!(p.price_with_vat && p.price_with_vat > 0);

  return (
    <>
      <div
        className={cn(
          "relative flex flex-col gap-2 p-3 rounded-xl border bg-card transition-all cursor-pointer hover:border-primary/40",
          isOem ? "border-primary/40 shadow-sm" : "border-border/40"
        )}
        onClick={() => setOpen(true)}
      >
        {isOem && (
          <div className="absolute -top-px left-3 right-3 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        )}

        <div className="flex gap-3">
          <div className="w-20 h-20 shrink-0 rounded-lg bg-secondary/40 overflow-hidden flex items-center justify-center border border-border/30">
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
              {p.manufacturer && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-5 shrink-0 font-semibold uppercase tracking-wide",
                    isOem ? "border-primary/30 text-primary" : "border-amber-500/40 text-amber-600 dark:text-amber-400"
                  )}
                >
                  {p.manufacturer}
                </Badge>
              )}
              <StockPill stock={p.stock} hasPrice={hasPrice} />
              {(p.tecdoc_section || p.category) && (
                <span className="text-[10px] text-muted-foreground/70 truncate ml-auto">
                  {p.tecdoc_section || p.category}
                </span>
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

            {oePreview.length > 0 && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 font-semibold">OE:</span>
                {oePreview.map((oe) => (
                  <span key={oe} className="text-[10px] font-mono bg-secondary/60 text-foreground/80 px-1 py-px rounded">
                    {oe}
                  </span>
                ))}
                {(p.oe_numbers?.length || 0) > 3 && (
                  <span className="text-[10px] text-muted-foreground/70">+{(p.oe_numbers!.length - 3)}</span>
                )}
              </div>
            )}

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
              <Button
                size="sm"
                className="h-7 text-xs px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onOrder(p);
                }}
              >
                <ShoppingCart className="w-3 h-3 mr-1" />
                {hasPrice ? "Objednat" : "Poptat"}
              </Button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors self-start"
        >
          Zobrazit detaily →
        </button>
      </div>

      {open && (
        <PartDetailModal open={open} onOpenChange={setOpen} part={p} onOrder={onOrder} />
      )}
    </>
  );
};

// --------- Grouping (unchanged) ---------
const normalizeOem = (oem: string): string =>
  (oem || "").toUpperCase().replace(/[\s\-._/]/g, "").replace(/^K/, "");

const baseEightDigits = (oem: string): string =>
  normalizeOem(oem).match(/^\d{8}/)?.[0] || normalizeOem(oem).replace(/[A-Z]{1,3}$/i, "");

const normalizeText = (value: string): string =>
  (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

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
  const prefetchedKeyRef = useRef<string>("");

  const grouped = useMemo(() => (items.length > 0 ? collapseSupersessions(items) : []), [items]);

  const sorted = useMemo(
    () =>
      [...grouped].sort((a, b) => {
        const oemA = a.is_oem ? 1 : 0;
        const oemB = b.is_oem ? 1 : 0;
        if (oemA !== oemB) return oemB - oemA;
        const priceA = (a.price_with_vat ?? 0) > 0 ? 1 : 0;
        const priceB = (b.price_with_vat ?? 0) > 0 ? 1 : 0;
        if (priceA !== priceB) return priceB - priceA;
        return 0;
      }),
    [grouped],
  );

  // Background prefetch: warm detail cache for the top 10 most relevant aftermarket items.
  useEffect(() => {
    if (sorted.length === 0) return;
    const key = sorted
      .slice(0, 10)
      .map((p) => p.oem_number)
      .join("|");
    if (key === prefetchedKeyRef.current) return;
    prefetchedKeyRef.current = key;

    const codes = sorted
      .filter((p) => p.catalog_source?.toLowerCase() === "jm")
      .slice(0, 10)
      .map((p) => p.oem_number);

    let cancelled = false;
    // Stagger so we don't burst the proxy with parallel calls.
    (async () => {
      for (const code of codes) {
        if (cancelled) break;
        const part = sorted.find((p) => p.oem_number === code);
        if (detailCache.has(detailKey(code, part?.manufacturer))) continue;
        fetchPartDetail(code, part?.manufacturer).catch(() => {});
        await new Promise((r) => setTimeout(r, 120));
      }
    })();
    return () => { cancelled = true; };
  }, [sorted]);

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
      {sorted.map((p) => (
        <PartRow key={p.id} p={p} onOrder={onOrder} supersededCount={(p as any).supersededCount} />
      ))}
    </div>
  );
};

export default CatalogListing;
