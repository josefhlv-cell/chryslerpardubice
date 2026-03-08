/**
 * EPCBrowser Component
 * Shows EPC categories for selected vehicle and drills down to parts with live prices.
 * Includes interactive SVG diagrams generated via AI.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronRight, ArrowLeft, Package, ExternalLink, Info, RefreshCw, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getEPCCategories, getUniqueCategoryNames, getEPCParts, enrichEPCPrices, getEPCDiagram,
  type EPCCategory, type EPCPart,
} from "@/api/partsAPI";

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
};

type PriceData = { price_without_vat: number; price_with_vat: number; availability: string; name?: string };

const formatPrice = (price: number) =>
  price > 0 ? `${price.toLocaleString("cs-CZ")} Kč` : "—";

const EPCBrowser = ({ brand, model, engine, year, onSearchOem }: EPCBrowserProps) => {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<EPCCategory[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [parts, setParts] = useState<EPCPart[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [priceMap, setPriceMap] = useState<Map<string, PriceData>>(new Map());
  const [pricesLoading, setPricesLoading] = useState(false);
  const [diagramSvg, setDiagramSvg] = useState<string | null>(null);
  const [diagramLoading, setDiagramLoading] = useState(false);
  const diagramRef = useRef<HTMLDivElement>(null);

  // Load categories when vehicle params change
  useEffect(() => {
    if (!brand) return;
    setLoading(true);
    setHasSearched(true);
    setSelectedCategory(null);
    setParts([]);
    setPriceMap(new Map());

    getEPCCategories(brand, model || undefined, engine || undefined, year ? parseInt(year) : undefined)
      .then((cats) => {
        setCategories(cats);
        setCategoryNames(getUniqueCategoryNames(cats));
      })
      .finally(() => setLoading(false));
  }, [brand, model, engine, year]);

  // Load parts when category selected
  useEffect(() => {
    if (!selectedCategory) { setParts([]); setPriceMap(new Map()); return; }
    setPartsLoading(true);
    const catIds = categories.filter((c) => c.category === selectedCategory).map((c) => c.id);
    getEPCParts(catIds)
      .then((loadedParts) => {
        setParts(loadedParts);
        // Auto-trigger price enrichment
        const oems = loadedParts.map(p => p.oem_number).filter(Boolean) as string[];
        if (oems.length > 0) {
          setPricesLoading(true);
          enrichEPCPrices(oems)
            .then(setPriceMap)
            .finally(() => setPricesLoading(false));
        }
      })
      .finally(() => setPartsLoading(false));
  }, [selectedCategory, categories]);

  const handleRefreshPrices = () => {
    const oems = parts.map(p => p.oem_number).filter(Boolean) as string[];
    if (oems.length === 0) return;
    setPricesLoading(true);
    enrichEPCPrices(oems)
      .then(setPriceMap)
      .finally(() => setPricesLoading(false));
  };

  const handleLoadDiagram = async () => {
    if (!selectedCategory || !brand) return;
    setDiagramLoading(true);
    try {
      const vehicle = `${brand} ${model}`;
      const partsForDiagram = parts.map(p => ({ oem_number: p.oem_number || undefined, part_name: p.part_name || undefined }));
      const svg = await getEPCDiagram(vehicle, selectedCategory, partsForDiagram);
      setDiagramSvg(svg);
      // Attach click handlers to diagram parts
      setTimeout(() => {
        if (diagramRef.current) {
          const clickables = diagramRef.current.querySelectorAll('[data-oem]');
          clickables.forEach(el => {
            el.addEventListener('click', () => {
              const oem = el.getAttribute('data-oem');
              if (oem) onSearchOem(oem);
            });
          });
        }
      }, 100);
    } catch (e) {
      console.error('Diagram load error:', e);
    }
    setDiagramLoading(false);
  };

  if (!brand) return null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Načítám EPC kategorie...</p>
      </div>
    );
  }

  if (hasSearched && categoryNames.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Info className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Pro toto vozidlo zatím nejsou dostupná EPC data.</p>
        <p className="text-xs text-muted-foreground max-w-sm text-center">
          EPC katalog pro {brand} {model} {engine} se průběžně rozšiřuje. 
          Zkuste vyhledání pomocí OEM čísla nebo názvu dílu.
        </p>
      </motion.div>
    );
  }

  const pricedCount = parts.filter(p => p.oem_number && priceMap.has(p.oem_number)).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        {selectedCategory && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)} className="h-8 px-2">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <div>
          <p className="text-sm font-semibold">
            {selectedCategory ? selectedCategory : "EPC kategorie"}
          </p>
          <p className="text-xs text-muted-foreground">
            {brand} {model} {engine} {year ? `· ${year}` : ""}
          </p>
        </div>
        {selectedCategory && (
          <div className="ml-auto flex items-center gap-2">
            {pricesLoading && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Načítám ceny…</span>
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
            <Badge variant="secondary" className="text-[10px]">
              {parts.length} dílů
            </Badge>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* Category grid */}
        {!selectedCategory && (
          <motion.div key="categories" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {categoryNames.map((name) => {
              const count = categories.filter((c) => c.category === name).length;
              return (
                <button key={name} onClick={() => setSelectedCategory(name)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group">
                  <span className="text-2xl">{categoryIcons[name] || "📦"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">{name}</p>
                    <p className="text-[10px] text-muted-foreground">{count} podkat.</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                </button>
              );
            })}
          </motion.div>
        )}

        {/* Parts list */}
        {selectedCategory && (
          <motion.div key="parts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {partsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : parts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Package className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Pro kategorii „{selectedCategory}" zatím nejsou díly.</p>
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
                {parts.map((part) => {
                  const price = part.oem_number ? priceMap.get(part.oem_number) : undefined;
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
                        {part.oem_number && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]"
                            onClick={() => onSearchOem(part.oem_number!)}>
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Detail
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EPCBrowser;
