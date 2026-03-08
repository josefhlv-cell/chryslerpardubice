import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Plane, Send, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/contexts/AuthContext";
import { createImportRequest } from "@/lib/buyImportAPI";
import { toast } from "@/hooks/use-toast";
import CarIcon from "@/components/CarIcon";

const schema = z.object({
  brand: z.string().min(1, "Vyberte značku"),
  model: z.string().min(1, "Zadejte model").max(100),
  year_from: z.coerce.number().min(1990).optional().or(z.literal(0)),
  year_to: z.coerce.number().max(new Date().getFullYear() + 2).optional().or(z.literal(0)),
  budget_from: z.coerce.number().min(0).optional().or(z.literal(0)),
  budget_to: z.coerce.number().min(0).optional().or(z.literal(0)),
  fuel: z.string().optional().or(z.literal("")),
  transmission: z.string().optional().or(z.literal("")),
  color: z.string().max(50).optional().or(z.literal("")),
  extras: z.string().max(500).optional().or(z.literal("")),
  note: z.string().max(1000).optional().or(z.literal("")),
  name: z.string().min(1, "Zadejte jméno").max(100),
  email: z.string().email("Neplatný e-mail").max(255),
  phone: z.string().min(9, "Zadejte telefon").max(20),
});

type FormValues = z.infer<typeof schema>;

const brands = ["Chrysler", "Dodge", "Jeep", "RAM", "Fiat", "Alfa Romeo", "Jiná"];

const ImportForm = () => {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { brand: "", model: "", year_from: 0, year_to: 0, budget_from: 0, budget_to: 0, fuel: "", transmission: "", color: "", extras: "", note: "", name: "", email: "", phone: "" },
  });

  const watchBrand = form.watch("brand");
  const watchModel = form.watch("model");

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const clean = {
        ...values,
        user_id: user?.id,
        year_from: values.year_from || undefined,
        year_to: values.year_to || undefined,
        budget_from: values.budget_from || undefined,
        budget_to: values.budget_to || undefined,
        fuel: values.fuel || undefined,
        transmission: values.transmission || undefined,
        color: values.color || undefined,
        extras: values.extras || undefined,
        note: values.note || undefined,
      };
      await createImportRequest(clean);
      setSubmitted(true);
      toast({ title: "Odesláno ✓", description: "Váš požadavek na dovoz byl přijat." });
    } catch {
      toast({ title: "Chyba", description: "Nepodařilo se odeslat.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-4 py-12 text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <h3 className="text-xl font-bold text-foreground">Požadavek odeslán!</h3>
        <p className="text-muted-foreground max-w-sm">Budeme hledat váš vysněný vůz. Ozveme se s nabídkou.</p>
        <Button variant="outline" onClick={() => { setSubmitted(false); form.reset(); }}>Odeslat další</Button>
      </motion.div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {watchBrand && watchModel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-2">
            <CarIcon car={{ brand: watchBrand, model: watchModel }} size="lg" />
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
            <FormItem><FormLabel>Model *</FormLabel><FormControl><Input placeholder="např. Durango" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="year_from" render={({ field }) => (
            <FormItem><FormLabel>Rok od</FormLabel><FormControl><Input type="number" placeholder="2018" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="year_to" render={({ field }) => (
            <FormItem><FormLabel>Rok do</FormLabel><FormControl><Input type="number" placeholder="2024" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="budget_from" render={({ field }) => (
            <FormItem><FormLabel>Rozpočet od (Kč)</FormLabel><FormControl><Input type="number" placeholder="500000" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="budget_to" render={({ field }) => (
            <FormItem><FormLabel>Rozpočet do (Kč)</FormLabel><FormControl><Input type="number" placeholder="1500000" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="fuel" render={({ field }) => (
            <FormItem>
              <FormLabel>Palivo</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="benzin">Benzín</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="elektro">Elektro</SelectItem>
                  <SelectItem value="lpg">LPG</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="transmission" render={({ field }) => (
            <FormItem>
              <FormLabel>Převodovka</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="automatic">Automat</SelectItem>
                  <SelectItem value="manual">Manuál</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="color" render={({ field }) => (
            <FormItem><FormLabel>Barva</FormLabel><FormControl><Input placeholder="Černá" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>

        <FormField control={form.control} name="extras" render={({ field }) => (
          <FormItem><FormLabel>Výbava / doplňky</FormLabel><FormControl><Textarea placeholder="Kožené sedačky, navigace, tažné..." rows={2} {...field} /></FormControl><FormMessage /></FormItem>
        )} />

        <FormField control={form.control} name="note" render={({ field }) => (
          <FormItem><FormLabel>Další poznámka</FormLabel><FormControl><Textarea placeholder="Cokoliv dalšího..." rows={2} {...field} /></FormControl><FormMessage /></FormItem>
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
          <Plane className="w-4 h-4 mr-2" />
          {loading ? "Odesílám..." : "Odeslat požadavek na dovoz"}
        </Button>
      </form>
    </Form>
  );
};

export default ImportForm;
