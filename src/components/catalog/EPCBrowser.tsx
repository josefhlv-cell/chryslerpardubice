/**
 * EPCBrowser Component
 * Shows EPC categories for selected vehicle and drills down to parts.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronRight, ArrowLeft, Package, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getEPCCategories, getUniqueCategoryNames, getEPCParts,
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
  "Motor": "🔧",
  "Brzdy": "🛑",
  "Chlazení": "❄️",
  "Převodovka": "⚙️",
  "Karoserie": "🚗",
  "Elektro": "⚡",
  "Elektroinstalace": "⚡",
  "Podvozek": "🔩",
  "Řízení": "🎯",
  "Výfuk": "💨",
  "Klimatizace": "🌡️",
  "Interiér": "💺",
  "Filtry": "🔍",
  "Oleje a kapaliny": "🛢️",
};

const EPCBrowser = ({ brand, model, engine, year, onSearchOem }: EPCBrowserProps) => {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<EPCCategory[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [parts, setParts] = useState<EPCPart[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Load categories when vehicle params change
  useEffect(() => {
    if (!brand) return;
    setLoading(true);
    setHasSearched(true);
    setSelectedCategory(null);
    setParts([]);

    getEPCCategories(brand, model || undefined, engine || undefined, year ? parseInt(year) : undefined)
      .then((cats) => {
        setCategories(cats);
        setCategoryNames(getUniqueCategoryNames(cats));
      })
      .finally(() => setLoading(false));
  }, [brand, model, engine, year]);

  // Load parts when category selected
  useEffect(() => {
    if (!selectedCategory) { setParts([]); return; }
    setPartsLoading(true);
    const catIds = categories.filter((c) => c.category === selectedCategory).map((c) => c.id);
    getEPCParts(catIds)
      .then(setParts)
      .finally(() => setPartsLoading(false));
  }, [selectedCategory, categories]);

  if (!brand) return null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Načítám EPC kategorie...</p>
      </div>
    );
  }

  // No data state
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
          <Badge variant="secondary" className="text-[10px] ml-auto">
            {parts.length} dílů
          </Badge>
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
                <div className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b">
                  <span>OEM číslo</span>
                  <span>Název dílu</span>
                  <span>Výrobce</span>
                  <span className="w-16 text-center">Akce</span>
                </div>
                {parts.map((part) => (
                  <div key={part.id}
                    className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors items-center border-b border-border/50">
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
                      <p className="text-xs font-medium">{part.part_name || "—"}</p>
                      {part.note && <p className="text-[10px] text-muted-foreground mt-0.5">{part.note}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground">{part.manufacturer || "—"}</span>
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
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EPCBrowser;
