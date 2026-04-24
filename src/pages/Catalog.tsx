/**
 * Catalog v2 — Funkční drill-down: Značka → Model → Motor → Kategorie → Díly.
 * Routes: /catalog (a /shop přesměruje sem)
 *
 * Data jsou derivována dynamicky z parts_new.compatible_vehicles, takže funguje
 * i bez naplněného catalog_categories / nextis_vehicles stromu.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, ChevronRight, Loader2, Car, Wrench, Cog, Package,
  Snowflake, Zap, Filter as FilterIcon, Droplet, Disc, Gauge, Settings, Box,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import {
  fetchBrands, fetchModelsForBrand, fetchEnginesForModel,
  fetchCategoriesForVehicle, listPartsForVehicle,
  type CatalogPart, type CategoryTile,
} from "@/api/catalogV2API";
import CatalogListing from "@/components/catalog/CatalogListing";

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
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

const Catalog = () => {
  const navigate = useNavigate();
  const { user, canPlaceOrder } = useAuth();

  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [engines, setEngines] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryTile[]>([]);

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");
  const [category, setCategory] = useState("");

  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingEngines, setLoadingEngines] = useState(false);
  const [loadingCats, setLoadingCats] = useState(false);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<CatalogPart[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [page, setPage] = useState(0);

  // Init brands
  useEffect(() => {
    fetchBrands().then(setBrands).catch((e) => toast.error(e.message));
  }, []);

  // Brand → models
  useEffect(() => {
    if (!brand) { setModels([]); return; }
    setLoadingModels(true);
    fetchModelsForBrand(brand)
      .then(setModels)
      .catch((e) => toast.error("Nelze načíst modely: " + e.message))
      .finally(() => setLoadingModels(false));
  }, [brand]);

  // Model → engines
  useEffect(() => {
    if (!brand || !model) { setEngines([]); return; }
    setLoadingEngines(true);
    fetchEnginesForModel(brand, model)
      .then(setEngines)
      .catch((e) => toast.error("Nelze načíst motorizace: " + e.message))
      .finally(() => setLoadingEngines(false));
  }, [brand, model]);

  // Vehicle ready → categories
  useEffect(() => {
    if (!brand || !model) { setCategories([]); return; }
    setLoadingCats(true);
    fetchCategoriesForVehicle(brand, model, engine || undefined)
      .then(setCategories)
      .catch((e) => toast.error("Nelze načíst kategorie: " + e.message))
      .finally(() => setLoadingCats(false));
  }, [brand, model, engine]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Listing fetch — runs whenever vehicle + (category or search) is set
  useEffect(() => {
    if (!brand || !model) { setItems([]); setTotal(0); return; }
    if (!category && !debounced) { setItems([]); setTotal(0); return; }

    (async () => {
      try {
        setListLoading(true);
        const { items, total } = await listPartsForVehicle({
          brand, model,
          engine: engine || undefined,
          canonicalCategory: category || undefined,
          search: debounced || undefined,
          page, pageSize: 30,
        });
        setItems(items);
        setTotal(total);
      } catch (err: any) {
        toast.error("Chyba načítání: " + err.message);
        setItems([]);
      } finally {
        setListLoading(false);
      }
    })();
  }, [brand, model, engine, category, debounced, page]);

  useEffect(() => { setPage(0); }, [brand, model, engine, category, debounced]);

  const handleOrder = async (p: CatalogPart) => {
    if (!user) { toast.error("Pro objednávku se přihlaste"); navigate("/auth"); return; }
    if (!canPlaceOrder) { toast.error("Účet ještě nebyl schválen."); return; }
    try {
      const { error } = await supabase.from("orders").insert({
        user_id: user.id,
        part_id: p.id,
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

  const breadcrumb = [brand, model, engine, category].filter(Boolean).join(" › ");
  const vehicleSelected = !!(brand && model);
  const showResults = vehicleSelected && (category || debounced);

  const resetAll = () => {
    setBrand(""); setModel(""); setEngine(""); setCategory(""); setSearch("");
  };

  return (
    <div className="min-h-screen pb-24 lg:pb-8">
      {/* Sticky filter bar */}
      <div className="border-b border-border/30 bg-background/95 backdrop-blur-2xl sticky top-14 z-30">
        <div className="max-w-[1400px] mx-auto px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-lg md:text-xl font-bold tracking-tight">Katalog dílů</h1>
              {breadcrumb && (
                <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                  <Car className="w-3 h-3" /> {breadcrumb}
                </p>
              )}
            </div>
            {(brand || model || engine || category || search) && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetAll}>
                Vymazat
              </Button>
            )}
          </div>

          {/* Drill-down dropdowns */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <Select value={brand} onValueChange={(v) => { setBrand(v); setModel(""); setEngine(""); setCategory(""); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="1. Značka" /></SelectTrigger>
              <SelectContent>
                {brands.map((b) => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select
              value={model}
              disabled={!brand || loadingModels}
              onValueChange={(v) => { setModel(v); setEngine(""); setCategory(""); }}
            >
              <SelectTrigger className="h-9 text-xs">
                {loadingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <SelectValue placeholder="2. Model" />}
              </SelectTrigger>
              <SelectContent>
                {models.length === 0 && brand && !loadingModels && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Žádné modely</div>
                )}
                {models.map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select
              value={engine}
              disabled={!model || loadingEngines}
              onValueChange={(v) => { setEngine(v === "__all__" ? "" : v); setCategory(""); }}
            >
              <SelectTrigger className="h-9 text-xs">
                {loadingEngines ? <Loader2 className="w-3 h-3 animate-spin" /> : <SelectValue placeholder="3. Motor (volitelné)" />}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-xs">Všechny motorizace</SelectItem>
                {engines.map((e) => <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select
              value={category}
              disabled={!vehicleSelected || categories.length === 0}
              onValueChange={(v) => setCategory(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="h-9 text-xs">
                {loadingCats ? <Loader2 className="w-3 h-3 animate-spin" /> : <SelectValue placeholder="4. Kategorie" />}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-xs">Všechny kategorie</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.canonical} value={c.canonical} className="text-xs">
                    {c.canonical} ({c.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative col-span-2 lg:col-span-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="OEM nebo název"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* No vehicle yet → instructional state */}
        {!vehicleSelected && !debounced && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Car className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <h2 className="text-lg font-semibold mb-2">Vyberte vaše vozidlo</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Zvolte nahoře <strong>Značku</strong> a <strong>Model</strong> (případně <strong>Motor</strong>) a zobrazí se vám kategorie dílů
              s originálními Mopar díly nahoře a alternativami pod nimi.
            </p>
          </div>
        )}

        {/* Vehicle picked but no category yet → category cards */}
        {vehicleSelected && !category && !debounced && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Kategorie pro {brand} {model}{engine ? ` · ${engine}` : ""}</h2>
              {loadingCats && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </div>

            {!loadingCats && categories.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Pro toto vozidlo zatím nejsou v katalogu žádné díly. Zkuste vybrat jinou motorizaci nebo použijte vyhledávání.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {categories.map((c) => {
                  const Icon = CATEGORY_ICON[c.canonical] || Package;
                  return (
                    <button
                      key={c.canonical}
                      onClick={() => setCategory(c.canonical)}
                      className="group relative flex flex-col items-start p-4 rounded-xl border border-border/40 bg-card hover:border-primary/60 hover:shadow-md transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h3 className="font-semibold text-sm mb-1">{c.canonical}</h3>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{c.count} dílů</Badge>
                      <ChevronRight className="absolute top-4 right-4 w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {showResults && (
          <>
            <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
              <span>{total > 0 ? `${total} dílů` : "Žádné výsledky"}</span>
              {category && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCategory("")}>
                  ← Zpět na kategorie
                </Button>
              )}
            </div>

            <CatalogListing
              items={items}
              loading={listLoading}
              onOrder={handleOrder}
              emptyHint={debounced
                ? `Pro "${debounced}" nebyly nalezeny žádné díly.`
                : "V této kategorii zatím nejsou žádné díly."
              }
            />

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
