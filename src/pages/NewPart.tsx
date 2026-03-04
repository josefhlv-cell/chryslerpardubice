import { useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Search } from "lucide-react";
import { toast } from "sonner";

const brands = ["Chrysler", "Jeep", "Dodge", "RAM", "Fiat"];
const years = Array.from({ length: 30 }, (_, i) => (2025 - i).toString());

interface PartResult {
  name: string;
  oem: string;
  price: number;
  available: boolean;
}

const mockResults: PartResult[] = [
  { name: "Brzdové destičky přední", oem: "68225170AA", price: 2450, available: true },
  { name: "Olejový filtr", oem: "68191349AC", price: 380, available: true },
  { name: "Vzduchový filtr", oem: "04861756AA", price: 650, available: false },
];

const NewPart = () => {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [motor, setMotor] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PartResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = () => {
    if (!brand || !query) {
      toast.error("Vyplňte značku a název/OEM dílu");
      return;
    }
    setSearching(true);
    setTimeout(() => {
      setResults(mockResults);
      setSearching(false);
    }, 800);
  };

  const handleAddToCart = (part: PartResult) => {
    toast.success(`${part.name} přidán do košíku`);
  };

  const handleOrder = (part: PartResult) => {
    toast.success(`Objednávka ${part.name} odeslána`);
  };

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Nový díl" showBack />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Značka</Label>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger><SelectValue placeholder="Vyberte" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Rok</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue placeholder="Vyberte" /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Model</Label>
            <Input placeholder="např. 300C, Grand Cherokee..." value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Motorizace</Label>
            <Input placeholder="např. 3.0 CRD, 6.4 HEMI..." value={motor} onChange={(e) => setMotor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Název nebo OEM číslo dílu</Label>
            <Input placeholder="např. brzdové destičky, 68225170AA" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Button variant="hero" className="w-full h-11" onClick={handleSearch} disabled={searching}>
            <Search className="w-4 h-4" />
            {searching ? "Hledám..." : "Vyhledat díl"}
          </Button>
        </motion.div>

        {results && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 mt-6">
            <h3 className="font-display font-semibold text-sm text-muted-foreground">Nalezené díly ({results.length})</h3>
            {results.map((part, i) => (
              <motion.div
                key={part.oem}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="glass-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-sm">{part.name}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">OEM: {part.oem}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${part.available ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                    {part.available ? "Skladem" : "Na objednávku"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-display font-bold text-gradient">{part.price.toLocaleString("cs")} Kč</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleAddToCart(part)} disabled={!part.available}>
                      <ShoppingCart className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="hero" onClick={() => handleOrder(part)}>
                      Objednat
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default NewPart;
