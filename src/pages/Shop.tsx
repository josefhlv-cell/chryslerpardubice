import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShoppingCart, Package, Send, Sparkles, AlertTriangle, ChevronLeft, ChevronRight, Loader2, Layers, RefreshCw, Image as ImageIcon, ArrowRight, Info, CheckCircle, XCircle, Filter, X, ChevronDown, ExternalLink, Car, Hash, SlidersHorizontal, Star, Truck, Box, Tag, Wrench, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const brands = ["Chrysler", "Jeep", "Dodge", "RAM", "Fiat", "Lancia"];
const PAGE_SIZE = 20;

const catalogTree: Record<string, Record<string, string[]>> = {
  Chrysler: { "300": ["2.7L V6", "3.5L V6", "5.7L HEMI", "6.1L SRT8"], "Pacifica": ["3.6L V6", "3.6L Hybrid"], "Town & Country": ["3.6L V6", "3.8L V6"], "Voyager": ["3.6L V6"], "200": ["2.4L", "3.6L V6"] },
  Jeep: { "Grand Cherokee": ["3.0L CRD", "3.6L V6", "5.7L HEMI", "6.4L SRT"], "Wrangler": ["2.0T", "3.6L V6", "2.2L CRD"], "Cherokee": ["2.0L", "2.4L", "3.2L V6"], "Compass": ["1.4T", "2.4L"], "Renegade": ["1.0T", "1.3T", "1.6L CRD"] },
  Dodge: { "Durango": ["3.6L V6", "5.7L HEMI", "6.4L SRT"], "Challenger": ["3.6L V6", "5.7L HEMI", "6.2L Hellcat", "6.4L Scat Pack"], "Charger": ["3.6L V6", "5.7L HEMI", "6.2L Hellcat"], "Journey": ["2.4L", "3.6L V6"], "Grand Caravan": ["3.6L V6"] },
  RAM: { "1500": ["3.0L EcoDiesel", "3.6L V6", "5.7L HEMI"], "2500": ["6.4L HEMI", "6.7L Cummins"], "ProMaster": ["3.6L V6", "3.0L EcoDiesel"] },
  Fiat: { "500": ["1.2L", "1.4L"], "Ducato": ["2.3L", "3.0L"], "Punto": ["1.2L", "1.4L"] },
  Lancia: { "Ypsilon": ["1.2L", "0.9L TwinAir"] },
};

const partCategories = [
  "Motor", "Převodovka", "Brzdy", "Řízení", "Podvozek", "Elektroinstalace",
  "Karoserie", "Interiér", "Klimatizace", "Výfuk", "Filtry", "Oleje a kapaliny",
];

const subCategories: Record<string, string[]> = {
  "Motor": ["Blok motoru", "Hlava válců", "Rozvodový mechanismus", "Klikový hřídel", "Písty a ojnice", "Těsnění", "Olejové čerpadlo", "Vodní čerpadlo", "Turbo"],
  "Převodovka": ["Automatická převodovka", "Manuální převodovka", "Spojka", "Diferenciál", "Hřídel"],
  "Brzdy": ["Brzdové destičky", "Brzdové kotouče", "Brzdové třmeny", "Hadice", "ABS systém"],
  "Řízení": ["Řízení s posilovačem", "Tyče řízení", "Kulové čepy", "Čerpadlo"],
  "Podvozek": ["Tlumiče", "Pružiny", "Ramena", "Stabilizátor", "Ložiska kol", "Náboje"],
  "Elektroinstalace": ["Alternátor", "Startér", "Svíčky", "Cívky", "Senzory", "Řídící jednotky"],
  "Karoserie": ["Přední nárazník", "Zadní nárazník", "Světla", "Zrcátka", "Blatníky", "Kapota"],
  "Interiér": ["Sedadla", "Palubní deska", "Volant", "Ovládání", "Pedály"],
  "Klimatizace": ["Kompresor", "Kondenzátor", "Výparník", "Filtr kabiny", "Ventily"],
  "Výfuk": ["Katalyzátor", "Výfukové svody", "Tlumiče výfuku", "Lambda sondy", "DPF filtr"],
  "Filtry": ["Olejový filtr", "Vzduchový filtr", "Palivový filtr", "Pylový filtr"],
  "Oleje a kapaliny": ["Motorový olej", "Převodový olej", "Chladicí kapalina", "Brzdová kapalina"],
};

interface PartResult {
  id: string;
  name: string;
  oem_number: string;
  internal_code: string | null;
  price_without_vat: number;
  price_with_vat: number;
  category: string | null;
  family: string | null;
  segment: string | null;
  packaging: string | null;
  description: string | null;
  manufacturer: string | null;
  catalog_source: string;
  availability: string;
  compatible_vehicles: string | null;
  superseded_by: string | null;
  supersedes: string | null;
}

