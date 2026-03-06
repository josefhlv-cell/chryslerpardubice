import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShoppingCart, Package, Send, Sparkles, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const brands = ["Chrysler", "Jeep", "Dodge", "RAM", "Fiat", "Lancia"];
const years = Array.from({ length: 30 }, (_, i) => (2025 - i).toString());
const PAGE_SIZE = 20;

interface PartResult {
  id: string;
  name: string;
  oem_number: string;
  internal_code: string | null;
  price_without_vat: number;
  price_with_vat: number;
  category: string | null;
  family: string | null;
}

type PartType = "new" | "used";

const Shop = () => {
  const navigate = useNavigate();
  const { user, profile, isPendingBusiness, canPlaceOrder } = useAuth();

  const [partType, setPartType] = useState<PartType>("new");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [motor, setMotor] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<PartResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // Used part request
  const [usedNote, setUsedNote] = useState("");
  const [usedSubmitted, setUsedSubmitted] = useState(false);

  // Discount info from profile
  const isBusinessActive = profile?.account_type === "business" && profile?.status === "active";
  const discountPercent = isBusinessActive ? (profile?.discount_percent ?? 0) : 0;

  // Debounce search input (400ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const doSearch = useCallback(async (searchQuery: string, pageNum: number) => {
    if (!searchQuery && !brand) return;
    setSearching(true);
    try {
      const cleanQuery = searchQuery.replace(/^0+/, "");
      let q = supabase
        .from("parts_new")
        .select("id, name, oem_number, internal_code, price_without_vat, price_with_vat, category, family", { count: "exact" });

      if (searchQuery) {
        q = q.or(`oem_number.ilike.%${searchQuery}%,oem_number.ilike.%${cleanQuery}%,name.ilike.%${searchQuery}%`);
      }

      const from = pageNum * PAGE_SIZE;
      const { data, error, count } = await q.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      setResults(data || []);
      setTotalCount(count ?? 0);
    } catch (err: any) {
      toast.error("Chyba při vyhledávání: " + err.message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [brand]);

  // Auto-search on debounced query change or page change
  const hasSearched = useRef(false);
  useEffect(() => {
    if (partType === "new" && debouncedQuery) {
      hasSearched.current = true;
      doSearch(debouncedQuery, page);
    }
  }, [debouncedQuery, page, partType, doSearch]);

  const handleSearch = () => {
    setPage(0);
    doSearch(query, 0);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const [submitting, setSubmitting] = useState(false);

  const handleOrderNew = async (part: PartResult) => {
    if (submitting) return;
    if (!user) {
      toast.error("Pro objednávku se musíte přihlásit");
      navigate("/auth");
      return;
    }
    if (!canPlaceOrder) {
      toast.error("Váš účet zatím nebyl schválen.");
      return;
    }
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
    if (!query) {
      toast.error("Vyplňte název dílu");
      return;
    }
    if (!user) {
      toast.error("Pro poptávku se musíte přihlásit");
      navigate("/auth");
      return;
    }
    if (!canPlaceOrder) {
      toast.error("Váš účet zatím nebyl schválen.");
      return;
    }
    try {
      const { error } = await supabase.from("orders").insert({
        user_id: user.id,
        order_type: "used" as const,
        quantity: 1,
        part_name: query,
        customer_note: [
          brand && `Značka: ${brand}`,
          model && `Model: ${model}`,
          year && `Rok: ${year}`,
          motor && `Motor: ${motor}`,
          usedNote,
        ].filter(Boolean).join("\n"),
      });
      if (error) throw error;
      setUsedSubmitted(true);
      toast.success("Poptávka odeslána!");
    } catch (err: any) {
      toast.error(err.message || "Chyba při odesílání poptávky");
    }
  };

  const resetUsed = () => {
    setUsedSubmitted(false);
    setBrand("");
    setModel("");
    setYear("");
    setMotor("");
    setQuery("");
    setUsedNote("");
  };

  const calculateDiscountedPrice = (priceWithoutVat: number) => {
    const discounted = priceWithoutVat * (1 - discountPercent / 100);
    const withVat = discounted * 1.21;
    return { discounted: Math.round(discounted * 100) / 100, withVat: Math.round(withVat * 100) / 100 };
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold">Náhradní díly</h1>
        </motion.div>

        {/* Pending business warning */}
        {isPendingBusiness && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card px-4 py-3 border-l-4 border-yellow-500">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Váš firemní účet čeká na schválení. Zatím nelze vytvářet objednávky.
              </p>
            </div>
          </motion.div>
        )}

        {/* New / Used Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex rounded-xl bg-secondary p-1 gap-1"
        >
          <button
            onClick={() => { setPartType("new"); setResults(null); setUsedSubmitted(false); setPage(0); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
              partType === "new"
                ? "gradient-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Nový díl
          </button>
          <button
            onClick={() => { setPartType("used"); setResults(null); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
              partType === "used"
                ? "gradient-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Package className="w-4 h-4" />
            Použitý díl
          </button>
        </motion.div>

        {/* Info banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card px-4 py-3"
        >
          <p className="text-xs text-muted-foreground">
            {partType === "new"
              ? "Vyhledejte v katalogu originálních dílů. Ceny jsou zobrazeny ihned z katalogu."
              : "Vytvořte poptávku – náš tým ověří dostupnost a sdělí vám cenu. O výsledku vás budeme informovat."}
          </p>
        </motion.div>

        {/* Search form */}
        <AnimatePresence mode="wait">
          {partType === "used" && usedSubmitted ? (
            <motion.div
              key="submitted"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card p-6 flex flex-col items-center gap-4 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                <Send className="w-7 h-7 text-success" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg">Poptávka odeslána</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Ověříme dostupnost a ozveme se s cenou. Děkujeme!
                </p>
              </div>
              <Button variant="outline-primary" onClick={resetUsed}>
                Nová poptávka
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder={partType === "new" ? "Název dílu nebo OEM číslo..." : "Jaký díl hledáte?"}
                  className="pl-11 h-12 text-base rounded-xl"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                  onKeyDown={(e) => e.key === "Enter" && (partType === "new" ? handleSearch() : handleUsedSubmit())}
                />
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 gap-2">
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger className="h-10 text-xs"><SelectValue placeholder="Značka" /></SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="h-10 text-xs"><SelectValue placeholder="Rok" /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Model" className="h-10 text-xs" value={model} onChange={(e) => setModel(e.target.value)} />
                <Input placeholder="Motorizace" className="h-10 text-xs" value={motor} onChange={(e) => setMotor(e.target.value)} />
              </div>

              {/* Used part note */}
              {partType === "used" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                  <Textarea
                    placeholder="Poznámka k poptávce (volitelné)..."
                    className="text-xs"
                    rows={2}
                    value={usedNote}
                    onChange={(e) => setUsedNote(e.target.value)}
                  />
                </motion.div>
              )}

              <Button
                variant="hero"
                className="w-full h-11"
                onClick={partType === "new" ? handleSearch : handleUsedSubmit}
                disabled={searching || (partType === "used" && isPendingBusiness)}
              >
                {partType === "new" ? (
                  <>
                    <Search className="w-4 h-4" />
                    {searching ? "Hledám v katalogu..." : "Vyhledat v katalogu"}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Odeslat poptávku
                  </>
                )}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results – only for new parts */}
        {partType === "new" && searching && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-sm text-muted-foreground">Hledám v katalogu...</span>
          </div>
        )}

        {partType === "new" && !searching && results && results.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
            <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Žádné výsledky</p>
            <p className="text-xs text-muted-foreground mt-1">Zkuste upravit hledaný výraz</p>
          </motion.div>
        )}

        {partType === "new" && !searching && results && results.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-sm text-muted-foreground">
                {totalCount} {totalCount === 1 ? "výsledek" : "výsledků"}
              </h2>
              {totalPages > 1 && (
                <span className="text-xs text-muted-foreground">
                  Strana {page + 1} / {totalPages}
                </span>
              )}
            </div>

            {results.map((part, i) => {
              const discounted = discountPercent > 0 ? calculateDiscountedPrice(part.price_without_vat) : null;

              return (
                <motion.div
                  key={part.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold truncate">{part.name}</h3>
                      <p className="text-xs text-muted-foreground">OEM: {part.oem_number}</p>
                      {part.internal_code && (
                        <p className="text-xs text-muted-foreground">Kód: {part.internal_code}</p>
                      )}
                    </div>
                  </div>

                  {/* Pricing */}
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
                          {discounted.discounted.toLocaleString("cs")} Kč bez DPH / {discounted.withVat.toLocaleString("cs")} Kč s DPH
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="hero"
                      className="flex-1 text-xs"
                      onClick={() => handleOrderNew(part)}
                      disabled={isPendingBusiness || submitting}
                    >
                      <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                      Objednat nový
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-primary"
                      className="flex-1 text-xs"
                      onClick={async () => {
                        if (!user) { navigate("/auth"); return; }
                        if (!canPlaceOrder) { toast.error("Účet není schválen."); return; }
                        try {
                          await supabase.from("orders").insert({
                            user_id: user.id,
                            order_type: "used" as const,
                            quantity: 1,
                            part_name: part.name,
                            oem_number: part.oem_number,
                          });
                          toast.success("Poptávka na použitý díl odeslána!");
                        } catch (err: any) {
                          toast.error(err.message);
                        }
                      }}
                      disabled={isPendingBusiness || submitting}
                    >
                      <Package className="w-3.5 h-3.5 mr-1" />
                      Poptat použitý
                    </Button>
                  </div>
                </motion.div>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i;
                  } else if (page < 3) {
                    pageNum = i;
                  } else if (page > totalPages - 4) {
                    pageNum = totalPages - 5 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      size="sm"
                      variant={pageNum === page ? "default" : "outline"}
                      className="w-9 h-9 p-0"
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum + 1}
                    </Button>
                  );
                })}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Shop;
