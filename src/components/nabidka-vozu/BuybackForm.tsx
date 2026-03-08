import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Car, Send, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/contexts/AuthContext";
import { createBuybackRequest } from "@/lib/buyImportAPI";
import { toast } from "@/hooks/use-toast";
import CarIcon from "@/components/CarIcon";

const schema = z.object({
  brand: z.string().min(1, "Vyberte značku"),
  model: z.string().min(1, "Zadejte model").max(100),
  year: z.coerce.number().min(1990, "Min. rok 1990").max(new Date().getFullYear() + 1),
  condition: z.string().min(1, "Vyberte stav"),
  mileage: z.coerce.number().min(0, "Zadejte nájezd km"),
  vin: z.string().max(17).optional().or(z.literal("")),
  note: z.string().max(1000).optional().or(z.literal("")),
  name: z.string().min(1, "Zadejte jméno").max(100),
  email: z.string().email("Neplatný e-mail").max(255),
  phone: z.string().min(9, "Zadejte telefon").max(20),
});

type FormValues = z.infer<typeof schema>;

const conditions = [
  { value: "excellent", label: "Výborný" },
  { value: "good", label: "Dobrý" },
  { value: "fair", label: "Uspokojivý" },
  { value: "poor", label: "Špatný" },
  { value: "damaged", label: "Havarovaný" },
];

const brands = ["Chrysler", "Dodge", "Jeep", "RAM", "Fiat", "Alfa Romeo", "Jiná"];

const BuybackForm = () => {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { brand: "", model: "", year: new Date().getFullYear(), condition: "", mileage: 0, vin: "", note: "", name: "", email: "", phone: "" },
  });

  const watchBrand = form.watch("brand");
  const watchModel = form.watch("model");
  const watchYear = form.watch("year");

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      await createBuybackRequest({ ...values, user_id: user?.id, vin: values.vin || undefined, note: values.note || undefined });
      setSubmitted(true);
      toast({ title: "Odesláno ✓", description: "Váš požadavek na výkup byl přijat. Ozveme se vám." });
    } catch {
      toast({ title: "Chyba", description: "Nepodařilo se odeslat. Zkuste to znovu.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-4 py-12 text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <h3 className="text-xl font-bold text-foreground">Požadavek odeslán!</h3>
        <p className="text-muted-foreground max-w-sm">Váš požadavek na výkup vozu byl úspěšně přijat. Budeme vás kontaktovat s nabídkou.</p>
        <Button variant="outline" onClick={() => { setSubmitted(false); form.reset(); }}>Odeslat další</Button>
      </motion.div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {watchBrand && watchModel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-2">
            <CarIcon car={{ brand: watchBrand, model: watchModel, year: watchYear }} size="lg" />
          </motion.div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="brand" render={({ field }) => (
            <FormItem>
              <FormLabel>Značka *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Vyberte" /></SelectTrigger></FormControl>
                <SelectContent>{brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="model" render={({ field }) => (
            <FormItem><FormLabel>Model *</FormLabel><FormControl><Input placeholder="např. Grand Caravan" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="year" render={({ field }) => (
            <FormItem><FormLabel>Rok *</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="mileage" render={({ field }) => (
            <FormItem><FormLabel>Nájezd km *</FormLabel><FormControl><Input type="number" placeholder="150000" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="condition" render={({ field }) => (
            <FormItem>
              <FormLabel>Stav *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Stav" /></SelectTrigger></FormControl>
                <SelectContent>{conditions.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="vin" render={({ field }) => (
          <FormItem><FormLabel>VIN (volitelné)</FormLabel><FormControl><Input placeholder="např. 2C4RC1BG..." maxLength={17} {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <FormField control={form.control} name="note" render={({ field }) => (
          <FormItem><FormLabel>Poznámka</FormLabel><FormControl><Textarea placeholder="Další informace o vozidle..." rows={3} {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <div className="border-t border-border pt-4 mt-4">
          <p className="text-sm font-medium text-muted-foreground mb-3">Kontaktní údaje</p>
          <div className="grid grid-cols-1 gap-3">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Jméno *</FormLabel><FormControl><Input placeholder="Jan Novák" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>E-mail *</FormLabel><FormControl><Input type="email" placeholder="jan@email.cz" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Telefon *</FormLabel><FormControl><Input placeholder="+420..." {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          <Send className="w-4 h-4 mr-2" />
          {loading ? "Odesílám..." : "Odeslat požadavek na výkup"}
        </Button>
      </form>
    </Form>
  );
};

export default BuybackForm;
