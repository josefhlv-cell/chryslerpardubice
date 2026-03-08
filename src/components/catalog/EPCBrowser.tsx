/**
 * EPCBrowser Component
 * Shows EPC categories as expandable tree (main → subcategory), drills down to parts with live prices.
 * Includes interactive SVG diagrams with data-oem + data-name attributes.
 * Features: lazy loading, pagination, diagram caching, auto-scrape fallback.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, ChevronRight, ChevronDown, ArrowLeft, Package, ExternalLink,
  Info, RefreshCw, LayoutGrid, ChevronLeft, Sparkles, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getEPCCategories, getUniqueCategoryNames, getEPCParts, enrichEPCPrices, getEPCDiagram,
  scrape7zap, generateEPCCatalog, generatePartsBatch, searchParts, autoExpandCatalog,
  type EPCCategory, type EPCPart,
} from "@/api/partsAPI";
import { toast } from "sonner";
import DOMPurify from "dompurify";

interface EPCBrowserProps {
  brand: string;
  model: string;
  engine: string;
  year?: string;
  onSearchOem: (oem: string) => void;
}

const categoryIcons: Record<string, string> = {
  "Motor": "🔧", "Brzdy": "🛑", "Chlazení": "❄️", "Převodovka": "⚙️",
  "Karoserie": "🚗", "Elektro": "⚡", "Elektroinstalace": "⚡", "Podvozek": "🔩",
  "Řízení": "🎯", "Výfuk": "💨", "Klimatizace": "🌡️", "Interiér": "💺",
  "Filtry": "🔍", "Oleje a kapaliny": "🛢️", "Brzdový systém": "🛑",
  "Palivový systém": "⛽", "Výfukový systém": "💨", "Klimatizace/Topení": "🌡️",
  "Kola a pneumatiky": "🔘", "Náprava": "🔩", "Osvětlení": "💡",
  "Chladící systém": "❄️", "Odpružení": "🔩", "Údržba": "🛠️",
};

type PriceData = { price_without_vat: number; price_with_vat: number; availability: string; name?: string };

const PARTS_PER_PAGE = 20;

const formatPrice = (price: number) =>
  price > 0 ? `${price.toLocaleString("cs-CZ")} Kč` : "—";

// Diagram SVG cache (in-memory per session)
const diagramCache = new Map<string, string>();

/** Build category tree: { main: [subcategories] } */
function buildCategoryTree(categories: EPCCategory[]): Map<string, string[]> {
  const tree = new Map<string, string[]>();
  for (const cat of categories) {
    if (!tree.has(cat.category)) tree.set(cat.category, []);
    if (cat.subcategory && !tree.get(cat.category)!.includes(cat.subcategory)) {
      tree.get(cat.category)!.push(cat.subcategory);
    }
  }
  return tree;
}

