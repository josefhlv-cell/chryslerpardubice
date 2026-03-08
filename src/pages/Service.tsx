import { useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Wrench, Send } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const serviceTypes = [
  "Výměna oleje a filtrů",
  "Brzdový servis",
  "Diagnostika",
  "Klimatizace",
  "Geometrie",
  "Výfukový systém",
  "Převodovka",
  "Motor – generální oprava",
  "STK příprava",
  "Jiné",
];

const Service = () => {
  const [serviceType, setServiceType] = useState("");
  const [date, setDate] = useState<Date>();
  const [note, setNote] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");

  const handleSubmit = () => {
    if (!serviceType || !date) {
      toast.error("Vyberte typ servisu a termín");
      return;
    }
    toast.success("Rezervace servisu odeslána! Potvrdíme termín a cenu.");
    setServiceType("");
    setDate(undefined);
    setNote("");
    setBrand("");
    setModel("");
    setYear("");
  };

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Servis" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass-card p-4 flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5 text-primary-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Zarezervujte si termín servisu. Po odeslání potvrdíme dostupnost a cenu.
            </p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Značka vozu</Label>
              <Input placeholder="např. Chrysler" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Model</Label>
              <Input placeholder="např. 300C" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Rok výroby</Label>
              <Input placeholder="např. 2018" value={year} onChange={(e) => setYear(e.target.value)} type="number" min="1990" max="2030" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Typ servisu *</Label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger><SelectValue placeholder="Vyberte typ servisu" /></SelectTrigger>
              <SelectContent>
                {serviceTypes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Preferovaný termín *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {date ? format(date, "PPP", { locale: cs }) : "Vyberte datum"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(d) => d < new Date()}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Poznámka</Label>
            <Textarea placeholder="Popište problém nebo požadavek..." value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>


          <Button variant="hero" className="w-full h-11 mt-2" onClick={handleSubmit}>
            <Send className="w-4 h-4" />
            Odeslat rezervaci
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default Service;
