import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { ArrowDownUp, Plane, RefreshCw } from "lucide-react";
import CarIcon from "@/components/CarIcon";

type BuybackRow = {
  id: string;
  brand: string;
  model: string;
  year: number;
  condition: string;
  mileage: number;
  vin: string | null;
  note: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

type ImportRow = {
  id: string;
  brand: string;
  model: string;
  year_from: number | null;
  year_to: number | null;
  budget_from: number | null;
  budget_to: number | null;
  fuel: string | null;
  transmission: string | null;
  color: string | null;
  extras: string | null;
  note: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

const statusColors: Record<string, string> = {
  new: "bg-yellow-100 text-yellow-800 border-yellow-300",
  contacted: "bg-blue-100 text-blue-800 border-blue-300",
  offer_sent: "bg-purple-100 text-purple-800 border-purple-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const statusLabel: Record<string, string> = {
  new: "Nový",
  contacted: "Kontaktován",
  offer_sent: "Nabídka odeslána",
  completed: "Dokončeno",
  cancelled: "Zrušeno",
};

const conditionLabel: Record<string, string> = {
  excellent: "Výborný",
  good: "Dobrý",
  fair: "Uspokojivý",
  poor: "Špatný",
  damaged: "Havarovaný",
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString("cs-CZ");

const AdminVehicleOffers = () => {
  const [buybacks, setBuybacks] = useState<BuybackRow[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBuyback, setEditBuyback] = useState<BuybackRow | null>(null);
  const [editImport, setEditImport] = useState<ImportRow | null>(null);
  const [formStatus, setFormStatus] = useState("");
  const [formNote, setFormNote] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [bRes, iRes] = await Promise.all([
      supabase.from("vehicle_buyback_requests" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("vehicle_import_requests" as any).select("*").order("created_at", { ascending: false }),
    ]);
    setBuybacks((bRes.data as BuybackRow[]) || []);
    setImports((iRes.data as ImportRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openBuybackEdit = (b: BuybackRow) => {
    setEditBuyback(b);
    setFormStatus(b.status);
    setFormNote(b.admin_note || "");
  };

  const saveBuyback = async () => {
    if (!editBuyback) return;
    const { error } = await supabase
      .from("vehicle_buyback_requests" as any)
      .update({ status: formStatus, admin_note: formNote } as any)
      .eq("id", editBuyback.id);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Uloženo" });
    setEditBuyback(null);
    fetchData();
  };

  const openImportEdit = (i: ImportRow) => {
    setEditImport(i);
    setFormStatus(i.status);
    setFormNote(i.admin_note || "");
  };

  const saveImport = async () => {
    if (!editImport) return;
    const { error } = await supabase
      .from("vehicle_import_requests" as any)
      .update({ status: formStatus, admin_note: formNote } as any)
      .eq("id", editImport.id);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Uloženo" });
    setEditImport(null);
    fetchData();
  };

  if (loading) {
    return <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Správa požadavků na výkup a individuální dovoz</p>
        <Button size="sm" variant="outline" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-1" />Obnovit</Button>
      </div>

      <Tabs defaultValue="buyback">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="buyback" className="gap-1 text-xs">
            <ArrowDownUp className="w-3 h-3" />
            Výkup ({buybacks.length})
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1 text-xs">
            <Plane className="w-3 h-3" />
            Dovoz ({imports.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buyback" className="mt-3 space-y-3">
          {buybacks.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Žádné požadavky na výkup</p>}
          {buybacks.map((b) => (
            <motion.div key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => openBuybackEdit(b)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <CarIcon car={{ brand: b.brand, model: b.model, year: b.year }} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{b.brand} {b.model} ({b.year})</p>
                        <Badge className={statusColors[b.status] || ""}>{statusLabel[b.status] || b.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Stav: {conditionLabel[b.condition] || b.condition} · {b.mileage.toLocaleString("cs")} km
                        {b.vin && ` · VIN: ${b.vin}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {b.name} · {b.email} · {b.phone}
                      </p>
                      {b.note && <p className="text-xs text-muted-foreground italic mt-1">"{b.note}"</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{fmtDate(b.created_at)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="import" className="mt-3 space-y-3">
          {imports.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Žádné požadavky na dovoz</p>}
          {imports.map((i) => (
            <motion.div key={i.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => openImportEdit(i)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <CarIcon car={{ brand: i.brand, model: i.model }} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{i.brand} {i.model}</p>
                        <Badge className={statusColors[i.status] || ""}>{statusLabel[i.status] || i.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {i.year_from && i.year_to ? `${i.year_from}–${i.year_to}` : i.year_from || i.year_to || "—"}
                        {i.budget_from || i.budget_to ? ` · ${(i.budget_from || 0).toLocaleString("cs")}–${(i.budget_to || 0).toLocaleString("cs")} Kč` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[i.fuel, i.transmission, i.color].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {i.name} · {i.email} · {i.phone}
                      </p>
                      {i.extras && <p className="text-xs text-muted-foreground italic mt-1">Výbava: {i.extras}</p>}
                      {i.note && <p className="text-xs text-muted-foreground italic">"{i.note}"</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{fmtDate(i.created_at)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Buyback edit dialog */}
      <Dialog open={!!editBuyback} onOpenChange={() => setEditBuyback(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Výkup – {editBuyback?.brand} {editBuyback?.model}</DialogTitle></DialogHeader>
          {editBuyback && (
            <div className="space-y-3">
              <div className="space-y-1 text-sm">
                <p><span className="font-medium">Rok:</span> {editBuyback.year}</p>
                <p><span className="font-medium">Stav:</span> {conditionLabel[editBuyback.condition] || editBuyback.condition}</p>
                <p><span className="font-medium">Nájezd:</span> {editBuyback.mileage.toLocaleString("cs")} km</p>
                {editBuyback.vin && <p><span className="font-medium">VIN:</span> {editBuyback.vin}</p>}
                <p><span className="font-medium">Kontakt:</span> {editBuyback.name} · {editBuyback.email} · {editBuyback.phone}</p>
                {editBuyback.note && <p><span className="font-medium">Poznámka:</span> {editBuyback.note}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Poznámka admina</label>
                <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Interní poznámka..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBuyback(null)}>Zrušit</Button>
            <Button onClick={saveBuyback}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import edit dialog */}
      <Dialog open={!!editImport} onOpenChange={() => setEditImport(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dovoz – {editImport?.brand} {editImport?.model}</DialogTitle></DialogHeader>
          {editImport && (
            <div className="space-y-3">
              <div className="space-y-1 text-sm">
                {editImport.year_from && <p><span className="font-medium">Rok:</span> {editImport.year_from}–{editImport.year_to}</p>}
                {(editImport.budget_from || editImport.budget_to) && (
                  <p><span className="font-medium">Rozpočet:</span> {(editImport.budget_from || 0).toLocaleString("cs")}–{(editImport.budget_to || 0).toLocaleString("cs")} Kč</p>
                )}
                {editImport.fuel && <p><span className="font-medium">Palivo:</span> {editImport.fuel}</p>}
                {editImport.transmission && <p><span className="font-medium">Převodovka:</span> {editImport.transmission}</p>}
                {editImport.color && <p><span className="font-medium">Barva:</span> {editImport.color}</p>}
                {editImport.extras && <p><span className="font-medium">Výbava:</span> {editImport.extras}</p>}
                <p><span className="font-medium">Kontakt:</span> {editImport.name} · {editImport.email} · {editImport.phone}</p>
                {editImport.note && <p><span className="font-medium">Poznámka:</span> {editImport.note}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Poznámka admina</label>
                <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Interní poznámka..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditImport(null)}>Zrušit</Button>
            <Button onClick={saveImport}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminVehicleOffers;
