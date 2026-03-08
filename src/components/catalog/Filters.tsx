/**
 * Filters Component
 * Sidebar / sheet filters for brand, model, engine, category,
 * price range, availability, catalog source and manufacturer.
 */

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Search, Loader2, RotateCcw, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sourceLabel } from "@/api/partsAPI";
import type { SearchMode } from "./SearchBar";
import type { SearchFilters } from "@/api/partsAPI";

// ---- Static data ----

export const brands = ["Chrysler", "Jeep", "Dodge", "RAM", "Fiat", "Lancia"];

export const catalogTree: Record<string, Record<string, string[]>> = {
  Chrysler: { "300C": ["3.6L V6", "5.7L HEMI V8"], "300": ["2.7L V6", "3.5L V6", "5.7L HEMI", "6.1L SRT8"], Pacifica: ["3.6L V6", "3.6L Hybrid"], "Town & Country": ["3.6L V6", "3.8L V6"], Voyager: ["3.6L V6"], "200": ["2.4L", "3.6L V6"] },
  Jeep: { "Grand Cherokee": ["3.0L CRD", "3.6L V6", "5.7L HEMI V8", "6.4L SRT"], Wrangler: ["2.0T", "3.6L V6", "2.2L CRD"], Cherokee: ["2.0L", "2.4L", "3.2L V6"], Compass: ["1.4T", "2.4L"], Renegade: ["1.0T", "1.3T", "1.6L CRD"] },
  Dodge: { Charger: ["3.6L V6", "5.7L HEMI V8", "6.2L Hellcat"], Challenger: ["3.6L V6", "5.7L HEMI V8", "6.2L Hellcat", "6.4L Scat Pack"], Durango: ["3.6L V6", "5.7L HEMI V8", "6.4L SRT"], Journey: ["2.4L", "3.6L V6"], "Grand Caravan": ["3.6L V6"] },
  RAM: { "1500": ["3.0L EcoDiesel", "3.6L V6", "5.7L HEMI"], "2500": ["6.4L HEMI", "6.7L Cummins"], ProMaster: ["3.6L V6", "3.0L EcoDiesel"] },
  Fiat: { "500": ["1.2L", "1.4L"], Ducato: ["2.3L", "3.0L"], Punto: ["1.2L", "1.4L"] },
  Lancia: { Ypsilon: ["1.2L", "0.9L TwinAir"] },
};

export const partCategories = [
  "Motor", "Převodovka", "Brzdy", "Chlazení", "Řízení", "Podvozek", "Elektroinstalace",
  "Karoserie", "Interiér", "Klimatizace", "Výfuk", "Filtry", "Oleje a kapaliny",
];

export const subCategoriesMap: Record<string, string[]> = {
  Motor: ["Blok motoru", "Hlava válců", "Rozvodový mechanismus", "Klikový hřídel", "Písty a ojnice", "Těsnění", "Olejové čerpadlo", "Vodní čerpadlo", "Turbo"],
  Chlazení: ["Chladič", "Vodní čerpadlo", "Termostat", "Hadice chladicího systému", "Ventilátor", "Expanzní nádobka"],
  Převodovka: ["Automatická převodovka", "Manuální převodovka", "Spojka", "Diferenciál", "Hřídel"],
  Brzdy: ["Brzdové destičky", "Brzdové kotouče", "Brzdové třmeny", "Hadice", "ABS systém"],
  Řízení: ["Řízení s posilovačem", "Tyče řízení", "Kulové čepy", "Čerpadlo"],
  Podvozek: ["Tlumiče", "Pružiny", "Ramena", "Stabilizátor", "Ložiska kol", "Náboje"],
  Elektroinstalace: ["Alternátor", "Startér", "Svíčky", "Cívky", "Senzory", "Řídící jednotky"],
  Karoserie: ["Přední nárazník", "Zadní nárazník", "Světla", "Zrcátka", "Blatníky", "Kapota"],
  Interiér: ["Sedadla", "Palubní deska", "Volant", "Ovládání", "Pedály"],
  Klimatizace: ["Kompresor", "Kondenzátor", "Výparník", "Filtr kabiny", "Ventily"],
  Výfuk: ["Katalyzátor", "Výfukové svody", "Tlumiče výfuku", "Lambda sondy", "DPF filtr"],
  Filtry: ["Olejový filtr", "Vzduchový filtr", "Palivový filtr", "Pylový filtr"],
  "Oleje a kapaliny": ["Motorový olej", "Převodový olej", "Chladicí kapalina", "Brzdová kapalina"],
};

