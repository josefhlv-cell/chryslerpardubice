/**
 * Unified Catalog — 5-level Nextis drill-down.
 * Brand → Model → Engine → Category → Parts (OEM/Mopar locked to top).
 *
 * Single entry point. No tabs, no logos, no sidebars.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight, ChevronLeft, Loader2, Car, Wrench, Cog, Package,
  Snowflake, Zap, Filter as FilterIcon, Droplet, Disc, Gauge, Settings, Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import {
  fetchBrands, fetchModelsForBrand, fetchEnginesForModel,
  fetchNextisVehicles, fetchJmCategoryTree, listPartsForVehicle,
  fetchJmByCodes, fetchJmForVehicle, mergeWithJm,
  type CatalogPart, type CatalogCategoryNode, type NextisVehicle,
} from "@/api/catalogV2API";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import CatalogListing from "@/components/catalog/CatalogListing";
import GlobalOEMSearch from "@/components/catalog/GlobalOEMSearch";

const BRAND_ORDER = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"];

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "Brzdové zařízení": Disc,
  "Kotoučové brzdy": Disc,
  "Brzdové destičky": Disc,
  Brzdy: Disc,
  Motor: Cog,
  Chlazení: Snowflake,
  Odpružení: Gauge,
  Klimatizace: Snowflake,
  Elektroinstalace: Zap,
  Filtry: FilterIcon,
  "Palivový systém": Droplet,
  Převodovka: Settings,
  Výfuk: Wrench,
  Karoserie: Box,
  Interiér: Box,
  "Kapaliny a oleje": Droplet,
  "Kola a pneumatiky": Disc,
  Řízení: Wrench,
  Ostatní: Package,
};

type Step = "brand" | "model" | "engine" | "category" | "parts";

function flattenCategoryTree(nodes: CatalogCategoryNode[]): CatalogCategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategoryTree(node.children || [])]);
}

function getCategoryLevel(nodes: CatalogCategoryNode[], path: string[]): CatalogCategoryNode[] {
  let level = nodes;
  for (const id of path) {
    const found = level.find((node) => node.id === id);
    level = found?.children || [];
  }
  return level;
}

function partMatchesNode(part: CatalogPart, node: CatalogCategoryNode | null): boolean {
  if (!node || node.keywords.length === 0) return true;
  const haystack = `${part.name} ${part.category || ""} ${part.description || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return node.keywords.some((keyword) =>
    haystack.includes(keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())
  );
}

const Catalog = () => {
  const navigate = useNavigate();
  const { user, canPlaceOrder } = useAuth();

  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [engines, setEngines] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState<NextisVehicle[]>([]);
  const [categories, setCategories] = useState<CatalogCategoryNode[]>([]);
  const [categoryPath, setCategoryPath] = useState<string[]>([]);
  const [categoryQuery, setCategoryQuery] = useState("");

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [category, setCategory] = useState<CatalogCategoryNode | null>(null);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CatalogPart[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [jmLoading, setJmLoading] = useState(false);
  const [jmCount, setJmCount] = useState(0);
  const [jmWarning, setJmWarning] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchBrands()
      .then((bs) => {
        const sorted = [...bs].sort((a, b) => {
          const ia = BRAND_ORDER.indexOf(a);
          const ib = BRAND_ORDER.indexOf(b);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return a.localeCompare(b);
        });
        setBrands(sorted);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!brand) {
      setModels([]);
      return;
    }
    setLoading(true);
    fetchModelsForBrand(brand)
      .then(setModels)
      .catch((e) => toast.error("Nelze načíst modely: " + e.message))
      .finally(() => setLoading(false));
  }, [brand]);

  useEffect(() => {
    if (!brand || !model) {
      setEngines([]);
      return;
    }
    setLoading(true);
    fetchEnginesForModel(brand, model)
      .then(setEngines)
      .catch((e) => toast.error("Nelze načíst motorizace: " + e.message))
      .finally(() => setLoading(false));
  }, [brand, model]);

  useEffect(() => {
    if (!brand || !model || !engine) {
      setVehicles([]);
      setSelectedVehicleId("");
      setCategories([]);
      setCategoryPath([]);
      return;
    }
    setLoading(true);
    fetchNextisVehicles(brand, model)
      .then(async (rows) => {
        setVehicles(rows);
        const vehicle = rows.find((v) => v.engine === engine) || rows[0];
        const vehicleId = vehicle?.id || "";
        setSelectedVehicleId(vehicleId);
        setCategoryPath([]);
        setCategory(null);
        setCategoryQuery("");
        if (!vehicleId) {
          setCategories([]);
          return;
        }
        const tree = await fetchJmCategoryTree({ nextisVehicleId: vehicleId, brand, model, engine });
        setCategories(tree);
      })
      .catch((e) => toast.error("Nelze načíst kategorie: " + e.message))
      .finally(() => setLoading(false));
  }, [brand, model, engine]);

  useEffect(() => {
    if (!brand || !model || !engine || !category) {
      setItems([]);
      setTotal(0);
      setJmCount(0);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setListLoading(true);
        setJmLoading(true);

        // PARALLEL: fetch OEM (local) AND J+M (vehicle search) simultaneously.
        // J+M runs INDEPENDENTLY of local results — even if 0 OEM parts found,
        // J+M aftermarket parts must show up.
        console.log(`[Catalog] Parallel fetch: OEM(local) + J+M(vehicle) for ${brand} ${model} ${engine}`);
        const [oemRes, jmVehicleRes] = await Promise.allSettled([
          listPartsForVehicle({
            brand, model, engine,
            canonicalCategory: category,
            page, pageSize: 30,
          }),
          page === 0
            ? fetchJmForVehicle({ brand, model, engine })
            : Promise.resolve({ items: [] as CatalogPart[], warning: undefined as string | undefined }),
        ]);
        if (cancelled) return;

        const { items: oemItems, total: oemTotal } =
          oemRes.status === "fulfilled" ? oemRes.value : { items: [], total: 0 };
        const jmVehiclePayload =
          jmVehicleRes.status === "fulfilled"
            ? jmVehicleRes.value
            : { items: [] as CatalogPart[], warning: "J+M dotaz selhal" };
        const jmFromVehicle = jmVehiclePayload.items || [];

        if (oemRes.status === "rejected") {
          console.error("[Catalog] OEM fetch failed:", oemRes.reason);
        }
        if (jmVehicleRes.status === "rejected") {
          console.warn("[Catalog] J+M vehicle search failed:", jmVehicleRes.reason);
        }

        // Filter J+M vehicle results by canonical category (best-effort)
        const filteredJmVehicle = category
          ? jmFromVehicle.filter((p) => {
              const c = (p.category || "").toLowerCase();
              const cat = category.toLowerCase();
              return !c || c.includes(cat) || cat.includes(c);
            })
          : jmFromVehicle;

        setItems(oemItems);
        setTotal(oemTotal);

        // Also enrich with J+M lookups for visible OEM codes (price+stock)
        let jmByCodes: CatalogPart[] = [];
        if (page === 0 && oemItems.length > 0) {
          const codes = oemItems.map((p) => p.oem_number).filter(Boolean);
          try {
            jmByCodes = await fetchJmByCodes(codes);
            console.log(`[Catalog] J+M by codes: ${jmByCodes.length}`);
          } catch (jmErr: any) {
            console.error("[Catalog] J+M by codes failed:", jmErr);
          }
        }

        // Merge both J+M streams (vehicle-search + by-codes)
        const allJm = [...jmByCodes, ...filteredJmVehicle];
        if (cancelled) return;
        setJmCount(allJm.length);
        const merged = mergeWithJm(oemItems, allJm);
        setItems(merged);
        setTotal(oemTotal + allJm.length);

        // Surface diagnostic when J+M returned 0 for this vehicle
        if (allJm.length === 0 && page === 0) {
          setJmWarning(
            jmVehiclePayload.warning ||
              `Pro ${brand} ${model}${engine ? " · " + engine : ""} se nepodařilo načíst aftermarket díly z J+M.`
          );
        } else {
          setJmWarning(null);
        }

        if (oemItems.length === 0 && allJm.length === 0) {
          console.log("[Catalog] Empty: no OEM, no J+M for this category");
        }
      } catch (err: any) {
        if (!cancelled) {
          toast.error("Chyba načítání: " + err.message);
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setListLoading(false);
          setJmLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [brand, model, engine, category, page]);

  useEffect(() => {
    setPage(0);
  }, [brand, model, engine, category]);

  const handleOrder = async (p: CatalogPart) => {
    if (!user) {
      toast.error("Pro objednávku se přihlaste");
      navigate("/auth");
      return;
    }
    if (!canPlaceOrder) {
      toast.error("Účet ještě nebyl schválen.");
      return;
    }

    try {
      // J+M items use a synthetic id `jm:OEM` and are not stored in parts_new,
      // so we must order them by name + OEM only (no part_id FK).
      const isLiveJm = p.id.startsWith("jm:") || p.catalog_source === "jm";
      const { error } = await supabase.from("orders").insert({
        user_id: user.id,
        part_id: isLiveJm ? null : p.id,
        order_type: "new" as const,
        quantity: 1,
        unit_price: p.price_without_vat,
        part_name: p.name,
        oem_number: p.oem_number,
        catalog_source: p.catalog_source,
      });
      if (error) throw error;
      toast.success(`Objednávka "${p.name}" vytvořena`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const step: Step = !brand
    ? "brand"
    : !model
      ? "model"
      : !engine
        ? "engine"
        : !category
          ? "category"
          : "parts";

  const stepTitle: Record<Step, string> = {
    brand: "Vyberte značku vozidla",
    model: `Vyberte model — ${brand}`,
    engine: `Vyberte motorizaci — ${brand} ${model}`,
    category: `Vyberte kategorii — ${brand} ${model} · ${engine}`,
    parts: `${brand} ${model} · ${engine} › ${category}`,
  };

  const goBack = () => {
    if (step === "parts") setCategory("");
    else if (step === "category") setEngine("");
    else if (step === "engine") setModel("");
    else if (step === "model") setBrand("");
  };

  const resetAll = () => {
    setBrand("");
    setModel("");
    setEngine("");
    setCategory("");
  };

  const breadcrumb = [brand, model, engine, category].filter(Boolean);

  return (
    <div className="min-h-screen pb-24 lg:pb-8 bg-background">
      <div className="border-b border-border/30 bg-background/95 backdrop-blur-2xl sticky top-14 z-30">
        <div className="max-w-[1400px] mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl md:text-2xl font-bold tracking-tight">
                Katalog dílů
              </h1>
              {breadcrumb.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
                  {breadcrumb.map((b, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      {i > 0 && <ChevronRight className="w-3 h-3 opacity-50" />}
                      <span className={i === breadcrumb.length - 1 ? "text-primary font-medium" : ""}>{b}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step !== "brand" && (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goBack}>
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Zpět
                </Button>
              )}
              {(brand || model || engine || category) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetAll}>
                  Začít znovu
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-8">
        <GlobalOEMSearch onOrder={handleOrder} />

        <div className="mb-6">
          <h2 className="text-base md:text-lg font-semibold tracking-tight">{stepTitle[step]}</h2>
        </div>

        {loading && step !== "parts" && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {step === "brand" && !loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {brands.map((b) => (
              <button
                key={b}
                onClick={() => setBrand(b)}
                className="group relative flex flex-col items-center justify-center p-6 rounded-2xl border border-border/40 bg-card hover:border-primary/60 hover:bg-card/80 hover:shadow-[0_0_30px_-10px_hsl(var(--primary)/0.4)] transition-all"
              >
                <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Car className="w-7 h-7" />
                </div>
                <h3 className="font-semibold text-sm">{b}</h3>
              </button>
            ))}
          </div>
        )}

        {step === "model" && !loading && (
          models.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              Pro značku <strong>{brand}</strong> nejsou v katalogu žádné modely.
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-card divide-y divide-border/30 overflow-hidden">
              {models.map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className="group w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Car className="w-4 h-4 text-primary/70 shrink-0" />
                    <span className="text-sm font-medium truncate">{m}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              ))}
            </div>
          )
        )}

        {step === "engine" && !loading && (
          engines.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              Pro <strong>{brand} {model}</strong> nejsou definovány motorizace.
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-card divide-y divide-border/30 overflow-hidden">
              {engines.map((e) => (
                <button
                  key={e}
                  onClick={() => setEngine(e)}
                  className="group w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Cog className="w-4 h-4 text-primary/70 shrink-0" />
                    <span className="text-sm font-medium truncate">{e}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              ))}
            </div>
          )
        )}

        {step === "category" && !loading && (
          categories.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              Pro toto vozidlo zatím nejsou v katalogu žádné díly.
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-card divide-y divide-border/30 overflow-hidden">
              {categories.map((c) => {
                const Icon = CATEGORY_ICON[c.canonical] || Package;
                return (
                  <button
                    key={c.canonical}
                    onClick={() => setCategory(c.canonical)}
                    className="group w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4 h-4 text-primary/70 shrink-0" />
                      <span className="text-sm font-medium truncate">{c.canonical}</span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">{c.count}</Badge>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                );
              })}
            </div>
          )
        )}

        {step === "parts" && (
          <>
            <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground gap-3 flex-wrap">
              <span>
                {total > 0 ? `${total} dílů — Mopar / OEM první` : "Žádné výsledky"}
                {jmCount > 0 && (
                  <span className="ml-2 text-primary">+ {jmCount} z J+M Autodíly</span>
                )}
              </span>
              {jmLoading && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Hledám živou nabídku J+M…
                </span>
              )}
            </div>

            {jmWarning && !jmLoading && (
              <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-[12px] text-amber-200/90">
                ⚠️ {jmWarning}
              </div>
            )}

            <CatalogListing
              items={items}
              loading={listLoading && items.length === 0}
              onOrder={handleOrder}
              emptyHint="V této kategorii zatím nejsou žádné díly."
            />

            {/* UI Fallback — when nothing found, offer direct OEM search */}
            {!listLoading && !jmLoading && items.length === 0 && (
              <div className="mt-6 p-6 rounded-2xl border border-dashed border-border/60 bg-card/40 text-center">
                <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mb-4">
                  Nenašli jsme specifické díly pro tento motor, zkuste hledat podle OEM kódu.
                </p>
                <p className="text-[11px] text-muted-foreground/70">
                  Použijte vyhledávání OEM kódu výše ↑
                </p>
              </div>
            )}

            {total > 30 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  Předchozí
                </Button>
                <span className="text-xs text-muted-foreground">
                  Strana {page + 1} / {Math.ceil(total / 30)}
                </span>
                <Button variant="outline" size="sm" disabled={(page + 1) * 30 >= total} onClick={() => setPage((p) => p + 1)}>
                  Další
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Catalog;
