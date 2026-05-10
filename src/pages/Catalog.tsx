/**
 * Unified Catalog v3 — single-call J+M flow with TecDoc grouping.
 * Brand → Model → Engine → Category (TecDoc section) → Parts.
 * One round-trip to jm-proxy `partsForEngine`, then OEM-first locally.
 */
import { forwardRef, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight, ChevronLeft, ChevronDown, Loader2, Car, Wrench, Cog, Package,
  Snowflake, Zap, Filter as FilterIcon, Droplet, Disc, Gauge, Settings, Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import {
  fetchBrands, fetchModelsForBrand,
  fetchNextisVehicles,
  type CatalogPart, type NextisVehicle,
} from "@/api/catalogV2API";
import { fetchAllPartsForEngine, type CategoryGroup } from "@/services/catalogService";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import CatalogListing from "@/components/catalog/CatalogListing";
import VinAndOemSearch from "@/components/catalog/VinAndOemSearch";

const BRAND_ORDER = ["Chrysler", "Dodge", "RAM", "Lancia"];

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
  "Brzdové zařízení": Disc, "Kotoučové brzdy": Disc, "Brzdové destičky": Disc, Brzdy: Disc,
  Motor: Cog, Chlazení: Snowflake, Odpružení: Gauge, Klimatizace: Snowflake,
  Elektroinstalace: Zap, Filtry: FilterIcon, "Palivový systém": Droplet,
  Převodovka: Settings, Výfuk: Wrench, Karoserie: Box, Interiér: Box,
  "Kapaliny a oleje": Droplet, "Kola a pneumatiky": Disc, Řízení: Wrench, Ostatní: Package,
};

type Step = "brand" | "model" | "engine" | "category" | "parts";

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

