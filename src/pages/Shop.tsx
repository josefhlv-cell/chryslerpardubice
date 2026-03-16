/**
 * Shop Page — Automotive Parts Catalog
 * 
 * Composed of modular components:
 * - SearchBar: multi-mode search input
 * - Filters: sidebar/sheet filters (brand, model, price, availability)
 * - PartCard: individual result card
 * - PartDetailModal: detail panel / sheet
 * - Favorites: localStorage-based favorites
 * - History: search history tracking
 * - PhotoDialog: lazy-loaded photo modal
 * - partsAPI: all data fetching, caching, CSV export
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Search, Send, Sparkles, Package, AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, SlidersHorizontal, Star, Download, CheckCircle, Heart, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ---- Modular components ----
import SearchBar from "@/components/catalog/SearchBar";
import type { SearchMode } from "@/components/catalog/SearchBar";
import Filters, { brands, catalogTree, partCategories, subCategoriesMap } from "@/components/catalog/Filters";
import PartCard from "@/components/catalog/PartCard";
import { PartDetailPanel, PartDetailSheet } from "@/components/catalog/PartDetailModal";
import { useFavorites } from "@/components/catalog/Favorites";
import HistoryList, { useSearchHistory } from "@/components/catalog/History";
import PhotoDialog from "@/components/catalog/PhotoDialog";

import EPCBrowser from "@/components/catalog/EPCBrowser";

// ---- API layer ----
import {
  searchParts, searchByCategory, searchEPC, decodeVIN, downloadCSV,
  decodeAndSetupVehicle, decodeVINEnriched,
  PAGE_SIZE, type PartResult, type SearchFilters,
} from "@/api/partsAPI";

type PartType = "new" | "used";
type SidebarTab = "filters" | "favorites" | "history";

const Shop = () => {
  const navigate = useNavigate();
  const { user, profile, isPendingBusiness, canPlaceOrder } = useAuth();

  // ---- State ----
  const [partType, setPartType] = useState<PartType>("new");
  const [searchMode, setSearchMode] = useState<SearchMode>("vehicle");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [motor, setMotor] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<PartResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [priceFetching, setPriceFetching] = useState(false);
  const [expandedPart, setExpandedPart] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<PartResult | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("filters");

  // VIN
  const [vinQuery, setVinQuery] = useState("");
  const [vinDecoded, setVinDecoded] = useState<{ brand: string; model: string; year: string; engine: string } | null>(null);
  const [vinLoading, setVinLoading] = useState(false);

  // Used parts
  const [usedNote, setUsedNote] = useState("");
  const [usedSubmitted, setUsedSubmitted] = useState(false);

  // Photo dialog
  const [photoDialog, setPhotoDialog] = useState({ open: false, oem: "", loading: false, urls: [] as string[] });

  const [submitting, setSubmitting] = useState(false);
  const [searchCollapsed, setSearchCollapsed] = useState(false);

  // Hooks
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const { history, addEntry, removeEntry, clearHistory } = useSearchHistory();

  // ---- Derived ----
  const isBusinessActive = profile?.account_type === "business" && profile?.status === "active";
  const discountPercent = isBusinessActive ? (profile?.discount_percent ?? 0) : 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ---- Debounce ----
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // ---- AbortController for cancelling stale requests ----
  const abortRef = useRef<AbortController | null>(null);
  const cancelPrevious = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  };

  // ---- Search logic ----
  const doSearch = useCallback(async (searchQuery: string, pageNum: number) => {
    // In vehicle mode, allow search with brand only (no query/category required)
    const hasVehicleParams = brand || model || motor;
    if (!searchQuery && !category && !subCategory && !hasVehicleParams) return;
    
    const signal = cancelPrevious();
    setSearching(true);
    setPriceFetching(true);

    // Record in history
    if (searchQuery) addEntry(searchQuery);

    // Merge vehicle params into filters
    const mergedFilters: SearchFilters = {
      ...filters,
      brand: brand || filters.brand,
      model: model || filters.model,
      motor: motor || undefined,
    };

    try {
      let result;

      if (searchMode === "epc" && category && brand) {
        result = await searchEPC(brand, category, model || undefined, subCategory || undefined, pageNum);
        if (result.results.length === 0 && (subCategory || category)) {
          toast.info(`Pro kategorii "${subCategory || category}" zatím nejsou díly.`);
        }
      } else if (searchMode === "vehicle") {
        const searchTerm = subCategory || category || searchQuery || "";
        result = await searchByCategory(searchTerm, pageNum, mergedFilters);
        if (result.results.length === 0) {
          const desc = [brand, model, category].filter(Boolean).join(" / ");
          toast.info(desc ? `Pro "${desc}" nebyly nalezeny žádné díly.` : "Vyberte značku a kategorii pro vyhledání.");
        }
      } else if (searchQuery) {
        result = await searchParts(searchQuery, pageNum, mergedFilters);
        if (result.results.length === 0) {
          toast.error(`Díl "${searchQuery}" nebyl nalezen`);
        }
      } else {
        result = { results: [], totalCount: 0 };
      }

      // Only update state if this request wasn't aborted
      if (!signal.aborted) {
        setResults(result.results);
        setTotalCount(result.totalCount);
      }
    } catch (err: any) {
      if (signal.aborted) return; // Silently ignore aborted requests
      toast.error("Chyba: " + err.message);
      setResults([]);
    } finally {
      if (!signal.aborted) {
        setSearching(false);
        setPriceFetching(false);
      }
    }
  }, [category, subCategory, searchMode, brand, model, motor, filters, addEntry]);

  // Auto-search on debounced query
  const hasSearched = useRef(false);
  useEffect(() => {
    if (partType === "new" && debouncedQuery && searchMode === "part_number") {
      hasSearched.current = true;
      doSearch(debouncedQuery, page);
    }
  }, [debouncedQuery, page, partType, doSearch, searchMode]);

  const handleSearch = () => { setPage(0); doSearch(query, 0).then(() => { if (results && results.length > 0) setSearchCollapsed(true); }); };

  // ---- VIN decode ----
  const handleVinDecode = async () => {
    if (!vinQuery || vinQuery.length < 11) { toast.error("Zadejte platný VIN"); return; }
    setVinLoading(true);
    try {
      // Use enhanced AI decode that also saves to user_vehicles
      const result = await decodeAndSetupVehicle(vinQuery, user?.id);
      const decoded = {
        brand: result.basic.brand,
        model: result.basic.model,
        year: result.basic.year,
        engine: [result.basic.engine_displacement, result.basic.engine_cylinders ? `${result.basic.engine_cylinders}V` : ''].filter(Boolean).join(' '),
      };
      setVinDecoded(decoded);
      setBrand(decoded.brand);
      setModel(decoded.model);
      setYear(decoded.year);
      setMotor(decoded.engine);
      toast.success("VIN dekódován s AI obohacením");
    } catch {
      // Fallback to basic NHTSA decode
      try {
        const decoded = await decodeVIN(vinQuery);
        setVinDecoded(decoded);
        setBrand(decoded.brand);
        setModel(decoded.model);
        setYear(decoded.year);
        setMotor(decoded.engine);
        toast.success("VIN dekódován (základní)");
      } catch { toast.error("Nepodařilo se dekódovat VIN"); }
    }
    setVinLoading(false);
  };

  // ---- Photo (lazy) ----
  const handlePhotoClick = (oem: string) => {
    setPhotoDialog({ open: true, oem, loading: true, urls: [] });
    setTimeout(() => setPhotoDialog((prev) => ({ ...prev, loading: false, urls: [] })), 1000);
  };

  // ---- Order actions ----
  const handleOrderNew = async (part: PartResult) => {
    if (submitting) return;
    if (!user) { toast.error("Pro objednávku se musíte přihlásit"); navigate("/auth"); return; }
    if (!canPlaceOrder) { toast.error("Váš účet zatím nebyl schválen."); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("orders").insert({
        user_id: user.id, part_id: part.id.startsWith("catalog-") ? null : part.id,
        order_type: "new" as const, quantity: 1,
        unit_price: part.price_without_vat, part_name: part.name, oem_number: part.oem_number,
        catalog_source: part.catalog_source || null,
      });
      if (error) throw error;
      supabase.functions.invoke("notify-admin", { body: { type: "order", record: { part_name: part.name, oem_number: part.oem_number, order_type: "new", quantity: 1, unit_price: part.price_without_vat, catalog_source: part.catalog_source || null } } }).catch(() => {});
      toast.success(`Objednávka "${part.name}" vytvořena!`);
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleOrderUsed = async (part: PartResult) => {
    if (!user) { navigate("/auth"); return; }
    if (!canPlaceOrder) { toast.error("Účet není schválen."); return; }
    try {
      await supabase.from("orders").insert({
        user_id: user.id, order_type: "used" as const, quantity: 1,
        part_name: part.name, oem_number: part.oem_number,
        catalog_source: part.catalog_source || null,
      });
      supabase.functions.invoke("notify-admin", { body: { type: "order", record: { part_name: part.name, oem_number: part.oem_number, order_type: "used", quantity: 1, catalog_source: part.catalog_source || null } } }).catch(() => {});
      toast.success("Poptávka odeslána!");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleUsedSubmit = async () => {
    if (!query) { toast.error("Vyplňte název dílu"); return; }
    if (!user) { toast.error("Pro poptávku se musíte přihlásit"); navigate("/auth"); return; }
    if (!canPlaceOrder) { toast.error("Váš účet zatím nebyl schválen."); return; }
    try {
      const { error } = await supabase.from("orders").insert({
        user_id: user.id, order_type: "used" as const, quantity: 1, part_name: query,
        customer_note: [brand && `Značka: ${brand}`, model && `Model: ${model}`, year && `Rok: ${year}`, motor && `Motor: ${motor}`, usedNote].filter(Boolean).join("\n"),
      });
      if (error) throw error;
      setUsedSubmitted(true);
      toast.success("Poptávka odeslána!");
    } catch (err: any) { toast.error(err.message); }
  };

  const resetUsed = () => { setUsedSubmitted(false); setBrand(""); setModel(""); setYear(""); setMotor(""); setQuery(""); setUsedNote(""); };

  const handleResetFilters = () => {
    setBrand(""); setModel(""); setMotor(""); setCategory(""); setSubCategory("");
    setFilters({}); setVinQuery(""); setVinDecoded(null);
  };

  const handleSearchOem = (oem: string) => {
    const signal = cancelPrevious();
    setSearchMode("part_number");
    setQuery(oem);
    setPage(0);
    setSearching(true);
    setPriceFetching(true);
    addEntry(oem);
    searchParts(oem, 0, filters)
      .then((result) => {
        if (signal.aborted) return;
        setResults(result.results);
        setTotalCount(result.totalCount);
        if (result.results.length === 0) toast.error(`Díl "${oem}" nebyl nalezen`);
      })
      .catch((err: any) => { 
        if (signal.aborted) return;
        toast.error("Chyba: " + err.message); setResults([]); 
      })
      .finally(() => { 
        if (!signal.aborted) {
          setSearching(false); setPriceFetching(false); 
        }
      });
  };

  // ===== RENDER =====
  return (
    <div className="min-h-screen pb-20 relative">
      {/* Watermark logo */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-0 pointer-events-none select-none">
        <img src="/images/logo-chrysler-dodge-full.png" alt="" className="w-[85vw] max-w-[500px] opacity-[0.17]" draggable={false} />
      </div>
      {/* ---- HEADER ---- */}
      <div className="border-b border-border/30 bg-background/90 backdrop-blur-2xl sticky top-12 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h1 className="font-display text-xl md:text-2xl font-bold tracking-tight">Katalog náhradních dílů</h1>
              <p className="text-[11px] text-muted-foreground hidden md:block">Originální díly Chrysler · Jeep · Dodge · RAM · Fiat</p>
            </div>

            {/* Part type toggle */}
            <div className="flex rounded-lg bg-secondary/60 border border-border/20 p-0.5 gap-0.5">
              <button onClick={() => { setPartType("new"); setResults(null); setUsedSubmitted(false); setPage(0); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${partType === "new" ? "gradient-bronze text-white" : "text-muted-foreground hover:text-foreground"}`}>
                <Sparkles className="w-3.5 h-3.5" />Nové
              </button>
              <button onClick={() => { setPartType("used"); setResults(null); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${partType === "used" ? "gradient-bronze text-white" : "text-muted-foreground hover:text-foreground"}`}>
                <Package className="w-3.5 h-3.5" />Použité
              </button>
            </div>

            {/* CSV export */}
            {results && results.length > 0 && (
              <Button size="sm" variant="outline" className="hidden md:flex text-xs h-8 border-border/30" onClick={() => downloadCSV(results)}>
                <Download className="w-3.5 h-3.5 mr-1" />CSV
              </Button>
            )}

            {priceFetching && (
              <span className="text-[10px] text-primary flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
              </span>
            )}
          </div>

          {/* Search bar — new parts only */}
          {partType === "new" && (
            <div className="mt-3">
              {/* Collapsed summary bar */}
              {searchCollapsed && (results && results.length > 0) && (
                <button
                  onClick={() => setSearchCollapsed(false)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-secondary/80 hover:bg-secondary transition-colors"
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                    <Search className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {query || [brand, model, category].filter(Boolean).join(" · ") || "Vyhledávání"}
                    </span>
                    <span className="text-primary font-medium">{totalCount} výsledků</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              )}

              {/* Full search UI */}
              <AnimatePresence initial={false}>
                {!searchCollapsed && (
                  <motion.div
                    key="search-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3">
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <SearchBar
                    query={query}
                    onQueryChange={(v) => { setQuery(v); setPage(0); setSearchCollapsed(false); }}
                    onSearch={handleSearch}
                    searching={searching}
                    searchMode={searchMode}
                    onModeChange={(mode) => { 
                      cancelPrevious();
                      setSearchMode(mode); 
                      setResults(null); 
                      setPage(0); 
                      setCategory(""); 
                      setSubCategory(""); 
                      setSearching(false);
                      setPriceFetching(false);
                      setSearchCollapsed(false);
                      if (mode === "epc" || mode === "vehicle") {
                        setQuery("");
                      }
                    }}
                  />
                </div>
                {/* Mobile filter toggle */}
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="h-11 md:hidden px-3 mt-[2.75rem]">
                      <SlidersHorizontal className="w-4 h-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80 overflow-y-auto">
                    <SheetHeader><SheetTitle>Filtry a historie</SheetTitle></SheetHeader>
                    <div className="mt-4 space-y-4">
                      <Filters
                        searchMode={searchMode} brand={brand} setBrand={setBrand}
                        model={model} setModel={setModel} motor={motor} setMotor={setMotor}
                        category={category} setCategory={setCategory}
                        subCategory={subCategory} setSubCategory={setSubCategory}
                        filters={filters} setFilters={setFilters}
                        onSearch={handleSearch} searching={searching}
                        onReset={handleResetFilters}
                        vinQuery={vinQuery} setVinQuery={setVinQuery}
                        onVinDecode={handleVinDecode} vinLoading={vinLoading} vinDecoded={vinDecoded}
                        onQuickSearch={handleSearchOem}
                      />
                      <Separator />
                      <HistoryList history={history} onSelect={handleSearchOem} onRemove={removeEntry} onClear={clearHistory} />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              {/* Inline vehicle selectors — always visible in vehicle/epc/vin mode */}
              {(searchMode === "vehicle" || searchMode === "epc") && (
                <div className="md:hidden space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={brand} onValueChange={(v) => { setBrand(v); setModel(""); setMotor(""); setCategory(""); setSubCategory(""); }}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Značka" /></SelectTrigger>
                      <SelectContent>{brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                    {(brand && catalogTree[brand]) ? (
                      <Select value={model} onValueChange={(v) => { setModel(v); setMotor(""); }}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Model" /></SelectTrigger>
                        <SelectContent>{Object.keys(catalogTree[brand]).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Select disabled><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Model" /></SelectTrigger><SelectContent /></Select>
                    )}
                    {(brand && model && catalogTree[brand]?.[model]) ? (
                      <Select value={motor} onValueChange={setMotor}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Motor" /></SelectTrigger>
                        <SelectContent>{catalogTree[brand][model].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Select disabled><SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Motor" /></SelectTrigger><SelectContent /></Select>
                    )}
                  </div>
                  {/* Inline category */}
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={category} onValueChange={(v) => { setCategory(v); setSubCategory(""); }}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Kategorie" /></SelectTrigger>
                      <SelectContent>{partCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                    {(category || brand) && (
                      <Button size="sm" className="h-9" onClick={handleSearch} disabled={searching}>
                        {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Search className="w-3.5 h-3.5 mr-1" />}
                        Hledat
                      </Button>
                    )}
                  </div>
                  {subCategoriesMap[category] && (
                    <div className="flex flex-wrap gap-1">
                      {subCategoriesMap[category].map((sub) => (
                        <button key={sub} onClick={() => setSubCategory(subCategory === sub ? "" : sub)}
                          className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${subCategory === sub ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                          {sub}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Inline VIN input — always visible in vin mode on mobile */}
              {searchMode === "vin" && (
                <div className="md:hidden space-y-2">
                  <div className="flex gap-2">
                    <Input placeholder="Zadejte VIN kód..." className="h-9 text-xs font-mono flex-1" value={vinQuery}
                      onChange={(e) => setVinQuery(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && handleVinDecode()} />
                    <Button size="sm" className="h-9" onClick={handleVinDecode} disabled={vinLoading}>
                      {vinLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  {vinDecoded && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-0.5">
                      <p className="text-xs font-semibold text-primary">Rozpoznáno</p>
                      <p className="text-sm font-semibold">{vinDecoded.brand} {vinDecoded.model}</p>
                      <p className="text-xs text-muted-foreground">{vinDecoded.year} · {vinDecoded.engine}</p>
                    </div>
                  )}
                </div>
              )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Pending business warning */}
      {isPendingBusiness && (
        <div className="max-w-7xl mx-auto px-4 mt-3">
          <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2.5 flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-accent shrink-0" />
            Váš firemní účet čeká na schválení. Objednávky nejsou zatím povoleny.
          </div>
        </div>
      )}

      {/* ---- MAIN CONTENT ---- */}
      <div className="max-w-7xl mx-auto px-4 mt-4">
        <div className="flex gap-6">

          {/* LEFT SIDEBAR — desktop (filters + history + favorites) */}
          {partType === "new" && (
            <AnimatePresence initial={false} mode="wait">
              {searchCollapsed ? (
                <motion.div
                  key="sidebar-collapsed"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 48, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="hidden md:block shrink-0 overflow-hidden"
                >
                  <div className="sticky top-36 space-y-2">
                    <button
                      onClick={() => setSearchCollapsed(false)}
                      className="w-10 h-10 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors"
                      title="Zobrazit filtry"
                    >
                      <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                    </button>
                    {favorites.length > 0 && (
                      <button
                        onClick={() => { setSearchCollapsed(false); setSidebarTab("favorites"); }}
                        className="w-10 h-10 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors relative"
                        title="Oblíbené"
                      >
                        <Heart className="w-4 h-4 text-muted-foreground" />
                        <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{favorites.length}</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="sidebar-expanded"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 240, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="hidden md:block shrink-0 overflow-hidden"
                >
              <div className="w-60 sticky top-36 space-y-2 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
                {/* Sidebar tabs */}
                <div className="flex rounded-lg bg-secondary p-0.5 gap-0.5 mb-3">
                  {([["filters", "Filtry", SlidersHorizontal], ["favorites", "Oblíbené", Heart], ["history", "Historie", RefreshCw]] as const).map(([tab, label, Icon]) => (
                    <button key={tab} onClick={() => setSidebarTab(tab)}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-medium transition-all ${
                        sidebarTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}>
                      <Icon className="w-3 h-3" />
                      {label}
                      {tab === "favorites" && favorites.length > 0 && (
                        <span className="bg-primary text-primary-foreground text-[9px] rounded-full w-4 h-4 flex items-center justify-center">{favorites.length}</span>
                      )}
                    </button>
                  ))}
                </div>

                {sidebarTab === "filters" && (
                  <Filters
                    searchMode={searchMode} brand={brand} setBrand={setBrand}
                    model={model} setModel={setModel} motor={motor} setMotor={setMotor}
                    category={category} setCategory={setCategory}
                    subCategory={subCategory} setSubCategory={setSubCategory}
                    filters={filters} setFilters={setFilters}
                    onSearch={handleSearch} searching={searching}
                    onReset={handleResetFilters}
                    vinQuery={vinQuery} setVinQuery={setVinQuery}
                    onVinDecode={handleVinDecode} vinLoading={vinLoading} vinDecoded={vinDecoded}
                    onQuickSearch={handleSearchOem}
                  />
                )}

                {sidebarTab === "favorites" && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Oblíbené díly ({favorites.length})
                    </p>
                    {favorites.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">Zatím žádné oblíbené</p>
                    ) : (
                      <div className="space-y-1">
                        {favorites.map((fav) => (
                          <button key={fav.id} onClick={() => { setSelectedPart(fav); }}
                            className="w-full text-left p-2 rounded-lg bg-muted/50 hover:bg-muted transition-all">
                            <p className="text-xs font-medium truncate">{fav.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{fav.oem_number}</p>
                            {fav.price_with_vat > 0 && (
                              <p className="text-[10px] font-semibold mt-0.5">{fav.price_with_vat.toLocaleString("cs")} Kč</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {sidebarTab === "history" && (
                  <HistoryList history={history} onSelect={handleSearchOem} onRemove={removeEntry} onClear={clearHistory} />
                )}
              </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* CENTER — Results */}
          <div className="flex-1 min-w-0">
            {/* Used part form */}
            {partType === "used" && (
              <AnimatePresence mode="wait">
                {usedSubmitted ? (
                  <motion.div key="submitted" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md mx-auto rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-4 text-center mt-8">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                      <CheckCircle className="w-7 h-7 text-green-400" />
                    </div>
                    <h3 className="font-display font-semibold text-lg">Poptávka odeslána</h3>
                    <p className="text-sm text-muted-foreground">Ověříme dostupnost a ozveme se.</p>
                    <Button variant="outline" onClick={resetUsed}>Nová poptávka</Button>
                  </motion.div>
                ) : (
                  <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="max-w-md mx-auto space-y-3 mt-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Jaký díl hledáte?" className="pl-10 h-11"
                        value={query} onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleUsedSubmit()} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={brand} onValueChange={(v) => { setBrand(v); setModel(""); setMotor(""); }}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Značka" /></SelectTrigger>
                        <SelectContent>{brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                      {brand && catalogTree[brand] ? (
                        <Select value={model} onValueChange={(v) => { setModel(v); setMotor(""); }}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Model" /></SelectTrigger>
                          <SelectContent>{Object.keys(catalogTree[brand]).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input placeholder="Model" className="h-9 text-xs" value={model} onChange={(e) => setModel(e.target.value)} />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Rok výroby" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 30 }, (_, i) => String(new Date().getFullYear() - i)).map((y) => (
                            <SelectItem key={y} value={y}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {brand && model && catalogTree[brand]?.[model] ? (
                        <Select value={motor} onValueChange={setMotor}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Motor" /></SelectTrigger>
                          <SelectContent>{catalogTree[brand][model].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input placeholder="Motor" className="h-9 text-xs" value={motor} onChange={(e) => setMotor(e.target.value)} />
                      )}
                    </div>
                    <Textarea placeholder="Poznámka..." className="text-xs" rows={2} value={usedNote} onChange={(e) => setUsedNote(e.target.value)} />
                    <Button className="w-full h-10" onClick={handleUsedSubmit} disabled={isPendingBusiness}>
                      <Send className="w-4 h-4 mr-1" />Odeslat poptávku
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/* EPC Browser — vehicle-based catalog (EPC mode or Vehicle mode fallback) */}
            {partType === "new" && brand && !searching && (
              (searchMode === "epc" || (searchMode === "vehicle" && (!results || results.length === 0) && !query && !category && !subCategory))
            ) && (
              <EPCBrowser
                brand={brand}
                model={model}
                engine={motor}
                year={year}
                onSearchOem={handleSearchOem}
              />
            )}

            {/* Loading */}
            {partType === "new" && searching && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Vyhledávám v katalozích...</p>
              </div>
            )}

            {/* No results */}
            {partType === "new" && !searching && results && results.length === 0 && searchMode !== "epc" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                  <Search className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Žádné výsledky</p>
                <p className="text-xs text-muted-foreground">Zkuste jiný dotaz nebo změňte filtry</p>
              </motion.div>
            )}

            {/* Results list - don't show when EPC Browser is visible */}
            {partType === "new" && !searching && results && results.length > 0 && 
              !(searchMode === "epc" && brand) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{totalCount}</span> výsledků
                  </p>
                  <div className="flex items-center gap-2">
                    {/* Mobile CSV export */}
                    <Button size="sm" variant="outline" className="md:hidden text-[10px] h-7 px-2" onClick={() => downloadCSV(results)}>
                      <Download className="w-3 h-3 mr-0.5" />CSV
                    </Button>
                    {totalPages > 1 && <span className="text-xs text-muted-foreground">Strana {page + 1}/{totalPages}</span>}
                  </div>
                </div>

                <div className="space-y-2">
                  {results.map((part, i) => (
                    <PartCard
                      key={part.id}
                      part={part}
                      index={i}
                      isExpanded={expandedPart === part.id}
                      isSelected={selectedPart?.id === part.id}
                      isFavorite={isFavorite(part.id)}
                      discountPercent={discountPercent}
                      onToggleExpand={() => setExpandedPart(expandedPart === part.id ? null : part.id)}
                      onSelect={() => setSelectedPart(selectedPart?.id === part.id ? null : part)}
                      onPhotoClick={() => handlePhotoClick(part.oem_number)}
                      onOrderNew={() => handleOrderNew(part)}
                      onOrderUsed={() => handleOrderUsed(part)}
                      onSearchOem={handleSearchOem}
                      onToggleFavorite={() => toggleFavorite(part)}
                      disabled={isPendingBusiness || submitting}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) pageNum = i;
                      else if (page < 3) pageNum = i;
                      else if (page > totalPages - 4) pageNum = totalPages - 5 + i;
                      else pageNum = page - 2 + i;
                      return (
                        <Button key={pageNum} size="sm" variant={pageNum === page ? "default" : "outline"}
                          className="w-9 h-9 p-0" onClick={() => setPage(pageNum)}>{pageNum + 1}</Button>
                      );
                    })}
                    <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}


            <div className="text-center pt-6 pb-4">
              <a href="/terms" className="text-[10px] text-muted-foreground underline hover:text-foreground transition-colors">Obchodní podmínky</a>
            </div>
          </div>

          {/* RIGHT SIDEBAR — detail panel (desktop only) */}
          <PartDetailPanel
            part={selectedPart}
            onClose={() => setSelectedPart(null)}
            onPhotoClick={handlePhotoClick}
            onOrderNew={handleOrderNew}
            onOrderUsed={handleOrderUsed}
            onSearchOem={handleSearchOem}
            discountPercent={discountPercent}
            disabled={isPendingBusiness || submitting}
          />
        </div>
      </div>

      {/* Mobile detail sheet */}
      <PartDetailSheet
        part={selectedPart}
        onClose={() => setSelectedPart(null)}
        onPhotoClick={handlePhotoClick}
        onOrderNew={handleOrderNew}
        onOrderUsed={handleOrderUsed}
        onSearchOem={handleSearchOem}
        discountPercent={discountPercent}
        disabled={isPendingBusiness || submitting}
      />

      {/* Photo dialog (lazy loading) */}
      <PhotoDialog
        open={photoDialog.open}
        oem={photoDialog.oem}
        loading={photoDialog.loading}
        urls={photoDialog.urls}
        onOpenChange={(open) => setPhotoDialog((prev) => ({ ...prev, open }))}
      />
    </div>
  );
};

export default Shop;
