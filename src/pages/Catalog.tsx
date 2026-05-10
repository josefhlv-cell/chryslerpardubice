/**
 * Unified Catalog — 5-level Nextis drill-down.
 * Brand → Model → Engine → Category → Parts (OEM/Mopar locked to top).
 */
import { forwardRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
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
import VinAndOemSearch from "@/components/catalog/VinAndOemSearch";

const BRAND_ORDER = ["Chrysler", "Dodge", "RAM"];

function formatVehicleDetails(vehicle?: NextisVehicle) {
  if (!vehicle) return "";
  const metadata = (vehicle.metadata || {}) as Record<string, unknown>;
  const kw = vehicle.power_kw ? `${vehicle.power_kw} kW` : "";
  const hp = vehicle.power_kw ? `${Math.round(vehicle.power_kw * 1.341)} HP` : "";
  const fuel = String(vehicle.fuel || metadata.fuel || (/crd|diesel/i.test(vehicle.engine || "") ? "Nafta" : "Benzín"));
  const displacement = String(metadata.displacement || metadata.displacement_cc || "");
  const engineCode = String(metadata.engine_code || metadata.engineCode || "");
  const years = vehicle.year_from ? `${vehicle.year_from}${vehicle.year_to ? `-${vehicle.year_to}` : "+"}` : "";
  return [kw && hp ? `${kw} / ${hp}` : kw, fuel, displacement, engineCode, years].filter(Boolean).join(" · ");
}

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

function findNodeWithParent(
  nodes: CatalogCategoryNode[],
  targetId: string,
  parent: CatalogCategoryNode | null = null,
): { node: CatalogCategoryNode; parent: CatalogCategoryNode | null } | null {
  for (const node of nodes) {
    if (node.id === targetId) return { node, parent };
    if (node.children?.length) {
      const found = findNodeWithParent(node.children, targetId, node);
      if (found) return found;
    }
  }
  return null;
}

function partMatchesNode(part: any, node: any): boolean {
  const normalize = (s: string) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const haystack = normalize(`${part.name} ${part.description || ""}`);
  const partCategory = normalize(part.category);
  const nodeLabelNorm = normalize(node.label);

  if (part.catalog_source === "jm") {
    if (!part.category || part.category.trim() === "") {
      return node.keywords.some((keyword: string) =>
        haystack.includes(normalize(keyword))
      );
    }
    if (partCategory !== nodeLabelNorm) {
      return false;
    }
  }

  return node.keywords.some((keyword: string) =>
    haystack.includes(normalize(keyword))
  );
}

const BRAKE_SUBTYPES: { id: string; label: string; keywords: string[] }[] = [
  { id: "caliper", label: "Třmen", keywords: ["třmen", "trmen", "sattel", "caliper"] },
  { id: "disc", label: "Kotouč", keywords: ["kotouč", "kotouc", "scheibe", "disc", "rotor"] },
  { id: "pads", label: "Destičky", keywords: ["destič", "destic", "belag", "klotz", "pad"] },
  { id: "drum", label: "Bubny / čelisti", keywords: ["bubn", "drum", "trommel", "čelist", "celist", "shoe", "backe"] },
  { id: "hose", label: "Hadice / trubky", keywords: ["hadic", "trubk", "hose", "leitung", "line"] },
  { id: "fluid", label: "Brzd. kapalina", keywords: ["kapalin", "fluid", "dot", "brzdov.*olej", "brake.*fluid"] },
  { id: "abs", label: "ABS / senzor", keywords: ["abs", "senzor", "sensor"] },
  { id: "cylinder", label: "Válec", keywords: ["válec", "valec", "zylinder", "cylinder"] },
];

function isBrakeCategory(label: string | undefined | null) {
  if (!label) return false;
  return /brzd/i.test(label);
}

function partMatchesBrakeSubtype(part: CatalogPart, subtypeId: string): boolean {
  if (subtypeId === "all") return true;
  const sub = BRAKE_SUBTYPES.find((s) => s.id === subtypeId);
  if (!sub) return true;
  const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hay = `${norm(part.name || "")} ${norm(part.category || "")}`;
  return sub.keywords.some((k) => new RegExp(norm(k)).test(hay));
}

const Catalog = forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const { user, canPlaceOrder } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const jmEnabled = isEnabled("catalog_jm");

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
  const [brakeSubtype, setBrakeSubtype] = useState<string>("all");

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
    if (!brand) { setModels([]); return; }
    setLoading(true);
    fetchModelsForBrand(brand)
      .then(setModels)
      .catch((e) => toast.error("Nelze načíst modely: " + e.message))
      .finally(() => setLoading(false));
  }, [brand]);

  useEffect(() => {
    if (!brand || !model) { setEngines([]); return; }
    setLoading(true);
    fetchNextisVehicles(brand, model)
      .then((rows) => {
        setVehicles(rows);
        setEngines([...new Set(rows.map((r) => r.engine).filter(Boolean))] as string[]);
      })
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
        if (!vehicleId) { setCategories([]); return; }
        const tree = await fetchJmCategoryTree({
          nextisVehicleId: vehicleId,
          brand, model, engine,
          year: vehicle?.year_from || undefined,
          powerKw: vehicle?.power_kw || undefined,
        });
        setCategories(tree);
      })
      .catch((e) => toast.error("Nelze načíst kategorie: " + e.message))
      .finally(() => setLoading(false));
  }, [brand, model, engine]);

  useEffect(() => {
    if (!brand || !model || !engine || !category) {
      setItems([]); setTotal(0); setJmCount(0); return;
    }

    let cancelled = false;
    (async () => {
      try {
        setListLoading(true);
        setJmLoading(true);

        const [oemRes, jmVehicleRes] = await Promise.allSettled([
          listPartsForVehicle({
            brand, model, engine,
            nextisVehicleId: selectedVehicleId,
            year: vehicles.find((v) => v.id === selectedVehicleId)?.year_from || undefined,
            categoryNodeId: category.id,
            canonicalCategory: category.label,
            categoryKeywords: category.keywords,
            page, pageSize: 30,
          }),
          page === 0 && jmEnabled
            ? fetchJmForVehicle({
                brand, model, engine,
                nextisVehicleId: selectedVehicleId,
                year: vehicles.find((v) => v.id === selectedVehicleId)?.year_from || undefined,
                powerKw: vehicles.find((v) => v.id === selectedVehicleId)?.power_kw || undefined,
                sectionId: category.sectionId,
                category: category.label,
                categoryId: category.id,
                categoryKeywords: category.keywords,
                parentKeywords: findNodeWithParent(categories, category.id)?.parent?.keywords || [],
              })
            : Promise.resolve({ items: [] as CatalogPart[], warning: undefined as string | undefined }),
        ]);

        if (cancelled) return;

        const { items: oemItems, total: oemTotal } = oemRes.status === "fulfilled" ? oemRes.value : { items: [], total: 0 };
        const jmVehiclePayload = jmVehicleRes.status === "fulfilled" ? jmVehicleRes.value : { items: [] as CatalogPart[] };
        const jmFromVehicle = jmVehiclePayload.items || [];

        setItems(oemItems);
        setTotal(oemTotal);

        let jmByCodes: CatalogPart[] = [];
        if (jmEnabled && page === 0 && oemItems.length > 0) {
          const uniqueCodes = [...new Set(oemItems.map((p) => p.oem_number).filter(Boolean))].slice(0, 10);
          try {
            jmByCodes = await fetchJmByCodes(uniqueCodes);
          } catch (jmErr) {
            console.error("[Catalog] J+M by codes failed:", jmErr);
          }
        }

        const allJm = [...jmByCodes, ...jmFromVehicle].filter((part) => {
          if (part.catalog_source !== "jm") return partMatchesNode(part, category);
          if (!part.category || part.category.trim() === "") return true;
          return partMatchesNode(part, category);
        });

        if (cancelled) return;
        setJmCount(allJm.length);
        const merged = mergeWithJm(oemItems, allJm);
        setItems(merged);
        setTotal(merged.length);

        if (allJm.length === 0 && oemItems.length === 0 && page === 0) {
          setJmWarning(((jmVehiclePayload as any).warning as string) || `Pro ${brand} ${model}${engine ? " · " + engine : ""} se nepodařilo načíst náhrady.`);
        } else {
          setJmWarning(null);
        }
      } catch (err: any) {
        if (!cancelled) { toast.error("Chyba načítání: " + err.message); setItems([]); }
      } finally {
        if (!cancelled) { setListLoading(false); setJmLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [brand, model, engine, selectedVehicleId, category, page]);

  useEffect(() => {
    setPage(0);
    setBrakeSubtype("all");
  }, [brand, model, engine, category]);

  const handleOrder = async (p: CatalogPart) => {
    if (!user) { toast.error("Pro objednávku se přihlaste"); navigate("/auth"); return; }
    if (!canPlaceOrder) { toast.error("Účet ještě nebyl schválen."); return; }
    try {
      const isLiveJm = p.id.startsWith("jm:") || p.catalog_source === "jm";
      const unitPrice = p.price_without_vat ?? (p.price_with_vat !== null ? Math.round((p.price_with_vat / 1.21) * 100) / 100 : null);
      const isInquiry = !unitPrice || unitPrice <= 0;
      let customerNote: string | null = null;
      if (isInquiry) {
        customerNote = window.prompt(
          `Díl "${p.name}" je bez ceny. Napište prosím váš dotaz / poptávku (množství, termín, doplňující info):`,
          ""
        );
        if (customerNote === null) return; // cancelled
      }
      const { error } = await supabase.from("orders").insert({
        user_id: user.id,
        part_id: isLiveJm ? null : p.id,
        order_type: isInquiry ? ("inquiry" as const) : ("new" as const),
        quantity: 1,
        unit_price: unitPrice,
        part_name: p.name,
        oem_number: p.oem_number,
        catalog_source: p.catalog_source,
        customer_note: customerNote,
      });
      if (error) throw error;
      toast.success(isInquiry ? `Poptávka "${p.name}" odeslána` : `Objednávka "${p.name}" vytvořena`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const step: Step = !brand ? "brand" : !model ? "model" : !engine ? "engine" : !category ? "category" : "parts";

  const stepTitle: Record<Step, string> = {
    brand: "Vyberte značku vozidla",
    model: `Vyberte model — ${brand}`,
    engine: `Vyberte motorizaci — ${brand} ${model}`,
    category: `Vyberte kategorii — ${brand} ${model} · ${engine}`,
    parts: `${brand} ${model} · ${engine} › ${category?.label || "Díly"}`,
  };

  const goBack = () => {
    if (step === "parts") setCategory(null);
    else if (step === "category" && categoryPath.length > 0) setCategoryPath((path) => path.slice(0, -1));
    else if (step === "category") setEngine("");
    else if (step === "engine") setModel("");
    else if (step === "model") setBrand("");
  };

  const resetAll = () => {
    setBrand(""); setModel(""); setEngine(""); setSelectedVehicleId("");
    setCategory(null); setCategoryPath([]); setCategoryQuery("");
  };

  const breadcrumb = [brand, model, engine, category?.label].filter(Boolean);
  const visibleCategories = categoryQuery.trim()
    ? flattenCategoryTree(categories).filter((node) =>
        [node.label, ...node.path, ...node.keywords].join(" ").toLowerCase().includes(categoryQuery.trim().toLowerCase())
      )
    : getCategoryLevel(categories, categoryPath);

  return (
    <div ref={ref} className="min-h-screen pb-24 lg:pb-8 bg-background">
      <div className="border-b border-border/30 bg-background/95 backdrop-blur-2xl sticky top-14 z-30">
        <div className="max-w-[1400px] mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl md:text-2xl font-bold tracking-tight">Katalog dílů</h1>
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
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetAll}>Začít znovu</Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-8">
        <VinAndOemSearch
          onOrder={handleOrder}
          onVehicleSelected={({ brand: b, model: m, engine: e }) => {
            // Match brand against known list (case-insensitive)
            const matchedBrand = brands.find((x) => x.toLowerCase() === b.toLowerCase()) || b;
            setBrand(matchedBrand);
            setModel(m);
            if (e) setEngine(e);
            setCategory(null);
            setCategoryPath([]);
          }}
        />
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
              <button key={b} onClick={() => setBrand(b)}
                className="group relative flex flex-col items-center justify-center p-6 rounded-2xl border border-border/40 bg-card hover:border-primary/60 hover:bg-card/80 hover:shadow-[0_0_30px_-10px_hsl(var(--primary)/0.4)] transition-all">
                <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Car className="w-7 h-7" />
                </div>
                <h3 className="font-semibold text-sm">{b}</h3>
              </button>
            ))}
          </div>
        )}

        {step === "model" && !loading && (
          models.length === 0
            ? <div className="text-center py-16 text-sm text-muted-foreground">Žádné modely pro <strong>{brand}</strong>.</div>
            : <div className="rounded-xl border border-border/40 bg-card divide-y divide-border/30 overflow-hidden">
                {models.map((m) => (
                  <button key={m} onClick={() => setModel(m)}
                    className="group w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      <Car className="w-4 h-4 text-primary/70 shrink-0" />
                      <span className="text-sm font-medium truncate">{m}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
        )}

        {step === "engine" && !loading && (
          engines.length === 0
            ? <div className="text-center py-16 text-sm text-muted-foreground">Žádné motorizace pro <strong>{brand} {model}</strong>.</div>
            : <div className="rounded-xl border border-border/40 bg-card divide-y divide-border/30 overflow-hidden">
                {engines.map((e) => {
                  const vehicle = vehicles.find((v) => v.engine === e);
                  const details = formatVehicleDetails(vehicle);
                  return (
                  <button key={e} onClick={() => setEngine(e)}
                    className="group w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      <Cog className="w-4 h-4 text-primary/70 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">{e}</span>
                        {details && <span className="block text-[11px] text-muted-foreground truncate">{details}</span>}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                );})}
              </div>
        )}

        {step === "category" && !loading && (
          categories.length === 0
            ? <div className="text-center py-16 text-sm text-muted-foreground">Žádné kategorie.</div>
            : <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input value={categoryQuery} onChange={(e) => setCategoryQuery(e.target.value)}
                    placeholder="Hledat kategorii nebo díl…" className="pl-9 bg-card border-border/40" />
                </div>
                {categoryPath.length > 0 && !categoryQuery && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setCategoryPath((p) => p.slice(0, -1))}>
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" /> O úroveň zpět
                  </Button>
                )}
                <div className="rounded-xl border border-border/40 bg-card divide-y divide-border/30 overflow-hidden">
                  {visibleCategories.length === 0 && (
                    <div className="p-6 text-center text-xs text-amber-300/80">
                      ⚠️ Pro toto vozidlo zatím nejsou v katalogu žádné kategorie s díly.
                    </div>
                  )}
                  {visibleCategories.map((c) => {
                    const Icon = CATEGORY_ICON[c.label] || Package;
                    const hasChildren = (c.children?.length || 0) > 0;
                    const isEmpty = (c.count || 0) === 0 && !hasChildren;
                    const emptyReason = isEmpty
                      ? "V této kategorii zatím nejsou napárované díly. Možné příčiny: chybí přiřazená kategorie u některých dílů, chybějící cena, nebo není napárování OEM ↔ vozidlo. Můžete kontaktovat servis, podívat se do globálního OEM hledání, nebo vyzkoušet jinou podkategorii."
                      : null;
                    return (
                      <div key={c.id} className={isEmpty ? 'bg-muted/10' : ''}>
                        <button
                          disabled={isEmpty}
                          onClick={() => { if (hasChildren && !categoryQuery) setCategoryPath((p) => [...p, c.id]); else setCategory(c); }}
                          className={`group w-full flex items-center justify-between gap-3 px-4 py-3 transition-colors text-left ${isEmpty ? 'opacity-60 cursor-not-allowed' : 'hover:bg-secondary/50'}`}
                          title={isEmpty ? 'Zatím bez napárovaných dílů — klikněte pro detail' : undefined}>
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon className="w-4 h-4 text-primary/70 shrink-0" />
                            <span className="text-sm font-medium truncate">{c.label}</span>
                            <Badge variant={isEmpty ? 'outline' : 'secondary'} className={`text-[10px] h-4 px-1.5 shrink-0 ${isEmpty ? 'border-amber-500/40 text-amber-300/80' : ''}`}>{c.count}</Badge>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                        </button>
                        {emptyReason && (
                          <details className="px-4 pb-2 -mt-1">
                            <summary className="text-[10px] text-amber-300/70 cursor-pointer hover:text-amber-300">Proč je prázdná?</summary>
                            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{emptyReason}</p>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
        )}

        {step === "parts" && (
          <>
            <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground gap-3 flex-wrap">
              <span>
                {total > 0
                  ? jmCount > 0 && total === jmCount ? `${jmCount} dílů (náhrady)` : `${total} dílů — OEM první`
                  : jmLoading ? "Hledám díly…" : "Žádné výsledky"}
                {jmCount > 0 && total !== jmCount && <span className="ml-2 text-primary">+ {jmCount} náhrad</span>}
              </span>
              {jmLoading && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                  <Loader2 className="w-3 h-3 animate-spin" /> Hledám náhrady…
                </span>
              )}
            </div>

            {jmWarning && !jmLoading && (
              <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-[12px] text-amber-200/90">
                ⚠️ {jmWarning}
              </div>
            )}

            {isBrakeCategory(category?.label) && items.length > 0 && (() => {
              const counts = BRAKE_SUBTYPES.map((s) => ({
                ...s,
                count: items.filter((p) => partMatchesBrakeSubtype(p, s.id)).length,
              })).filter((s) => s.count > 0);
              if (counts.length === 0) return null;
              return (
                <div className="mb-4 p-3 rounded-xl border border-border/40 bg-card/40">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Typ dílu</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setBrakeSubtype("all")}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${brakeSubtype === "all" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                      Vše <span className="opacity-60 ml-1">{items.length}</span>
                    </button>
                    {counts.map((s) => (
                      <button key={s.id} onClick={() => setBrakeSubtype(s.id)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${brakeSubtype === s.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                        {s.label} <span className="opacity-60 ml-1">{s.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <CatalogListing
              items={isBrakeCategory(category?.label) && brakeSubtype !== "all"
                ? items.filter((p) => partMatchesBrakeSubtype(p, brakeSubtype))
                : items}
              loading={listLoading && items.length === 0}
              onOrder={handleOrder}
              emptyHint="V této kategorii nejsou žádné díly."
            />

            {!listLoading && !jmLoading && items.length === 0 && (
              <div className="mt-6 p-6 rounded-2xl border border-dashed border-border/60 bg-card/40 text-center">
                <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mb-4">Nenašli jsme specifické díly, zkuste OEM vyhledávání.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

Catalog.displayName = "Catalog";
export default Catalog;
