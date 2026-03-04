import { useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send } from "lucide-react";
import { toast } from "sonner";

const brands = ["Chrysler", "Jeep", "Dodge", "RAM", "Fiat"];

const UsedPart = () => {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [partName, setPartName] = useState("");
  const [note, setNote] = useState("");

  const handleSubmit = () => {
    if (!brand || !partName) {
      toast.error("Vyplňte značku a název dílu");
      return;
    }
    toast.success("Poptávka odeslána! Budeme vás kontaktovat.");
    setBrand("");
    setModel("");
    setYear("");
    setPartName("");
    setNote("");
  };

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Použitý díl" showBack />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass-card p-4 mb-4">
            <p className="text-sm text-muted-foreground">
              Vytvořte poptávku na použitý díl. Náš tým ověří dostupnost a sdělí vám cenu.
              O výsledku budete informováni notifikací.
            </p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Značka *</Label>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger><SelectValue placeholder="Vyberte značku" /></SelectTrigger>
              <SelectContent>
                {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Model</Label>
              <Input placeholder="např. 300C" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Rok výroby</Label>
              <Input placeholder="např. 2018" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Název dílu *</Label>
            <Input placeholder="např. alternátor, startér..." value={partName} onChange={(e) => setPartName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Poznámka</Label>
            <Textarea placeholder="Další informace k poptávce..." value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <Button variant="hero" className="w-full h-11 mt-2" onClick={handleSubmit}>
            <Send className="w-4 h-4" />
            Odeslat poptávku
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default UsedPart;
