import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShoppingCart, Package, Send, Sparkles, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const brands = ["Chrysler", "Jeep", "Dodge", "RAM", "Fiat", "Lancia"];
const years = Array.from({ length: 30 }, (_, i) => (2025 - i).toString());
const PAGE_SIZE = 20;

// Mopar catalog structure
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
}

type PartType = "new" | "used";
type SearchMode = "part_number" | "vehicle" | "vin";

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
  const [query, setQuery] = useState("");
  const [vinQuery, setVinQuery] = useState("");
  const [vinDecoded, setVinDecoded] = useState<{ brand: string; model: string; year: string; engine: string } | null>(null);
  const [vinLoading, setVinLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<PartResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  const [usedNote, setUsedNote] = useState("");
  const [usedSubmitted, setUsedSubmitted] = useState(false);

  const isBusinessActive = profile?.account_type === "business" && profile?.status === "active";
  const discountPercent = isBusinessActive ? (profile?.discount_percent ?? 0) : 0;

  // Debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const normalizeOem = (q: string) => {
    let clean = q.replace(/[\s-]/g, "").toUpperCase();
    // Auto-prefix: if it looks like a part number without prefix, add 00
    if (/^\d{2}[A-Z0-9]+$/.test(clean) && clean.length >= 8) {
      // Already has 2-digit prefix
    } else if (/^[A-Z0-9]{8,}$/.test(clean) && !clean.startsWith("00")) {
      // Try with 00 prefix too
    }
    return clean;
  };

  const doSearch = useCallback(async (searchQuery: string, pageNum: number) => {
    if (!searchQuery && !brand && !category) return;
    setSearching(true);
    try {
      const cleanQuery = searchQuery.replace(/^0+/, "");
      const normalized = normalizeOem(searchQuery);
      
      let q = supabase
        .from("parts_new")
        .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family, segment, packaging", { count: "exact" });

      if (searchQuery) {
        // Search by OEM (with and without leading zeros), name, and internal code
        q = q.or(`oem_number.ilike.%${searchQuery}%,oem_number.ilike.%${cleanQuery}%,oem_number.ilike.%${normalized}%,name.ilike.%${searchQuery}%,internal_code.ilike.%${searchQuery}%`);
      }
      if (category) {
        q = q.ilike("category", `%${category}%`);
      }

      const from = pageNum * PAGE_SIZE;
      const { data, error, count } = await q.range(from, from + PAGE_SIZE - 1).order("name");
      if (error) throw error;

      setResults(data || []);
      setTotalCount(count ?? 0);
    } catch (err: any) {
      toast.error("Chyba při vyhledávání: " + err.message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [brand, category]);

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
          brand: r.Make || "",
          model: r.Model || "",
          year: r.ModelYear || "",
          engine: [r.DisplacementL ? `${r.DisplacementL}L` : "", r.FuelTypePrimary || ""].filter(Boolean).join(" "),
        };
        setVinDecoded(decoded);
        setBrand(decoded.brand);
        setModel(decoded.model);
        setYear(decoded.year);
        setMotor(decoded.engine);
        toast.success("VIN dekódován – vozidlo rozpoznáno");
      }
    } catch {
      toast.error("Nepodařilo se dekódovat VIN");
    }
    setVinLoading(false);
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
        user_id: user.id,
        part_id: part.id,
        order_type: "new" as const,
        quantity: 1,
        unit_price: part.price_without_vat,
        part_name: part.name,
        oem_number: part.oem_number,
      });
      if (error) throw error;
      toast.success(`Objednávka "${part.name}" vytvořena!`);
    } catch (err: any) {
      toast.error(err.message || "Chyba při vytváření objednávky");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUsedSubmit = async () => {
    if (!query) { toast.error("Vyplňte název dílu"); return; }
    if (!user) { toast.error("Pro poptávku se musíte přihlásit"); navigate("/auth"); return; }
    if (!canPlaceOrder) { toast.error("Váš účet zatím nebyl schválen."); return; }
    try {
      const { error } = await supabase.from("orders").insert({
        user_id: user.id,
        order_type: "used" as const,
        quantity: 1,
        part_name: query,
        customer_note: [brand && `Značka: ${brand}`, model && `Model: ${model}`, year && `Rok: ${year}`, motor && `Motor: ${motor}`, usedNote].filter(Boolean).join("\n"),
      });
      if (error) throw error;
      setUsedSubmitted(true);
      toast.success("Poptávka odeslána!");
    } catch (err: any) {
      toast.error(err.message || "Chyba při odesílání poptávky");
    }
  };

  const resetUsed = () => { setUsedSubmitted(false); setBrand(""); setModel(""); setYear(""); setMotor(""); setQuery(""); setUsedNote(""); };

  const calculateDiscountedPrice = (priceWithoutVat: number) => {
    const discounted = priceWithoutVat * (1 - discountPercent / 100);
    const withVat = discounted * 1.21;
    return { discounted: Math.round(discounted * 100) / 100, withVat: Math.round(withVat * 100) / 100 };
  };

  const models = brand && catalogTree[brand] ? Object.keys(catalogTree[brand]) : [];
  const engines = brand && model && catalogTree[brand]?.[model] ? catalogTree[brand][model] : [];

  return (
    <div className="min-h-screen pb-20">
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold">Mopar katalog</h1>
          <p className="text-xs text-muted-foreground">Originální díly Chrysler · Jeep · Dodge · RAM</p>
        </motion.div>

        {isPendingBusiness && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card px-4 py-3 border-l-4 border-yellow-500">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
              <p className="text-xs text-muted-foreground">Váš firemní účet čeká na schválení.</p>
            </div>
          </motion.div>
        )}

        {/* New / Used Toggle */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="flex rounded-xl bg-secondary p-1 gap-1">
          <button onClick={() => { setPartType("new"); setResults(null); setUsedSubmitted(false); setPage(0); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${partType === "new" ? "gradient-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}>
            <Sparkles className="w-4 h-4" />Nový díl
          </button>
          <button onClick={() => { setPartType("used"); setResults(null); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${partType === "used" ? "gradient-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}>
            <Package className="w-4 h-4" />Použitý díl
          </button>
        </motion.div>

        {/* Search mode tabs for new parts */}
        {partType === "new" && (
          <div className="flex rounded-lg bg-muted p-0.5 gap-0.5">
            {([["part_number", "Číslo dílu"], ["vehicle", "Vozidlo"], ["vin", "VIN"]] as const).map(([mode, label]) => (
              <button key={mode} onClick={() => { setSearchMode(mode); setResults(null); setPage(0); }}
                className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${searchMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {partType === "used" && usedSubmitted ? (
            <motion.div key="submitted" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="glass-card p-6 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                <Send className="w-7 h-7 text-success" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg">Poptávka odeslána</h3>
                <p className="text-sm text-muted-foreground mt-1">Ověříme dostupnost a ozveme se. Děkujeme!</p>
              </div>
              <Button variant="outline" onClick={resetUsed}>Nová poptávka</Button>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-3">
              {/* VIN search */}
              {searchMode === "vin" && partType === "new" && (
                <div className="space-y-2">
                  <div className="relative flex gap-2">
                    <Input placeholder="Zadejte VIN vozidla..." className="h-12 text-base" value={vinQuery}
                      onChange={e => setVinQuery(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === "Enter" && handleVinDecode()} />
                    <Button onClick={handleVinDecode} disabled={vinLoading} className="h-12 px-4">
                      {vinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                  {vinDecoded && (
                    <div className="glass-card p-3 space-y-1">
                      <p className="text-xs font-semibold text-primary">Vozidlo rozpoznáno:</p>
                      <p className="text-sm font-medium">{vinDecoded.brand} {vinDecoded.model} {vinDecoded.year}</p>
                      <p className="text-xs text-muted-foreground">{vinDecoded.engine}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Vehicle structure search */}
              {searchMode === "vehicle" && partType === "new" && (
                <div className="space-y-2">
                  <Select value={brand} onValueChange={(v) => { setBrand(v); setModel(""); setMotor(""); }}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Značka" /></SelectTrigger>
                    <SelectContent>{brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                  {models.length > 0 && (
                    <Select value={model} onValueChange={(v) => { setModel(v); setMotor(""); }}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Model" /></SelectTrigger>
                      <SelectContent>{models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  {engines.length > 0 && (
                    <Select value={motor} onValueChange={setMotor}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Motor" /></SelectTrigger>
                      <SelectContent>{engines.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Kategorie dílů" /></SelectTrigger>
                    <SelectContent>{partCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              {/* Part number search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder={searchMode === "part_number" ? "OEM číslo (např. 68218951AA)..." : searchMode === "vehicle" ? "Hledejte díl..." : partType === "used" ? "Jaký díl hledáte?" : "Název dílu..."}
                  className="pl-11 h-12 text-base rounded-xl"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setPage(0); }}
                  onKeyDown={e => e.key === "Enter" && (partType === "new" ? handleSearch() : handleUsedSubmit())}
                />
              </div>

              {/* Quick OEM examples */}
              {searchMode === "part_number" && partType === "new" && !query && (
                <div className="flex flex-wrap gap-1.5">
                  <p className="text-[10px] text-muted-foreground w-full">Příklady:</p>
                  {["68218951AA", "68191349AC", "06507741AA"].map(code => (
                    <Button key={code} size="sm" variant="outline" className="text-[10px] h-7"
                      onClick={() => { setQuery(code); setPage(0); doSearch(code, 0); }}>
                      {code}
                    </Button>
                  ))}
                </div>
              )}

              {/* Used part extras */}
              {partType === "used" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={brand} onValueChange={setBrand}>
                      <SelectTrigger className="h-10 text-xs"><SelectValue placeholder="Značka" /></SelectTrigger>
                      <SelectContent>{brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input placeholder="Model" className="h-10 text-xs" value={model} onChange={e => setModel(e.target.value)} />
                  </div>
                  <Textarea placeholder="Poznámka k poptávce..." className="text-xs" rows={2} value={usedNote} onChange={e => setUsedNote(e.target.value)} />
                </>
              )}

              <Button variant="hero" className="w-full h-11"
                onClick={partType === "new" ? handleSearch : handleUsedSubmit}
                disabled={searching || (partType === "used" && isPendingBusiness)}>
                {partType === "new" ? (
                  <>{searching ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}{searching ? "Hledám..." : "Vyhledat"}</>
                ) : (<><Send className="w-4 h-4 mr-1" />Odeslat poptávku</>)}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        {partType === "new" && searching && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-3 text-sm text-muted-foreground">Hledám v Mopar katalogu...</span>
          </div>
        )}

        {/* No results */}
        {partType === "new" && !searching && results && results.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
            <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Žádné výsledky</p>
            <p className="text-xs text-muted-foreground mt-1">Zkuste upravit hledaný výraz nebo zkontrolujte číslo dílu</p>
          </motion.div>
        )}

        {/* Results */}
        {partType === "new" && !searching && results && results.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-sm text-muted-foreground">{totalCount} výsledků</h2>
              {totalPages > 1 && <span className="text-xs text-muted-foreground">Strana {page + 1}/{totalPages}</span>}
            </div>

            {results.map((part, i) => {
              const discounted = discountPercent > 0 ? calculateDiscountedPrice(part.price_without_vat) : null;
              return (
                <motion.div key={part.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="glass-card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold truncate">{part.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono">OEM: {part.oem_number}</p>
                      {part.internal_code && <p className="text-[10px] text-muted-foreground">Kód: {part.internal_code}</p>}
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {part.family && <Badge variant="outline" className="text-[9px]">{part.family}</Badge>}
                        {part.category && <Badge variant="outline" className="text-[9px]">{part.category}</Badge>}
                        {part.segment && <Badge variant="outline" className="text-[9px]">{part.segment}</Badge>}
                        {part.packaging && <Badge variant="outline" className="text-[9px]">{part.packaging}</Badge>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">Bez DPH:</span>
                      <span className="font-semibold">{part.price_without_vat.toLocaleString("cs")} Kč</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">S DPH:</span>
                      <span className="font-semibold">{part.price_with_vat.toLocaleString("cs")} Kč</span>
                    </div>
                    {discounted && discountPercent > 0 && (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">Po slevě ({discountPercent}%):</span>
                        <span className="font-bold text-gradient">
                          {discounted.discounted.toLocaleString("cs")} / {discounted.withVat.toLocaleString("cs")} Kč
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="hero" className="flex-1 text-xs"
                      onClick={() => handleOrderNew(part)} disabled={isPendingBusiness || submitting}>
                      <ShoppingCart className="w-3.5 h-3.5 mr-1" />Objednat nový
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-xs"
                      onClick={async () => {
                        if (!user) { navigate("/auth"); return; }
                        if (!canPlaceOrder) { toast.error("Účet není schválen."); return; }
                        try {
                          await supabase.from("orders").insert({
                            user_id: user.id, order_type: "used" as const, quantity: 1,
                            part_name: part.name, oem_number: part.oem_number,
                          });
                          toast.success("Poptávka na použitý díl odeslána!");
                        } catch (err: any) { toast.error(err.message); }
                      }}
                      disabled={isPendingBusiness || submitting}>
                      <Package className="w-3.5 h-3.5 mr-1" />Poptat použitý
                    </Button>
                  </div>
                </motion.div>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-3">
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
          </motion.div>
        )}

        {/* Terms link */}
        <div className="text-center pt-2 pb-4">
          <a href="/terms" className="text-[10px] text-muted-foreground underline hover:text-foreground transition-colors">
            Obchodní podmínky pro prodej náhradních dílů
          </a>
        </div>
      </div>
    </div>
  );
};

export default Shop;
