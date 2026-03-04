import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShoppingCart, Package, Send, Sparkles } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";

const brands = ["Chrysler", "Jeep", "Dodge", "RAM", "Fiat", "Lancia"];
const years = Array.from({ length: 30 }, (_, i) => (2025 - i).toString());

interface PartResult {
  id: string;
  name: string;
  oem: string;
  price: number;
  available: boolean;
}

const mockResults: PartResult[] = [
  { id: "p1", name: "Brzdové destičky přední", oem: "68225170AA", price: 2450, available: true },
  { id: "p2", name: "Olejový filtr", oem: "68191349AC", price: 380, available: true },
  { id: "p3", name: "Vzduchový filtr", oem: "04861756AA", price: 650, available: false },
  { id: "p4", name: "Řemen rozvodu", oem: "68258275AA", price: 1200, available: true },
  { id: "p5", name: "Zapalovací svíčky sada", oem: "SPLZFR5C11", price: 890, available: true },
];

type PartType = "new" | "used";

const Shop = () => {
  const navigate = useNavigate();
  const { addItem, totalItems } = useCart();

  const [partType, setPartType] = useState<PartType>("new");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [motor, setMotor] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PartResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Used part request
  const [usedNote, setUsedNote] = useState("");
  const [usedSubmitted, setUsedSubmitted] = useState(false);

  const handleSearch = () => {
    if (!query && !brand) {
      toast.error("Zadejte název dílu nebo vyberte značku");
      return;
    }
    setSearching(true);
    setTimeout(() => {
      const filtered = query
        ? mockResults.filter(
            (p) =>
              p.name.toLowerCase().includes(query.toLowerCase()) ||
              p.oem.toLowerCase().includes(query.toLowerCase())
          )
        : mockResults;
      setResults(filtered);
      setSearching(false);
    }, 600);
  };

  const handleAdd = (part: PartResult) => {
    addItem({ id: part.id, name: part.name, oem: part.oem, price: part.price, type: "new", brand });
    toast.success(`${part.name} přidán do košíku`);
  };

  const handleUsedSubmit = () => {
    if (!brand || !query) {
      toast.error("Vyplňte značku a název dílu");
      return;
    }
    setUsedSubmitted(true);
    toast.success("Poptávka odeslána! Ozveme se vám s cenou a dostupností.");
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

  return (
    <div className="min-h-screen pb-20">
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold">Náhradní díly</h1>
        </motion.div>

        {/* New / Used Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex rounded-xl bg-secondary p-1 gap-1"
        >
          <button
            onClick={() => { setPartType("new"); setResults(null); setUsedSubmitted(false); }}
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

        {/* Search form – same for both */}
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
                  onChange={(e) => setQuery(e.target.value)}
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
                disabled={searching}
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
        {partType === "new" && results && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-sm text-muted-foreground">
                {results.length} {results.length === 1 ? "výsledek" : "výsledků"}
              </h2>
              {totalItems > 0 && (
                <Button size="sm" variant="outline-primary" onClick={() => navigate("/cart")}>
                  <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                  Košík ({totalItems})
                </Button>
              )}
            </div>

            {results.map((part, i) => (
              <motion.div
                key={part.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card p-4 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate">{part.name}</h3>
                  <p className="text-xs text-muted-foreground">OEM: {part.oem}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-base font-display font-bold text-gradient">{part.price.toLocaleString("cs")} Kč</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${part.available ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                      {part.available ? "Skladem" : "Na obj."}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={part.available ? "hero" : "secondary"}
                  onClick={() => handleAdd(part)}
                  disabled={!part.available}
                  className="shrink-0"
                >
                  <ShoppingCart className="w-4 h-4" />
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Shop;