const EPCBrowser = ({ brand, model, engine, year, onSearchOem }: EPCBrowserProps) => {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<EPCCategory[]>([]);
  const [categoryTree, setCategoryTree] = useState<Map<string, string[]>>(new Map());
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [parts, setParts] = useState<EPCPart[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [priceMap, setPriceMap] = useState<Map<string, PriceData>>(() => new Map());
  const [pricesLoading, setPricesLoading] = useState(false);
  const [diagramSvg, setDiagramSvg] = useState<string | null>(null);
  const [diagramLoading, setDiagramLoading] = useState(false);
  const [partsPage, setPartsPage] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [autoExpanding, setAutoExpanding] = useState(false);
  const [scrapingOem, setScrapingOem] = useState<string | null>(null);
  const diagramRef = useRef<HTMLDivElement>(null);

  // Paginated parts
  const paginatedParts = useMemo(() => {
    const start = partsPage * PARTS_PER_PAGE;
    return parts.slice(start, start + PARTS_PER_PAGE);
  }, [parts, partsPage]);
  const totalPartsPages = Math.ceil(parts.length / PARTS_PER_PAGE);

  // Load categories when vehicle params change — auto-expand if empty
  useEffect(() => {
    if (!brand) return;
    setLoading(true);
    setHasSearched(true);
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setExpandedCategory(null);
    setParts([]);
    setPriceMap(() => new Map());

    getEPCCategories(brand, model || undefined, engine || undefined, year ? parseInt(year) : undefined)
      .then(async (cats) => {
        if (cats.length === 0 && !autoExpanding) {
          // Auto-expand: generate catalog automatically
          setAutoExpanding(true);
          setLoading(true);
          try {
            const result = await autoExpandCatalog(
              brand, model, year ? parseInt(year) : undefined, engine || undefined,
              (msg) => toast.info(msg)
            );
            if (result.expanded) {
              toast.success(`Katalog vygenerován: ${result.stats?.categories || 0} kategorií, ${result.stats?.parts || 0} dílů`);
              // Reload categories after expansion
              const newCats = await getEPCCategories(brand, model || undefined, engine || undefined, year ? parseInt(year) : undefined);
              setCategories(newCats);
              setCategoryTree(buildCategoryTree(newCats));
            } else {
              setCategories([]);
              setCategoryTree(new Map());
            }
          } catch {
            setCategories([]);
            setCategoryTree(new Map());
          } finally {
            setAutoExpanding(false);
            setLoading(false);
          }
        } else {
          setCategories(cats);
          setCategoryTree(buildCategoryTree(cats));
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [brand, model, engine, year]);

  // Load parts when category/subcategory selected + auto-load diagram
  useEffect(() => {
    if (!selectedCategory) {
      setParts([]); setPriceMap(() => new Map()); setDiagramSvg(null); setPartsPage(0);
      return;
    }
    setPartsLoading(true);
    setPartsPage(0);

    const catIds = categories
      .filter((c) => c.category === selectedCategory && (!selectedSubcategory || c.subcategory === selectedSubcategory))
      .map((c) => c.id);

    getEPCParts(catIds)
      .then(async (loadedParts) => {
        setParts(loadedParts);
        const oems = loadedParts.map(p => p.oem_number).filter(Boolean) as string[];
        if (oems.length > 0) {
          setPricesLoading(true);
          enrichEPCPrices(oems)
            .then(setPriceMap)
            .finally(() => setPricesLoading(false));
        }
        // Auto-load diagram
        const cacheKey = `${brand}-${model}-${selectedCategory}-${selectedSubcategory || ''}`;
        if (diagramCache.has(cacheKey)) {
          setDiagramSvg(diagramCache.get(cacheKey)!);
          attachDiagramHandlers();
        } else if (loadedParts.length > 0) {
          // Auto-generate diagram in background
          setDiagramLoading(true);
          try {
            const vehicle = `${brand} ${model}`;
            const partsForDiagram = loadedParts.map(p => ({ oem_number: p.oem_number || undefined, part_name: p.part_name || undefined }));
            const svg = await getEPCDiagram(vehicle, selectedCategory, partsForDiagram, selectedSubcategory || undefined);
            if (svg) {
              const sanitized = DOMPurify.sanitize(svg, {
                USE_PROFILES: { svg: true, svgFilters: true },
                ADD_ATTR: ['data-oem', 'data-part-name', 'data-name'],
              });
              diagramCache.set(cacheKey, sanitized);
              setDiagramSvg(sanitized);
              attachDiagramHandlers();
            }
          } catch (e) {
            console.error('Auto diagram load error:', e);
          }
          setDiagramLoading(false);
        }
      })
      .finally(() => setPartsLoading(false));
  }, [selectedCategory, selectedSubcategory, categories]);

  const handleRefreshPrices = () => {
    const oems = parts.map(p => p.oem_number).filter(Boolean) as string[];
    if (oems.length === 0) return;
    setPricesLoading(true);
    enrichEPCPrices(oems)
      .then(setPriceMap)
      .finally(() => setPricesLoading(false));
  };

  const attachDiagramHandlers = useCallback(() => {
    setTimeout(() => {
      if (!diagramRef.current) return;
      const clickables = diagramRef.current.querySelectorAll('[data-oem]');
      clickables.forEach(el => {
        (el as HTMLElement).style.cursor = 'pointer';
        el.addEventListener('click', () => {
          const oem = el.getAttribute('data-oem');
          const name = el.getAttribute('data-name') || el.getAttribute('data-part-name');
          if (oem) {
            onSearchOem(oem);
            if (name) toast.info(`${name} (${oem})`);
          }
        });
      });
    }, 100);
  }, [onSearchOem]);

  const handleLoadDiagram = async () => {
    if (!selectedCategory || !brand) return;
    const cacheKey = `${brand}-${model}-${selectedCategory}-${selectedSubcategory || ''}`;

    if (diagramCache.has(cacheKey)) {
      setDiagramSvg(diagramCache.get(cacheKey)!);
      attachDiagramHandlers();
      return;
    }

    setDiagramLoading(true);
    try {
      const vehicle = `${brand} ${model}`;
      const partsForDiagram = parts.map(p => ({ oem_number: p.oem_number || undefined, part_name: p.part_name || undefined }));
      const svg = await getEPCDiagram(vehicle, selectedCategory, partsForDiagram, selectedSubcategory || undefined);
      if (svg) {
        const sanitized = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_ATTR: ['data-oem', 'data-part-name', 'data-name'],
        });
        diagramCache.set(cacheKey, sanitized);
        setDiagramSvg(sanitized);
        attachDiagramHandlers();
      }
    } catch (e) {
      console.error('Diagram load error:', e);
      toast.error("Nepodařilo se načíst nákres");
    }
    setDiagramLoading(false);
  };

  /** Scrape missing OEM with retry */
  const handleScrapeMissing = async (oem: string) => {
    setScrapingOem(oem);
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await scrape7zap(brand, model, year || undefined);
        const result = await searchParts(oem, 0);
        if (result.results.length > 0) {
          onSearchOem(oem);
          toast.success("Díl nalezen po aktualizaci katalogu");
          setScrapingOem(null);
          return;
        }
        if (attempt < maxRetries) {
          toast.info("Katalog se načítá. Zkouším znovu...");
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch {
        if (attempt === maxRetries) {
          toast.error("Katalog se načítá. Zkuste to prosím znovu.");
        }
      }
    }
    setScrapingOem(null);
  };

  const handleGenerateCatalog = async () => {
    setGenerating(true);
    try {
      toast.info("Generuji AI katalog – může trvat 30-60s...");
      const result = await generateEPCCatalog(brand, model, year ? parseInt(year) : undefined, engine || undefined);
      toast.success(`Katalog vygenerován: ${result.stats.categories} kategorií, ${result.stats.parts} dílů`);
      // Reload categories
      const cats = await getEPCCategories(brand, model || undefined, engine || undefined, year ? parseInt(year) : undefined);
      setCategories(cats);
      setCategoryTree(buildCategoryTree(cats));
    } catch (e: any) {
      toast.error(e.message || "Nepodařilo se vygenerovat katalog");
    }
    setGenerating(false);
  };

  const handleCategoryClick = (name: string) => {
    const subs = categoryTree.get(name) || [];
    if (subs.length === 0) {
      // No subcategories — go directly to parts
      setSelectedCategory(name);
      setSelectedSubcategory(null);
      setExpandedCategory(null);
    } else {
      // Toggle expand
      setExpandedCategory(expandedCategory === name ? null : name);
    }
  };

  const handleSubcategoryClick = (main: string, sub: string) => {
    setSelectedCategory(main);
    setSelectedSubcategory(sub);
  };

  const handleBack = () => {
    if (selectedSubcategory) {
      setSelectedSubcategory(null);
      setSelectedCategory(null);
      setDiagramSvg(null);
    } else if (selectedCategory) {
      setSelectedCategory(null);
      setDiagramSvg(null);
    }
  };

  if (!brand) return null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {autoExpanding ? "Generuji EPC katalog pro toto vozidlo..." : "Načítám EPC kategorie..."}
        </p>
        {autoExpanding && (
          <p className="text-xs text-muted-foreground/70">Tento proces může trvat 30-60s</p>
        )}
      </div>
    );
  }

  if (hasSearched && categoryTree.size === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Info className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Pro toto vozidlo zatím nejsou dostupná EPC data.</p>
        <p className="text-xs text-muted-foreground max-w-sm text-center">
          EPC katalog pro {brand} {model} {engine} se průběžně rozšiřuje.
        </p>
        <Button onClick={handleGenerateCatalog} disabled={generating} className="mt-2">
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generuji katalog…</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" /> Vygenerovat AI katalog</>
          )}
        </Button>
      </motion.div>
    );
  }

  const pricedCount = parts.filter(p => p.oem_number && priceMap.has(p.oem_number)).length;
  const breadcrumb = [selectedCategory, selectedSubcategory].filter(Boolean).join(" › ");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        {selectedCategory && (
          <Button variant="ghost" size="sm" onClick={handleBack} className="h-8 px-2">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <div>
          <p className="text-sm font-semibold">
            {breadcrumb || "EPC kategorie"}
          </p>
          <p className="text-xs text-muted-foreground">
            {brand} {model} {engine} {year ? `· ${year}` : ""}
          </p>
        </div>
        {selectedCategory && (
          <div className="ml-auto flex items-center gap-2">
            {diagramLoading && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Nákres…</span>
              </div>
            )}
            {pricesLoading && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Ceny…</span>
              </div>
            )}
            {!pricesLoading && pricedCount > 0 && (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                {pricedCount}/{parts.length} s cenou
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleRefreshPrices} disabled={pricesLoading}>
              <RefreshCw className={`w-3 h-3 ${pricesLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleLoadDiagram} disabled={diagramLoading}>
              {diagramLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <LayoutGrid className="w-3 h-3" />}
              <span className="text-[10px] ml-1">Nákres</span>
            </Button>
            <Badge variant="secondary" className="text-[10px]">
              {parts.length} dílů
            </Badge>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* Category tree */}
        {!selectedCategory && (
          <motion.div key="categories" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="space-y-1">
            {[...categoryTree.entries()].map(([name, subs]) => (
              <div key={name}>
                {/* Main category row */}
                <button
                  onClick={() => handleCategoryClick(name)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                >
                  <span className="text-xl">{categoryIcons[name] || "📦"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium group-hover:text-primary transition-colors">{name}</p>
                    {subs.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">{subs.length} podkategorií</p>
                    )}
                  </div>
                  {subs.length > 0 ? (
                    expandedCategory === name
                      ? <ChevronDown className="w-4 h-4 text-primary shrink-0 transition-transform" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                  )}
                </button>

                {/* Expandable subcategories */}
                <AnimatePresence>
                  {expandedCategory === name && subs.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="ml-8 mt-1 mb-2 space-y-0.5">
                        {/* "All" option */}
                        <button
                          onClick={() => { setSelectedCategory(name); setSelectedSubcategory(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left hover:bg-primary/5 transition-colors"
                        >
                          <Package className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs font-medium text-primary">Vše v „{name}"</span>
                        </button>
                        {subs.map((sub) => (
                          <button
                            key={sub}
                            onClick={() => handleSubcategoryClick(name, sub)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left hover:bg-muted/50 transition-colors group"
                          >
                            <ChevronRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs group-hover:text-primary transition-colors">{sub}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </motion.div>
        )}

        {/* Parts list */}
        {selectedCategory && (
          <motion.div key="parts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {/* Interactive diagram */}
            {diagramSvg && (
              <div className="mb-4 rounded-xl border border-border bg-card p-3 overflow-hidden">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Interaktivní nákres – klikněte na díl
                </p>
                <div
                  ref={diagramRef}
                  className="w-full overflow-x-auto [&_svg]:w-full [&_svg]:h-auto [&_[data-oem]]:cursor-pointer [&_[data-oem]:hover]:opacity-80"
                  dangerouslySetInnerHTML={{ __html: diagramSvg }}
                />
              </div>
            )}

            {partsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : parts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Package className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Pro kategorii „{breadcrumb}" zatím nejsou díly.</p>
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline" className="text-xs"
                    onClick={async () => {
                      try {
                        toast.info("Hledám díly v externím katalogu...");
                        await scrape7zap(brand, model, year || undefined);
                        toast.success("Díly nalezeny – načítám znovu");
                        const catIds = categories
                          .filter((c) => c.category === selectedCategory && (!selectedSubcategory || c.subcategory === selectedSubcategory))
                          .map((c) => c.id);
                        const reloaded = await getEPCParts(catIds);
                        setParts(reloaded);
                      } catch {
                        toast.error("Nepodařilo se načíst díly z externího katalogu");
                      }
                    }}
                  >
                    <Download className="w-3 h-3 mr-1" /> Načíst z externího katalogu
                  </Button>
                  <Button
                    size="sm" className="text-xs"
                    onClick={handleGenerateCatalog}
                    disabled={generating}
                  >
                    {generating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    AI generátor
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b">
                  <span>OEM číslo</span>
                  <span>Název dílu</span>
                  <span className="w-24 text-right">Cena s DPH</span>
                  <span className="w-16 text-center">Akce</span>
                </div>
                {paginatedParts.map((part) => {
                  const price = part.oem_number ? priceMap.get(part.oem_number) : undefined;
                  const isScraping = scrapingOem === part.oem_number;
                  return (
                    <div key={part.id}
                      className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors items-center border-b border-border/50">
                      <div>
                        {part.oem_number ? (
                          <button
                            onClick={() => onSearchOem(part.oem_number!)}
                            className="text-xs font-mono font-medium text-primary hover:underline"
                          >
                            {part.oem_number}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium">{price?.name || part.part_name || "—"}</p>
                        {part.note && <p className="text-[10px] text-muted-foreground mt-0.5">{part.note}</p>}
                        {part.manufacturer && (
                          <p className="text-[10px] text-muted-foreground">{part.manufacturer}</p>
                        )}
                      </div>
                      <div className="w-24 text-right">
                        {price ? (
                          <div>
                            <p className="text-xs font-semibold text-foreground">{formatPrice(price.price_with_vat)}</p>
                            <p className="text-[10px] text-muted-foreground">{formatPrice(price.price_without_vat)} bez DPH</p>
                          </div>
                        ) : pricesLoading && part.oem_number ? (
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ml-auto" />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className="w-16 flex justify-center">
                        {part.oem_number && !price && !pricesLoading ? (
                          <Button
                            variant="ghost" size="sm" className="h-7 px-2 text-[10px]"
                            disabled={isScraping}
                            onClick={() => handleScrapeMissing(part.oem_number!)}
                          >
                            {isScraping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                            {isScraping ? "" : "Najít"}
                          </Button>
                        ) : part.oem_number ? (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]"
                            onClick={() => onSearchOem(part.oem_number!)}>
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Detail
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {/* Pagination */}
                {totalPartsPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-3">
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={partsPage === 0}
                      onClick={() => setPartsPage(p => Math.max(0, p - 1))}>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {partsPage + 1} / {totalPartsPages}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" disabled={partsPage >= totalPartsPages - 1}
                      onClick={() => setPartsPage(p => Math.min(totalPartsPages - 1, p + 1))}>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EPCBrowser;
