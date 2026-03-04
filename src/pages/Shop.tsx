import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShoppingCart, Package, ArrowRight } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";

const brands = ["Chrysler", "Jeep", "Dodge", "RAM", "Fiat"];
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

const Shop = () => {
  const navigate = useNavigate();
  const { addItem, totalItems } = useCart();

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [motor, setMotor] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PartResult[] | null>(null);
  const [searching, setSearching] = useState(false);

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

  return (
    <div className="min-h-screen pb-20">
      <div className="p-4 space-y-5 max-w-lg mx-auto">
        {/* Hero search */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <h1 className="font-display text-2xl font-bold">Najděte svůj díl</h1>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Název dílu nebo OEM číslo..."
              className="pl-11 h-12 text-base rounded-xl"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>

          {/* Collapsible filters */}
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
            <Input placeholder="Motor" className="h-10 text-xs" value={motor} onChange={(e) => setMotor(e.target.value)} />
          </div>

          <Button variant="hero" className="w-full h-11" onClick={handleSearch} disabled={searching}>
            <Search className="w-4 h-4" />
            {searching ? "Hledám..." : "Vyhledat"}
          </Button>
        </motion.div>

        {/* Used part CTA */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={() => navigate("/parts/used")}
          className="w-full glass-card p-4 flex items-center gap-3 text-left hover:border-primary/50 transition-colors"
        >
          <Package className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-semibold">Hledáte použitý díl?</span>
            <p className="text-xs text-muted-foreground">Vytvořte poptávku – ozveme se s cenou</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </motion.button>

        {/* Results */}
        {results && (
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