const isBrakeCategory = (label?: string | null) => !!label && /brzd/i.test(label);

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
  const { user, canPlaceOrder, isAdmin } = useAuth();

  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [engines, setEngines] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState<NextisVehicle[]>([]);

  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<CategoryGroup | null>(null);

  const [loading, setLoading] = useState(false);
  const [partsLoading, setPartsLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [brakeSubtype, setBrakeSubtype] = useState<string>("all");

  // Brands
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

  // Models
  useEffect(() => {
    if (!brand) { setModels([]); return; }
    setLoading(true);
    fetchModelsForBrand(brand)
      .then(setModels)
      .catch((e) => toast.error("Nelze načíst modely: " + e.message))
      .finally(() => setLoading(false));
  }, [brand]);

  // Engines / vehicles
  useEffect(() => {
    if (!brand || !model) { setEngines([]); setVehicles([]); return; }
    setLoading(true);
    fetchNextisVehicles(brand, model)
      .then((rows) => {
        setVehicles(rows);
        setEngines([...new Set(rows.map((r) => r.engine).filter(Boolean))] as string[]);
      })
      .catch((e) => toast.error("Nelze načíst motorizace: " + e.message))
      .finally(() => setLoading(false));
  }, [brand, model]);

  // Single-call: load all parts grouped by category
  useEffect(() => {
    if (!brand || !model || !engine) {
      setGroups([]); setSelectedGroup(null); setSelectedVehicleId(""); return;
    }
    const vehicle = vehicles.find((v) => v.engine === engine) || vehicles[0];
    const vehicleId = vehicle?.id || "";
    setSelectedVehicleId(vehicleId);
    setSelectedGroup(null);
    setCategoryQuery("");
    setExpandedGroups(new Set());
    setLoading(true);
    setPartsLoading(true);
    setWarning(null);

    let cancelled = false;
    fetchAllPartsForEngine({ brand, model, engine, nextisVehicleId: vehicleId })
      .then((res) => {
        if (cancelled) return;
        setGroups(res.groups);
        setExpandedGroups(new Set(res.groups.slice(0, 8).map((g) => g.id)));
        setDebugInfo(res.debug || null);
        if (res.warning) setWarning(res.warning);
        if (res.groups.length === 0) setWarning(res.warning || "Pro toto vozidlo se nepodařilo načíst žádné díly.");
      })
      .catch((e) => {
        if (!cancelled) { toast.error("Chyba načítání: " + e.message); setGroups([]); }
      })
      .finally(() => {
        if (!cancelled) { setLoading(false); setPartsLoading(false); }
      });
    return () => { cancelled = true; };
  }, [brand, model, engine, vehicles]);

  useEffect(() => { setBrakeSubtype("all"); }, [selectedGroup]);

  const handleOrder = async (p: CatalogPart) => {
    if (!user) { toast.error("Pro objednávku se přihlaste"); navigate("/auth"); return; }
    if (!canPlaceOrder) { toast.error("Účet ještě nebyl schválen."); return; }
    try {
      const isLiveJm = p.id.startsWith("jm-") || p.id.startsWith("jm:") || p.catalog_source === "jm";
      const unitPrice = p.price_without_vat ?? (p.price_with_vat !== null ? Math.round((p.price_with_vat / 1.21) * 100) / 100 : null);
      const isInquiry = !unitPrice || unitPrice <= 0;
      let customerNote: string | null = null;
      if (isInquiry) {
        customerNote = window.prompt(
          `Díl "${p.name}" je bez ceny. Napište prosím váš dotaz / poptávku (množství, termín, doplňující info):`,
          ""
        );
        if (customerNote === null) return;
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

  const step: Step = !brand ? "brand" : !model ? "model" : !engine ? "engine" : !selectedGroup ? "category" : "parts";

  const stepTitle: Record<Step, string> = {
    brand: "Vyberte značku vozidla",
    model: `Vyberte model — ${brand}`,
    engine: `Vyberte motorizaci — ${brand} ${model}`,
    category: `Vyberte kategorii — ${brand} ${model} · ${engine}`,
    parts: `${brand} ${model} · ${engine} › ${selectedGroup?.label || "Díly"}`,
  };

  const goBack = () => {
    if (step === "parts") setSelectedGroup(null);
    else if (step === "category") setEngine("");
    else if (step === "engine") setModel("");
    else if (step === "model") setBrand("");
  };

  const resetAll = () => {
    setBrand(""); setModel(""); setEngine(""); setSelectedVehicleId("");
    setSelectedGroup(null); setCategoryQuery(""); setGroups([]);
  };

  const breadcrumb = [brand, model, engine, selectedGroup?.label].filter(Boolean);
  const filteredGroups = useMemo(() => {
    const query = categoryQuery.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((g) => {
        const childMatches = (g.children || []).filter((c) => c.label.toLowerCase().includes(query));
        if (g.label.toLowerCase().includes(query)) return g;
        if (childMatches.length === 0) return null;
        const count = childMatches.reduce((s, c) => s + c.count, 0);
        return { ...g, count, parts: childMatches.flatMap((c) => c.parts), children: childMatches };
      })
      .filter(Boolean) as CategoryGroup[];
  }, [groups, categoryQuery]);

  const partsItems = selectedGroup
    ? (isBrakeCategory(selectedGroup.label) && brakeSubtype !== "all"
        ? selectedGroup.parts.filter((p) => partMatchesBrakeSubtype(p, brakeSubtype))
        : selectedGroup.parts)
    : [];

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
              {(brand || model || engine || selectedGroup) && (
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
            const matchedBrand = brands.find((x) => x.toLowerCase() === b.toLowerCase()) || b;
            setBrand(matchedBrand);
            setModel(m);
            if (e) setEngine(e);
            setSelectedGroup(null);
          }}
        />
        <div className="mb-6">
          <h2 className="text-base md:text-lg font-semibold tracking-tight">{stepTitle[step]}</h2>
        </div>

        {loading && step !== "parts" && step !== "category" && (
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

        {step === "category" && isAdmin && debugInfo && (
          <div className="mb-3 px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-[11px] font-mono text-amber-200/90 flex flex-wrap gap-x-3 gap-y-1">
            <span>🔧 flow: <strong>{debugInfo.flow}</strong></span>
            {debugInfo.k_type > 0 && <span>K-type: <strong>{debugInfo.k_type}</strong> ({debugInfo.k_type_source})</span>}
            <span>sekce: <strong>{debugInfo.sectionsHit}/{debugInfo.sectionsScanned}</strong></span>
            <span>raw hity: <strong>{debugInfo.totalRawHits}</strong></span>
            {debugInfo.durationMs !== undefined && <span>{(debugInfo.durationMs / 1000).toFixed(1)}s</span>}
            {debugInfo.timedOutSections?.length > 0 && <span className="text-destructive">timeout: {debugInfo.timedOutSections.length}</span>}
            {debugInfo.retriedSections?.length > 0 && <span className="text-yellow-400">retry: {debugInfo.retriedSections.length}</span>}
            {debugInfo.partial && <span className="text-destructive">⚠ částečné</span>}
          </div>
        )}

        {step === "category" && (
          loading
            ? <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Načítám díly z J+M (TecDoc) …</p>
              </div>
            : groups.length === 0
              ? <div className="text-center py-16 text-sm text-muted-foreground">
                  {warning || "Žádné kategorie."}
                </div>
              : <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={categoryQuery} onChange={(e) => setCategoryQuery(e.target.value)}
                      placeholder="Hledat kategorii…" className="pl-9 bg-card border-border/40" />
                  </div>
                  <div className="rounded-xl border border-border/40 bg-card divide-y divide-border/30 overflow-hidden">
                    {filteredGroups.length === 0 && (
                      <div className="p-6 text-center text-xs text-amber-300/80">⚠️ Žádná kategorie nesouhlasí s filtrem.</div>
                    )}
                    {filteredGroups.map((g) => {
                      const Icon = CATEGORY_ICON[g.label] || Package;
                      const children = g.children || [];
                      const isExpanded = expandedGroups.has(g.id) || categoryQuery.trim().length > 0;
                      return (
                        <div key={g.id}>
                          <button onClick={() => children.length ? setExpandedGroups((prev) => {
                              const next = new Set(prev);
                              next.has(g.id) ? next.delete(g.id) : next.add(g.id);
                              return next;
                            }) : setSelectedGroup(g)}
                            className="group w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left">
                            <div className="flex items-center gap-3 min-w-0">
                              <Icon className="w-4 h-4 text-primary/70 shrink-0" />
                              <span className="text-sm font-semibold truncate">{g.label}</span>
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">{g.count}</Badge>
                            </div>
                            {children.length ? (
                              isExpanded ? <ChevronDown className="w-4 h-4 text-primary shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary shrink-0" />
                            ) : <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />}
                          </button>
                          {isExpanded && children.length > 0 && (
                            <div className="bg-background/35 border-t border-border/20">
                              {children.map((child) => (
                                <button key={child.id} onClick={() => setSelectedGroup(child)}
                                  className="group w-full flex items-center justify-between gap-3 pl-10 pr-4 py-2.5 hover:bg-secondary/50 transition-colors text-left">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                                    <span className="text-xs md:text-sm font-medium truncate">{child.label}</span>
                                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">{child.count}</Badge>
                                  </div>
                                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
        )}

        {step === "parts" && selectedGroup && (
          <>
            <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground gap-3 flex-wrap">
              <span>{selectedGroup.parts.length} dílů — ORIGINÁL první, pak NÁHRADY</span>
            </div>

            {isBrakeCategory(selectedGroup.label) && selectedGroup.parts.length > 0 && (() => {
              const counts = BRAKE_SUBTYPES.map((s) => ({
                ...s,
                count: selectedGroup.parts.filter((p) => partMatchesBrakeSubtype(p, s.id)).length,
              })).filter((s) => s.count > 0);
              if (counts.length === 0) return null;
              return (
                <div className="mb-4 p-3 rounded-xl border border-border/40 bg-card/40">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Typ dílu</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setBrakeSubtype("all")}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${brakeSubtype === "all" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                      Vše <span className="opacity-60 ml-1">{selectedGroup.parts.length}</span>
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
              items={partsItems}
              loading={partsLoading && partsItems.length === 0}
              onOrder={handleOrder}
              emptyHint="V této kategorii nejsou žádné díly."
            />
          </>
        )}
      </div>
    </div>
  );
});

Catalog.displayName = "Catalog";
export default Catalog;