interface SourceStats {
  source: string;
  count: number;
}

interface FiltersProps {
  searchMode: SearchMode;
  brand: string;
  setBrand: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  motor: string;
  setMotor: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  subCategory: string;
  setSubCategory: (v: string) => void;
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
  onSearch: () => void;
  searching: boolean;
  onReset: () => void;
  /** VIN section */
  vinQuery: string;
  setVinQuery: (v: string) => void;
  onVinDecode: () => void;
  vinLoading: boolean;
  vinDecoded: { brand: string; model: string; year: string; engine: string } | null;
  /** Quick examples for part_number mode */
  onQuickSearch: (code: string) => void;
}

const Filters = ({
  searchMode, brand, setBrand, model, setModel, motor, setMotor,
  category, setCategory, subCategory, setSubCategory,
  filters, setFilters,
  onSearch, searching, onReset,
  vinQuery, setVinQuery, onVinDecode, vinLoading, vinDecoded,
  onQuickSearch,
}: FiltersProps) => {
  const models = brand && catalogTree[brand] ? Object.keys(catalogTree[brand]) : [];
  const engines = brand && model && catalogTree[brand]?.[model] ? catalogTree[brand][model] : [];
  const currentSubs = category ? (subCategoriesMap[category] || []) : [];

  const [sourceStats, setSourceStats] = useState<SourceStats[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      // Get counts per catalog_source from parts_new
      const { data } = await supabase
        .from("parts_new")
        .select("catalog_source");
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((r: any) => {
          const src = r.catalog_source || "unknown";
          counts[src] = (counts[src] || 0) + 1;
        });
        setSourceStats(
          Object.entries(counts)
            .map(([source, count]) => ({ source, count }))
            .sort((a, b) => b.count - a.count)
        );
      }
    };
    fetchStats();
  }, []);

  const totalParts = sourceStats.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-5">
      {/* Vehicle selectors (vehicle / epc mode) */}
      {(searchMode === "vehicle" || searchMode === "epc") && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vozidlo</p>
          <Select value={brand} onValueChange={(v) => { setBrand(v); setModel(""); setMotor(""); setCategory(""); setSubCategory(""); }}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Značka" /></SelectTrigger>
            <SelectContent>{brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
          {models.length > 0 && (
            <Select value={model} onValueChange={(v) => { setModel(v); setMotor(""); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Model" /></SelectTrigger>
              <SelectContent>{models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {engines.length > 0 && (
            <Select value={motor} onValueChange={setMotor}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Motor" /></SelectTrigger>
              <SelectContent>{engines.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Category filter (vehicle / epc) */}
      {(searchMode === "vehicle" || searchMode === "epc") && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kategorie</p>
            <Select value={category} onValueChange={(v) => { setCategory(v); setSubCategory(""); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Kategorie dílů" /></SelectTrigger>
              <SelectContent>{partCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            {currentSubs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {currentSubs.map((sub) => (
                  <button key={sub} onClick={() => setSubCategory(subCategory === sub ? "" : sub)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${subCategory === sub ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    {sub}
                  </button>
                ))}
              </div>
            )}
            {(category || brand) && (
              <Button size="sm" className="w-full" onClick={onSearch} disabled={searching}>
                {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Search className="w-3.5 h-3.5 mr-1" />}
                Vyhledat {brand && !category ? `díly ${brand}` : ""}
              </Button>
            )}
          </div>
        </>
      )}

      {/* VIN input (vin mode) */}
      {searchMode === "vin" && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">VIN kód</p>
            <Input placeholder="Zadejte VIN..." className="h-9 text-xs font-mono" value={vinQuery}
              onChange={(e) => setVinQuery(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && onVinDecode()} />
            <Button size="sm" className="w-full" onClick={onVinDecode} disabled={vinLoading}>
              {vinLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Search className="w-3.5 h-3.5 mr-1" />}
              Dekódovat VIN
            </Button>
            {vinDecoded && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                <p className="text-xs font-semibold text-primary">Rozpoznáno</p>
                <p className="text-sm font-semibold">{vinDecoded.brand} {vinDecoded.model}</p>
                <p className="text-xs text-muted-foreground">{vinDecoded.year} · {vinDecoded.engine}</p>
              </div>
            )}
          </div>
        </>
      )}

      <Separator />

      {/* Price range filter */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cena (s DPH)</p>
        <div className="flex gap-2">
          <Input placeholder="Od" type="number" className="h-8 text-xs" value={filters.minPrice ?? ""}
            onChange={(e) => setFilters({ ...filters, minPrice: e.target.value ? Number(e.target.value) : undefined })} />
          <Input placeholder="Do" type="number" className="h-8 text-xs" value={filters.maxPrice ?? ""}
            onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
      </div>

      {/* Availability filter */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dostupnost</p>
        <Select value={filters.availability || "all"} onValueChange={(v) => setFilters({ ...filters, availability: v === "all" ? undefined : v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny</SelectItem>
            <SelectItem value="available">Skladem</SelectItem>
            <SelectItem value="on_order">Na objednávku</SelectItem>
            <SelectItem value="unavailable">Nedostupné</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Manufacturer filter */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Výrobce</p>
        <Input placeholder="Název výrobce..." className="h-8 text-xs"
          value={filters.manufacturer || ""}
          onChange={(e) => setFilters({ ...filters, manufacturer: e.target.value || undefined })} />
      </div>

      {/* Catalog source filter */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Zdroj katalogu</p>
        <Select value={filters.catalogSource || "all"} onValueChange={(v) => setFilters({ ...filters, catalogSource: v === "all" ? undefined : v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny zdroje</SelectItem>
            {sourceStats.map(s => (
              <SelectItem key={s.source} value={s.source} className="text-xs">
                {sourceLabel[s.source] || s.source} ({s.count.toLocaleString("cs")})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Source stats */}
      {sourceStats.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Database className="w-3 h-3" />
            Pokrytí katalogu
          </p>
          <div className="rounded-lg border bg-muted/30 p-2 space-y-1.5">
            <p className="text-[10px] text-muted-foreground">
              Celkem <strong>{totalParts.toLocaleString("cs")}</strong> dílů
            </p>
            {sourceStats.map(s => {
              const pct = totalParts > 0 ? Math.round((s.count / totalParts) * 100) : 0;
              return (
                <div key={s.source} className="space-y-0.5">
                  <div className="flex justify-between text-[10px]">
                    <span>{sourceLabel[s.source] || s.source}</span>
                    <span className="font-mono">{s.count.toLocaleString("cs")} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Separator />

      {/* Reset */}
      <Button size="sm" variant="ghost" className="w-full text-xs" onClick={onReset}>
        <RotateCcw className="w-3.5 h-3.5 mr-1" />Resetovat filtry
      </Button>

      {/* Quick examples (part_number mode) */}
      {searchMode === "part_number" && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rychlé hledání</p>
            {["68218951AA", "68191349AC", "06507741AA"].map((code) => (
              <button key={code} onClick={() => onQuickSearch(code)}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-mono bg-muted hover:bg-muted/80 text-foreground transition-all">
                {code}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Filters;