type PartType = "new" | "used";
type SearchMode = "part_number" | "vehicle" | "vin" | "epc";

const sourceLabel: Record<string, string> = { mopar: "Mopar OE", autokelly: "AutoKelly", intercars: "InterCars", csv: "Lokální katalog" };
const sourcePriority: Record<string, number> = { mopar: 1, csv: 2, autokelly: 3, intercars: 4 };

const Shop = () => {
  const navigate = useNavigate();
  const { user, profile, isPendingBusiness, canPlaceOrder } = useAuth();

  const [partType, setPartType] = useState<PartType>("new");
  const [searchMode, setSearchMode] = useState<SearchMode>("part_number");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [motor, setMotor] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [query, setQuery] = useState("");
  const [vinQuery, setVinQuery] = useState("");
  const [vinDecoded, setVinDecoded] = useState<{ brand: string; model: string; year: string; engine: string } | null>(null);
  const [vinLoading, setVinLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<PartResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [priceFetching, setPriceFetching] = useState(false);
  const [expandedPart, setExpandedPart] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<PartResult | null>(null);
  const [photoDialog, setPhotoDialog] = useState<{ open: boolean; oem: string; loading: boolean; urls: string[] }>({ open: false, oem: "", loading: false, urls: [] });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [usedNote, setUsedNote] = useState("");
  const [usedSubmitted, setUsedSubmitted] = useState(false);

  const isBusinessActive = profile?.account_type === "business" && profile?.status === "active";
  const discountPercent = isBusinessActive ? (profile?.discount_percent ?? 0) : 0;

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const normalizeOem = (q: string) => q.replace(/[\s-]/g, "").toUpperCase();

  const mapToPartResult = (item: any, source: string): PartResult => ({
    id: item.id,
    name: item.name,
    oem_number: item.oem_code || item.oem_number,
    internal_code: item.internal_code || null,
    price_without_vat: item.price_without_vat ?? item.price ?? 0,
    price_with_vat: item.price_with_vat ?? Math.round((item.price ?? 0) * 1.21 * 100) / 100,
    category: item.category || null,
    family: item.family || item.brand || null,
    segment: item.segment || (item.available !== undefined ? (item.available ? "Skladem" : "Na objednávku") : null),
    packaging: item.packaging || null,
    description: item.description || null,
    manufacturer: item.manufacturer || (source === "mopar" ? "Mopar" : null),
    catalog_source: item.catalog_source || source,
    availability: item.availability || (item.available ? "available" : "unknown"),
    compatible_vehicles: item.compatible_vehicles || null,
    superseded_by: item.superseded_by || null,
    supersedes: item.supersedes || null,
  });

  const doSearch = useCallback(async (searchQuery: string, pageNum: number) => {
    if (!searchQuery && !category && !subCategory) return;
    setSearching(true);
    setPriceFetching(true);
    try {
      const normalized = normalizeOem(searchQuery);
      const allResults: PartResult[] = [];

      // ===== EPC MODE =====
      if (searchMode === "epc" && category && brand) {
        let epcQuery = supabase.from("epc_categories").select("id").eq("brand", brand).eq("category", category);
        if (model) epcQuery = epcQuery.eq("model", model);
        if (subCategory) epcQuery = epcQuery.eq("subcategory", subCategory);
        const { data: epcCats } = await epcQuery;
        if (epcCats && epcCats.length > 0) {
          const catIds = epcCats.map((c: any) => c.id);
          const { data: links } = await supabase.from("epc_part_links").select("part_id").in("epc_category_id", catIds);
          if (links && links.length > 0) {
            const partIds = [...new Set(links.map((l: any) => l.part_id))];
            const { data: epcParts } = await supabase.from("parts_new")
              .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source")
              .in("id", partIds);
            if (epcParts) allResults.push(...epcParts.map(p => mapToPartResult(p, "mopar")));
          }
        }
        if (allResults.length === 0 && subCategory) {
          const [pnRes, pcRes] = await Promise.all([
            supabase.from("parts_new").select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source")
              .ilike("name", `%${subCategory}%`).range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1),
            supabase.from("parts_catalog").select("id, name, oem_code, price, brand, category, available")
              .ilike("name", `%${subCategory}%`).range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1),
          ]);
          if (pnRes.data) allResults.push(...pnRes.data.map(p => mapToPartResult(p, "mopar")));
          if (pcRes.data) {
            const existingOems = new Set(allResults.map(r => normalizeOem(r.oem_number)));
            for (const item of pcRes.data) {
              if (!existingOems.has(normalizeOem(item.oem_code))) allResults.push(mapToPartResult(item, "csv"));
            }
          }
        }
        if (allResults.length > 0) {
          await enrichWithSupersessions(allResults);
          setResults(sortByPriority(allResults));
          setTotalCount(allResults.length);
        } else {
          toast.info(`Pro kategorii "${subCategory || category}" zatím nejsou díly v databázi.`);
          setResults([]);
          setTotalCount(0);
        }
        setSearching(false);
        setPriceFetching(false);
        return;
      }

      // ===== VEHICLE MODE =====
      if (searchMode === "vehicle" && !searchQuery && category) {
        const searchTerm = subCategory || category;
        const [pnRes, pcRes] = await Promise.all([
          supabase.from("parts_new")
            .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source", { count: "exact" })
            .ilike("name", `%${searchTerm}%`).range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1),
          supabase.from("parts_catalog")
            .select("id, name, oem_code, price, brand, category, available", { count: "exact" })
            .or(`name.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`).range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1),
        ]);
        if (pnRes.data) allResults.push(...pnRes.data.map(p => mapToPartResult(p, "mopar")));
        if (pcRes.data) {
          const existingOems = new Set(allResults.map(r => normalizeOem(r.oem_number)));
          for (const item of pcRes.data) {
            if (!existingOems.has(normalizeOem(item.oem_code))) allResults.push(mapToPartResult(item, "csv"));
          }
        }
        await enrichWithSupersessions(allResults);
        setResults(sortByPriority(allResults));
        setTotalCount((pnRes.count ?? 0) + (pcRes.count ?? 0));
        setSearching(false);
        setPriceFetching(false);
        return;
      }

      // ===== STANDARD SEARCH =====
      if (!searchQuery) {
        setResults([]);
        setTotalCount(0);
        setSearching(false);
        setPriceFetching(false);
        return;
      }

      const pnFilter = `oem_number.ilike.%${searchQuery}%,oem_number.ilike.%${normalized}%,name.ilike.%${searchQuery}%,internal_code.ilike.%${searchQuery}%`;
      const [pnRes, pcRes] = await Promise.all([
        supabase.from("parts_new")
          .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source", { count: "exact" })
          .or(pnFilter).range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1).order("name"),
        supabase.from("parts_catalog")
          .select("id, name, oem_code, price, brand, category, available", { count: "exact" })
          .or(`oem_code.ilike.%${searchQuery}%,oem_code.ilike.%${normalized}%,name.ilike.%${searchQuery}%`)
          .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1).order("name"),
      ]);

      if (pnRes.data) allResults.push(...pnRes.data.map(p => mapToPartResult(p, "mopar")));
      if (pcRes.data) {
        const existingOems = new Set(allResults.map(r => normalizeOem(r.oem_number)));
        for (const item of pcRes.data) {
          if (!existingOems.has(normalizeOem(item.oem_code))) allResults.push(mapToPartResult(item, "csv"));
        }
      }

      if (allResults.length > 0) {
        await enrichWithSupersessions(allResults);
        setResults(sortByPriority(allResults));
        setTotalCount((pnRes.count ?? 0) + (pcRes.count ?? 0));
        setSearching(false);
        setPriceFetching(false);
        return;
      }

      // Not found locally → fetch from external catalogs
      const { data: extData, error: fnError } = await supabase.functions.invoke("catalog-search", {
        body: { oemCodes: [normalized] },
      });
      if (fnError) throw new Error(fnError.message || "Chyba při volání katalogu");

      const catalogResults = extData?.results || [];
      const partResults: PartResult[] = catalogResults
        .filter((r: any) => r.found)
        .map((r: any, i: number) => ({
          id: `catalog-${i}-${r.oem_number}`,
          name: r.name || `Díl ${r.oem_number}`,
          oem_number: r.oem_number,
          internal_code: r.search_code || null,
          price_without_vat: r.price_without_vat,
          price_with_vat: r.price_with_vat,
          category: r.category || null,
          family: r.family || null,
          segment: r.segment || null,
          packaging: r.packaging || null,
          description: r.description || null,
          manufacturer: r.manufacturer || "Mopar",
          catalog_source: r.catalog_source || "mopar",
          availability: r.availability || "available",
          compatible_vehicles: r.compatible_vehicles || null,
          superseded_by: r.superseded_by || null,
          supersedes: r.supersedes || null,
        }));

      if (partResults.length === 0) toast.error(`Díl "${searchQuery}" nebyl nalezen`);

      setResults(sortByPriority(partResults));
      setTotalCount(partResults.length);

      if (partResults.length > 0) {
        const { data: freshData } = await supabase.from("parts_new")
          .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source")
          .in("oem_number", partResults.map(p => p.oem_number));
        if (freshData && freshData.length > 0) {
          const mapped = freshData.map(p => mapToPartResult(p, "mopar"));
          await enrichWithSupersessions(mapped);
          setResults(sortByPriority(mapped));
          setTotalCount(mapped.length);
        }
      }
    } catch (err: any) {
      toast.error("Chyba při vyhledávání: " + err.message);
      setResults([]);
    } finally {
      setSearching(false);
      setPriceFetching(false);
    }
  }, [category, subCategory, searchMode, brand, model]);

  const enrichWithSupersessions = async (parts: PartResult[]) => {
    const oems = parts.map(p => p.oem_number);
    if (oems.length === 0) return;
    const [byOld, byNew] = await Promise.all([
      supabase.from("part_supersessions").select("old_oem_number, new_oem_number").in("old_oem_number", oems),
      supabase.from("part_supersessions").select("old_oem_number, new_oem_number").in("new_oem_number", oems),
    ]);
    const supersededMap = new Map<string, string>();
    const supersedesMap = new Map<string, string>();
    byOld.data?.forEach(s => supersededMap.set(s.old_oem_number, s.new_oem_number));
    byNew.data?.forEach(s => supersedesMap.set(s.new_oem_number, s.old_oem_number));
    parts.forEach(p => {
      if (!p.superseded_by) p.superseded_by = supersededMap.get(p.oem_number) || null;
      if (!p.supersedes) p.supersedes = supersedesMap.get(p.oem_number) || null;
    });
  };

  const sortByPriority = (parts: PartResult[]) =>
    [...parts].sort((a, b) => (sourcePriority[a.catalog_source] || 99) - (sourcePriority[b.catalog_source] || 99));

  const hasSearched = useRef(false);
  useEffect(() => {
    if (partType === "new" && debouncedQuery && searchMode === "part_number") {
      hasSearched.current = true;
      doSearch(debouncedQuery, page);
    }
  }, [debouncedQuery, page, partType, doSearch, searchMode]);

  const handleSearch = () => { setPage(0); doSearch(query, 0); };

  const handleVinDecode = async () => {
    if (!vinQuery || vinQuery.length < 11) { toast.error("Zadejte platný VIN"); return; }
    setVinLoading(true);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${vinQuery}?format=json`);
      const json = await res.json();
      const r = json.Results?.[0];
      if (r) {
        const decoded = {
          brand: r.Make || "", model: r.Model || "", year: r.ModelYear || "",
          engine: [r.DisplacementL ? `${r.DisplacementL}L` : "", r.FuelTypePrimary || ""].filter(Boolean).join(" "),
        };
        setVinDecoded(decoded);
        setBrand(decoded.brand);
        setModel(decoded.model);
        setYear(decoded.year);
        setMotor(decoded.engine);
        toast.success("VIN dekódován");
      }
    } catch { toast.error("Nepodařilo se dekódovat VIN"); }
    setVinLoading(false);
  };

  const handlePhotoClick = (oem: string) => {
    setPhotoDialog({ open: true, oem, loading: true, urls: [] });
    setTimeout(() => {
      setPhotoDialog(prev => ({ ...prev, loading: false, urls: [] }));
    }, 1000);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const [submitting, setSubmitting] = useState(false);

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
      });
      if (error) throw error;
      toast.success(`Objednávka "${part.name}" vytvořena!`);
    } catch (err: any) { toast.error(err.message || "Chyba"); }
    finally { setSubmitting(false); }
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

  const calculateDiscountedPrice = (priceWithoutVat: number) => {
    const discounted = priceWithoutVat * (1 - discountPercent / 100);
    const withVat = discounted * 1.21;
    return { discounted: Math.round(discounted * 100) / 100, withVat: Math.round(withVat * 100) / 100 };
  };

  const models = brand && catalogTree[brand] ? Object.keys(catalogTree[brand]) : [];
  const engines = brand && model && catalogTree[brand]?.[model] ? catalogTree[brand][model] : [];
  const currentSubCategories = category ? (subCategories[category] || []) : [];

  // ---- RENDER HELPERS ----

  const AvailabilityIndicator = ({ availability }: { availability: string }) => {
    if (availability === "available") return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />Skladem
      </span>
    );
    if (availability === "unavailable") return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />Nedostupné
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />Na dotaz
      </span>
    );
  };

  const SourceBadge = ({ source }: { source: string }) => {
    const styles: Record<string, string> = {
      mopar: "bg-primary/15 text-primary border-primary/25",
      autokelly: "bg-accent/15 text-accent border-accent/25",
      intercars: "bg-blue-500/15 text-blue-400 border-blue-500/25",
      csv: "bg-muted text-muted-foreground border-border",
    };
    return (
      <Badge variant="outline" className={`text-[10px] ${styles[source] || styles.csv}`}>
        {sourceLabel[source] || source}
      </Badge>
    );
  };

  const FilterSidebar = () => (
    <div className="space-y-5">
      {/* Search mode */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Režim hledání</p>
        <div className="grid grid-cols-2 gap-1.5">
          {([["part_number", "Číslo dílu", Hash], ["vehicle", "Vozidlo", Car], ["vin", "VIN kód", Tag], ["epc", "EPC katalog", Layers]] as const).map(([mode, label, Icon]) => (
            <button key={mode} onClick={() => { setSearchMode(mode); setResults(null); setPage(0); setCategory(""); setSubCategory(""); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${searchMode === mode ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80 text-foreground"}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Brand / Model / Engine */}
      {(searchMode === "vehicle" || searchMode === "epc") && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vozidlo</p>
          <Select value={brand} onValueChange={(v) => { setBrand(v); setModel(""); setMotor(""); setCategory(""); setSubCategory(""); }}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Značka" /></SelectTrigger>
            <SelectContent>{brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
          {models.length > 0 && (
            <Select value={model} onValueChange={(v) => { setModel(v); setMotor(""); setCategory(""); setSubCategory(""); }}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Model" /></SelectTrigger>
              <SelectContent>{models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {engines.length > 0 && (
            <Select value={motor} onValueChange={setMotor}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Motor" /></SelectTrigger>
              <SelectContent>{engines.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Category filter */}
      {(searchMode === "vehicle" || searchMode === "epc") && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kategorie</p>
          <Select value={category} onValueChange={(v) => { setCategory(v); setSubCategory(""); }}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Kategorie dílů" /></SelectTrigger>
            <SelectContent>{partCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          {currentSubCategories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {currentSubCategories.map(sub => (
                <button key={sub}
                  onClick={() => setSubCategory(subCategory === sub ? "" : sub)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${subCategory === sub ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                  {sub}
                </button>
              ))}
            </div>
          )}
          {category && (
            <Button size="sm" className="w-full" onClick={() => doSearch(query, 0)} disabled={searching}>
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Search className="w-3.5 h-3.5 mr-1" />}
              Vyhledat
            </Button>
          )}
        </div>
      )}

      {/* VIN input */}
      {searchMode === "vin" && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">VIN kód</p>
          <Input placeholder="Zadejte VIN..." className="h-9 text-xs font-mono" value={vinQuery}
            onChange={e => setVinQuery(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleVinDecode()} />
          <Button size="sm" className="w-full" onClick={handleVinDecode} disabled={vinLoading}>
            {vinLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Search className="w-3.5 h-3.5 mr-1" />}
            Dekódovat VIN
          </Button>
          {vinDecoded && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
              <p className="text-xs font-semibold text-primary">Rozpoznané vozidlo</p>
              <p className="text-sm font-semibold">{vinDecoded.brand} {vinDecoded.model}</p>
              <p className="text-xs text-muted-foreground">{vinDecoded.year} · {vinDecoded.engine}</p>
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* Quick examples */}
      {searchMode === "part_number" && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rychlé hledání</p>
          <div className="space-y-1">
            {["68218951AA", "68191349AC", "06507741AA"].map(code => (
              <button key={code}
                onClick={() => { setQuery(code); setPage(0); doSearch(code, 0); }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-mono bg-muted hover:bg-muted/80 text-foreground transition-all">
                {code}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const PartCard = ({ part, index }: { part: PartResult; index: number }) => {
    const discounted = discountPercent > 0 ? calculateDiscountedPrice(part.price_without_vat) : null;
    const isExpanded = expandedPart === part.id;

    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.02, duration: 0.2 }}
        className={`group rounded-xl border bg-card hover:border-primary/30 transition-all duration-200 ${selectedPart?.id === part.id ? "border-primary ring-1 ring-primary/20" : "border-border"}`}
      >
        <div className="p-4">
          {/* Top row: badges */}
          <div className="flex items-center gap-1.5 mb-2">
            <SourceBadge source={part.catalog_source} />
            <AvailabilityIndicator availability={part.availability} />
            {part.superseded_by && (
              <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/20">
                Náhrada
              </Badge>
            )}
          </div>

          {/* Main info row */}
          <div className="flex gap-3">
            {/* Photo placeholder */}
            <button
              onClick={() => handlePhotoClick(part.oem_number)}
              className="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-lg bg-secondary border border-border flex items-center justify-center hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer group/photo"
              title="Zobrazit fotografii"
            >
              <ImageIcon className="w-6 h-6 text-muted-foreground group-hover/photo:text-primary transition-colors" />
            </button>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold leading-tight mb-0.5 truncate" title={part.name}>
                {part.name}
              </h3>
              <p className="text-xs text-muted-foreground font-mono mb-1">
                OEM: {part.oem_number}
                {part.internal_code && <span className="ml-2 text-muted-foreground/60">({part.internal_code})</span>}
              </p>
              <div className="flex flex-wrap gap-1">
                {part.manufacturer && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Wrench className="w-2.5 h-2.5" />{part.manufacturer}
                  </span>
                )}
                {part.category && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Tag className="w-2.5 h-2.5" />{part.category}
                  </span>
                )}
                {part.family && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Box className="w-2.5 h-2.5" />{part.family}
                  </span>
                )}
              </div>
            </div>

            {/* Price column */}
            <div className="shrink-0 text-right">
              <p className="text-base font-bold text-foreground">
                {part.price_with_vat > 0 ? `${part.price_with_vat.toLocaleString("cs")} Kč` : "Na dotaz"}
              </p>
              {part.price_without_vat > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  bez DPH: {part.price_without_vat.toLocaleString("cs")} Kč
                </p>
              )}
              {discounted && discountPercent > 0 && (
                <p className="text-xs font-semibold text-primary mt-0.5">
                  −{discountPercent}%: {discounted.withVat.toLocaleString("cs")} Kč
                </p>
              )}
            </div>
          </div>

          {/* Supersession alerts */}
          {part.superseded_by && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/5 border border-accent/15">
              <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0" />
              <p className="text-[11px] text-foreground">
                <span className="font-medium">Nahrazeno:</span>{" "}
                <span className="font-mono">{part.oem_number}</span> → <span className="font-mono font-bold">{part.superseded_by}</span>
              </p>
              <Button size="sm" variant="ghost" className="h-5 px-2 text-[10px] ml-auto"
                onClick={() => { setQuery(part.superseded_by!); doSearch(part.superseded_by!, 0); }}>
                Hledat nový
              </Button>
            </div>
          )}
          {part.supersedes && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <p className="text-[11px] text-foreground">
                Nahrazuje starší díl: <span className="font-mono">{part.supersedes}</span>
              </p>
            </div>
          )}

          {/* Expand/Actions row */}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="ghost" className="text-[11px] text-muted-foreground h-7 px-2"
              onClick={() => setExpandedPart(isExpanded ? null : part.id)}>
              <ChevronDown className={`w-3.5 h-3.5 mr-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              {isExpanded ? "Méně" : "Více informací"}
            </Button>
            <Button size="sm" variant="ghost" className="text-[11px] text-muted-foreground h-7 px-2"
              onClick={() => setSelectedPart(selectedPart?.id === part.id ? null : part)}>
              <Eye className="w-3.5 h-3.5 mr-1" />Detail
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="outline" className="text-[11px] h-7 px-3"
              onClick={async () => {
                if (!user) { navigate("/auth"); return; }
                if (!canPlaceOrder) { toast.error("Účet není schválen."); return; }
                try {
                  await supabase.from("orders").insert({
                    user_id: user.id, order_type: "used" as const, quantity: 1,
                    part_name: part.name, oem_number: part.oem_number,
                  });
                  toast.success("Poptávka odeslána!");
                } catch (err: any) { toast.error(err.message); }
              }}
              disabled={isPendingBusiness}>
              <Package className="w-3 h-3 mr-1" />Použitý
            </Button>
            <Button size="sm" className="text-[11px] h-7 px-3"
              onClick={() => handleOrderNew(part)}
              disabled={isPendingBusiness || submitting}>
              <ShoppingCart className="w-3 h-3 mr-1" />Objednat
            </Button>
          </div>

          {/* Expanded tech details */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <Separator className="my-3" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  {part.description && (
                    <div className="md:col-span-2">
                      <span className="text-muted-foreground">Popis: </span>
                      <span>{part.description}</span>
                    </div>
                  )}
                  {part.compatible_vehicles && (
                    <div className="md:col-span-2">
                      <span className="text-muted-foreground">Kompatibilní vozidla: </span>
                      <span>{part.compatible_vehicles}</span>
                    </div>
                  )}
                  <div><span className="text-muted-foreground">Zdroj: </span>{sourceLabel[part.catalog_source] || part.catalog_source}</div>
                  {part.category && <div><span className="text-muted-foreground">Kategorie: </span>{part.category}</div>}
                  {part.segment && <div><span className="text-muted-foreground">Segment: </span>{part.segment}</div>}
                  {part.family && <div><span className="text-muted-foreground">Rodina: </span>{part.family}</div>}
                  {part.packaging && <div><span className="text-muted-foreground">Balení: </span>{part.packaging}</div>}
                  {part.manufacturer && <div><span className="text-muted-foreground">Výrobce: </span>{part.manufacturer}</div>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  };

  // ---- DETAIL PANEL ----
  const DetailPanel = ({ part }: { part: PartResult }) => {
    const discounted = discountPercent > 0 ? calculateDiscountedPrice(part.price_without_vat) : null;
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <SourceBadge source={part.catalog_source} />
            <h2 className="font-display text-lg font-bold mt-2">{part.name}</h2>
            <p className="text-sm text-muted-foreground font-mono mt-0.5">OEM: {part.oem_number}</p>
          </div>
          <button onClick={() => setSelectedPart(null)} className="p-1 hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Photo area */}
        <button
          onClick={() => handlePhotoClick(part.oem_number)}
          className="w-full aspect-[4/3] rounded-xl bg-secondary border border-border flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer"
        >
          <ImageIcon className="w-10 h-10 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Kliknutím načtete fotografii</span>
        </button>

        {/* Price */}
        <div className="rounded-xl bg-secondary p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cena s DPH</span>
            <span className="text-xl font-bold">{part.price_with_vat > 0 ? `${part.price_with_vat.toLocaleString("cs")} Kč` : "Na dotaz"}</span>
          </div>
          {part.price_without_vat > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Cena bez DPH</span>
              <span>{part.price_without_vat.toLocaleString("cs")} Kč</span>
            </div>
          )}
          {discounted && discountPercent > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-primary font-medium">Po slevě ({discountPercent}%)</span>
              <span className="text-primary font-bold">{discounted.withVat.toLocaleString("cs")} Kč</span>
            </div>
          )}
        </div>

        <AvailabilityIndicator availability={part.availability} />

        {/* Supersession */}
        {part.superseded_by && (
          <div className="rounded-lg bg-accent/5 border border-accent/15 p-3">
            <p className="text-xs font-medium mb-1">Tento díl byl nahrazen</p>
            <p className="text-sm font-mono">{part.oem_number} → <span className="font-bold">{part.superseded_by}</span></p>
            <Button size="sm" variant="outline" className="mt-2 text-xs h-7"
              onClick={() => { setQuery(part.superseded_by!); doSearch(part.superseded_by!, 0); setSelectedPart(null); }}>
              Vyhledat nový díl
            </Button>
          </div>
        )}
        {part.supersedes && (
          <div className="rounded-lg bg-blue-500/5 border border-blue-500/15 p-3">
            <p className="text-xs">Nahrazuje starší díl: <span className="font-mono font-medium">{part.supersedes}</span></p>
          </div>
        )}

        {/* Technical details */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Technické informace</p>
          <div className="space-y-1.5 text-xs">
            {part.manufacturer && <div className="flex justify-between"><span className="text-muted-foreground">Výrobce</span><span>{part.manufacturer}</span></div>}
            {part.category && <div className="flex justify-between"><span className="text-muted-foreground">Kategorie</span><span>{part.category}</span></div>}
            {part.family && <div className="flex justify-between"><span className="text-muted-foreground">Rodina</span><span>{part.family}</span></div>}
            {part.segment && <div className="flex justify-between"><span className="text-muted-foreground">Segment</span><span>{part.segment}</span></div>}
            {part.packaging && <div className="flex justify-between"><span className="text-muted-foreground">Balení</span><span>{part.packaging}</span></div>}
            {part.internal_code && <div className="flex justify-between"><span className="text-muted-foreground">Interní kód</span><span className="font-mono">{part.internal_code}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Zdroj</span><span>{sourceLabel[part.catalog_source] || part.catalog_source}</span></div>
          </div>
        </div>

        {part.description && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Popis</p>
            <p className="text-xs text-foreground leading-relaxed">{part.description}</p>
          </div>
        )}

        {part.compatible_vehicles && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kompatibilní vozidla</p>
            <p className="text-xs text-foreground leading-relaxed">{part.compatible_vehicles}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={() => handleOrderNew(part)} disabled={isPendingBusiness || submitting}>
            <ShoppingCart className="w-4 h-4 mr-1" />Objednat nový
          </Button>
          <Button variant="outline" className="flex-1"
            onClick={async () => {
              if (!user) { navigate("/auth"); return; }
              if (!canPlaceOrder) { toast.error("Účet není schválen."); return; }
              try {
                await supabase.from("orders").insert({
                  user_id: user.id, order_type: "used" as const, quantity: 1,
                  part_name: part.name, oem_number: part.oem_number,
                });
                toast.success("Poptávka odeslána!");
              } catch (err: any) { toast.error(err.message); }
            }}
            disabled={isPendingBusiness}>
            <Package className="w-4 h-4 mr-1" />Poptat použitý
          </Button>
        </div>
      </div>
    );
  };

  // ===== MAIN RENDER =====
  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-12 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h1 className="font-display text-xl md:text-2xl font-bold">Katalog náhradních dílů</h1>
              <p className="text-xs text-muted-foreground hidden md:block">Originální díly Chrysler · Jeep · Dodge · RAM · Fiat</p>
            </div>

            {/* Part type toggle */}
            <div className="flex rounded-lg bg-secondary p-0.5 gap-0.5">
              <button onClick={() => { setPartType("new"); setResults(null); setUsedSubmitted(false); setPage(0); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${partType === "new" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Sparkles className="w-3.5 h-3.5" />Nové
              </button>
              <button onClick={() => { setPartType("used"); setResults(null); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${partType === "used" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Package className="w-3.5 h-3.5" />Použité
              </button>
            </div>

            {priceFetching && (
              <span className="text-[10px] text-primary flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />Aktualizace...
              </span>
            )}
          </div>

          {/* Search bar */}
          {partType === "new" && (
            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={searchMode === "part_number" ? "Zadejte OEM číslo dílu (např. 68218951AA)..." : searchMode === "vin" ? "Hledat díl po dekódování VIN..." : "Název nebo číslo dílu..."}
                  className="pl-10 h-10 md:h-11 text-sm rounded-lg"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setPage(0); }}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} disabled={searching} className="h-10 md:h-11 px-5">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span className="hidden md:inline ml-1.5">Hledat</span>
              </Button>
              {/* Mobile filter toggle */}
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-10 md:h-11 md:hidden px-3">
                    <SlidersHorizontal className="w-4 h-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80">
                  <SheetHeader>
                    <SheetTitle>Filtry</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <FilterSidebar />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          )}
        </div>
      </div>

      {isPendingBusiness && (
        <div className="max-w-7xl mx-auto px-4 mt-3">
          <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2.5 flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-accent shrink-0" />
            Váš firemní účet čeká na schválení. Objednávky nejsou zatím povoleny.
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 mt-4">
        <div className="flex gap-6">
          {/* Left sidebar — desktop only */}
          {partType === "new" && (
            <div className="hidden md:block w-60 shrink-0">
              <div className="sticky top-32 space-y-4">
                <FilterSidebar />
              </div>
            </div>
          )}

          {/* Center — results */}
          <div className="flex-1 min-w-0">
            {/* Used part form */}
            {partType === "used" && (
              <AnimatePresence mode="wait">
                {usedSubmitted ? (
                  <motion.div key="submitted" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md mx-auto rounded-xl border bg-card p-8 flex flex-col items-center gap-4 text-center mt-8">
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
                        value={query} onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleUsedSubmit()} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={brand} onValueChange={setBrand}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Značka" /></SelectTrigger>
                        <SelectContent>{brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input placeholder="Model" className="h-9 text-xs" value={model} onChange={e => setModel(e.target.value)} />
                    </div>
                    <Textarea placeholder="Poznámka..." className="text-xs" rows={2} value={usedNote} onChange={e => setUsedNote(e.target.value)} />
                    <Button className="w-full h-10" onClick={handleUsedSubmit} disabled={isPendingBusiness}>
                      <Send className="w-4 h-4 mr-1" />Odeslat poptávku
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/* Loading */}
            {partType === "new" && searching && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Vyhledávám v katalozích...</p>
              </div>
            )}

            {/* No results */}
            {partType === "new" && !searching && results && results.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                  <Search className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">Žádné výsledky</p>
                <p className="text-xs text-muted-foreground">Zkuste jiný dotaz nebo změňte filtry</p>
              </motion.div>
            )}

            {/* Results */}
            {partType === "new" && !searching && results && results.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{totalCount}</span> výsledků
                  </p>
                  {totalPages > 1 && <span className="text-xs text-muted-foreground">Strana {page + 1} z {totalPages}</span>}
                </div>

                <div className="space-y-2">
                  {results.map((part, i) => (
                    <PartCard key={part.id} part={part} index={i} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
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
                    <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Terms link */}
            <div className="text-center pt-6 pb-4">
              <a href="/terms" className="text-[10px] text-muted-foreground underline hover:text-foreground transition-colors">
                Obchodní podmínky
              </a>
            </div>
          </div>

          {/* Right sidebar — detail panel (desktop) */}
          {partType === "new" && selectedPart && (
            <div className="hidden lg:block w-80 shrink-0">
              <div className="sticky top-32">
                <Card className="border-primary/20">
                  <CardContent className="p-4">
                    <DetailPanel part={selectedPart} />
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile detail sheet */}
      <Sheet open={!!selectedPart && typeof window !== "undefined" && window.innerWidth < 1024} onOpenChange={(open) => !open && setSelectedPart(null)}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Detail dílu</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {selectedPart && <DetailPanel part={selectedPart} />}
          </div>
        </SheetContent>
      </Sheet>

      {/* Photo Dialog */}
      <Dialog open={photoDialog.open} onOpenChange={(open) => setPhotoDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">Fotografie — {photoDialog.oem}</DialogTitle>
          </DialogHeader>
          {photoDialog.loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-sm text-muted-foreground">Načítám z katalogu...</span>
            </div>
          ) : photoDialog.urls.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {photoDialog.urls.map((url, i) => (
                <img key={i} src={url} alt={`${photoDialog.oem} foto ${i + 1}`} className="w-full rounded-lg border" />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Fotografie zatím není k dispozici</p>
              <p className="text-[10px] text-muted-foreground mt-1">Bude dostupná po propojení s Mopar EPC</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Shop;
