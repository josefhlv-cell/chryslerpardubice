import { useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Wrench, Send, Loader2, Phone, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [serviceType, setServiceType] = useState("");
  const [date, setDate] = useState<Date>();
  const [note, setNote] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!serviceType || !date) {
      toast.error("Vyberte typ servisu a termín");
      return;
    }
    if (!user) {
      toast.error("Pro rezervaci se přihlaste");
      navigate("/auth");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("service_bookings").insert({
        user_id: user.id,
        service_type: serviceType,
        vehicle_brand: brand || null,
        vehicle_model: model || null,
        preferred_date: format(date, "yyyy-MM-dd"),
        note: note || null,
        wants_replacement_vehicle: false,
      });
      if (error) throw error;

      supabase.functions.invoke("notify-admin", {
        body: {
          type: "service_booking",
          record: {
            title: "🔧 Nová rezervace servisu",
            message: `${brand || "?"} ${model || "?"} – ${serviceType}, termín: ${format(date, "d.M.yyyy")}`,
          },
        },
      }).catch(() => {});

      setSubmitted(true);
      toast.success("Rezervace servisu odeslána!");
    } catch (err: any) {
      toast.error(err.message || "Chyba při odesílání rezervace");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setServiceType("");
    setDate(undefined);
    setNote("");
    setBrand("");
    setModel("");
    setYear("");
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Servis" subtitle="Rezervace termínu" />
        <div className="p-4 max-w-lg mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="luxury-card p-8 text-center space-y-4"
          >
            <div className="w-16 h-16 rounded-full gradient-bronze mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
            <h2 className="font-display font-bold text-xl">Rezervace odeslána</h2>
            <p className="text-sm text-muted-foreground">
              Potvrdíme dostupný termín a odhadovanou cenu. Sledujte stav v notifikacích.
            </p>
            <div className="pt-2 space-y-2">
              <Button variant="hero" className="w-full" onClick={() => navigate("/my-service-orders")}>
                Sledovat zakázky
              </Button>
              <Button variant="outline" className="w-full" onClick={resetForm}>
                Nová rezervace
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Servis" subtitle="Rezervace termínu" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Info banner */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="luxury-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-bronze flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-display font-semibold">Autorizovaný servis</p>
              <p className="text-xs text-muted-foreground">
                Chrysler · Dodge · Jeep · RAM
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Po–Pá</span>
            </div>
          </div>
        </motion.div>

        {/* Form */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
          {/* Vehicle info */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Značka vozu</Label>
              <Input placeholder="Chrysler" value={brand} onChange={(e) => setBrand(e.target.value)} className="focus-gold" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Model</Label>
              <Input placeholder="300C" value={model} onChange={(e) => setModel(e.target.value)} className="focus-gold" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Rok výroby</Label>
              <Input placeholder="2018" value={year} onChange={(e) => setYear(e.target.value)} type="number" min="1990" max="2030" className="focus-gold" />
            </div>
          </div>

          {/* Service type */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Typ servisu *</Label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger className="focus-gold"><SelectValue placeholder="Vyberte typ servisu" /></SelectTrigger>
              <SelectContent>
                {serviceTypes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Date picker */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Preferovaný termín *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal focus-gold", !date && "text-muted-foreground")}>
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

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Poznámka</Label>
            <Textarea placeholder="Popište problém nebo požadavek..." value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="focus-gold" />
          </div>

          {/* Info note */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
            Děkujeme za vaši důvěru! Termín, který zadáváte do kalendáře, je zatím orientační. Brzy vás kontaktujeme, abychom ho společně potvrdili.
          </div>

          {/* Submit */}
          <Button variant="hero" className="w-full h-12 mt-2 text-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Phone className="w-4 h-4 mr-2" />}
            {submitting ? "Odesílám..." : "Odeslat rezervaci"}
          </Button>
        </motion.div>

        {/* Quick contact */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <div className="text-center pt-2">
            <p className="text-[11px] text-muted-foreground">
              Preferujete telefonicky? Volejte{" "}
              <a href="tel:+420603372911" className="text-primary hover:underline font-medium">+420 603 372 911</a>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Service;
