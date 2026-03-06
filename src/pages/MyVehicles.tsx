import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Car, Plus, Trash2, Edit, Search, Loader2, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type UserVehicle = {
  id: string;
  user_id: string;
  vin: string | null;
  brand: string;
  model: string;
  year: number | null;
  engine: string | null;
  license_plate: string | null;
  created_at: string;
};

type ServiceRecord = {
  id: string;
  vehicle_id: string;
  service_type: string;
  description: string | null;
  parts_used: string | null;
  price: number | null;
  mileage: number | null;
  service_date: string;
  created_at: string;
};

const MyVehicles = () => {
  const { user, profile, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<UserVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<UserVehicle | null>(null);
  const [vinLoading, setVinLoading] = useState(false);

  // History
  const [historyVehicle, setHistoryVehicle] = useState<UserVehicle | null>(null);
  const [serviceHistory, setServiceHistory] = useState<ServiceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form
  const [vin, setVin] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [engine, setEngine] = useState("");
  const [licensePlate, setLicensePlate] = useState("");

  const serviceHistoryEnabled = profile?.service_history_enabled ?? false;

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  const fetchVehicles = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("user_vehicles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setVehicles((data as UserVehicle[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchVehicles();
  }, [user]);

  const resetForm = () => {
    setVin("");
    setBrand("");
    setModel("");
    setYear("");
    setEngine("");
    setLicensePlate("");
    setEditVehicle(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (v: UserVehicle) => {
    setEditVehicle(v);
    setVin(v.vin || "");
    setBrand(v.brand);
    setModel(v.model);
    setYear(v.year?.toString() || "");
    setEngine(v.engine || "");
    setLicensePlate(v.license_plate || "");
    setDialogOpen(true);
  };

  const decodeVin = async () => {
    if (!vin || vin.length < 11) {
      toast({ title: "Zadejte platný VIN", variant: "destructive" });
      return;
    }
    setVinLoading(true);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${vin}?format=json`);
      const json = await res.json();
      const r = json.Results?.[0];
      if (r) {
        if (r.Make) setBrand(r.Make);
        if (r.Model) setModel(r.Model);
        if (r.ModelYear) setYear(r.ModelYear);
        const engineParts = [r.DisplacementL ? `${r.DisplacementL}L` : "", r.FuelTypePrimary || ""].filter(Boolean);
        if (engineParts.length) setEngine(engineParts.join(" "));
        toast({ title: "VIN dekódován" });
      }
    } catch {
      toast({ title: "Nepodařilo se dekódovat VIN", variant: "destructive" });
    }
    setVinLoading(false);
  };

  const save = async () => {
    if (!user || !brand || !model) {
      toast({ title: "Vyplňte značku a model", variant: "destructive" });
      return;
    }
    const payload = {
      user_id: user.id,
      vin: vin || null,
      brand,
      model,
      year: year ? parseInt(year) : null,
      engine: engine || null,
      license_plate: licensePlate || null,
    };

    if (editVehicle) {
      const { error } = await supabase.from("user_vehicles").update(payload).eq("id", editVehicle.id);
      if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Vozidlo upraveno" });
    } else {
      const { error } = await supabase.from("user_vehicles").insert(payload);
      if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Vozidlo přidáno" });
    }
    setDialogOpen(false);
    resetForm();
    fetchVehicles();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("user_vehicles").delete().eq("id", id);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Vozidlo odstraněno" });
    fetchVehicles();
  };

  const openHistory = async (v: UserVehicle) => {
    setHistoryVehicle(v);
    setHistoryLoading(true);
    const { data } = await supabase
      .from("service_history")
      .select("*")
      .eq("vehicle_id", v.id)
      .order("service_date", { ascending: false });
    setServiceHistory((data as ServiceRecord[]) || []);
    setHistoryLoading(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Moje vozidla" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Moje vozidla" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <Button onClick={openAdd} className="w-full">
          <Plus className="w-4 h-4 mr-2" />Přidat vozidlo
        </Button>

        {vehicles.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Car className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>Zatím nemáte žádné vozidlo</p>
          </div>
        )}

        {vehicles.map((v, i) => (
          <motion.div key={v.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-display font-semibold text-sm">{v.brand} {v.model}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {v.year && <Badge variant="outline" className="text-xs">{v.year}</Badge>}
                      {v.engine && <Badge variant="outline" className="text-xs">{v.engine}</Badge>}
                      {v.license_plate && <Badge variant="outline" className="text-xs">{v.license_plate}</Badge>}
                    </div>
                    {v.vin && <p className="text-[10px] text-muted-foreground mt-1">VIN: {v.vin}</p>}
                  </div>
                  <div className="flex gap-1">
                    {serviceHistoryEnabled && (
                      <Button size="icon" variant="ghost" onClick={() => openHistory(v)}>
                        <History className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => openEdit(v)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(v.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editVehicle ? "Upravit vozidlo" : "Přidat vozidlo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">VIN (volitelné)</label>
              <div className="flex gap-2">
                <Input value={vin} onChange={e => setVin(e.target.value)} placeholder="Zadejte VIN" />
                <Button variant="outline" onClick={decodeVin} disabled={vinLoading}>
                  {vinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Značka *</label>
              <Input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Chrysler" />
            </div>
            <div>
              <label className="text-sm font-medium">Model *</label>
              <Input value={model} onChange={e => setModel(e.target.value)} placeholder="300C" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium">Rok</label>
                <Input type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="2020" />
              </div>
              <div>
                <label className="text-sm font-medium">SPZ</label>
                <Input value={licensePlate} onChange={e => setLicensePlate(e.target.value)} placeholder="1A2 3456" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Motor</label>
              <Input value={engine} onChange={e => setEngine(e.target.value)} placeholder="3.6L V6" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Zrušit</Button>
            <Button onClick={save}>{editVehicle ? "Uložit" : "Přidat"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service History Dialog */}
      <Dialog open={!!historyVehicle} onOpenChange={() => setHistoryVehicle(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Servisní historie – {historyVehicle?.brand} {historyVehicle?.model}</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : serviceHistory.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Žádné servisní záznamy</p>
          ) : (
            <div className="space-y-3">
              {serviceHistory.map(s => (
                <Card key={s.id}>
                  <CardContent className="p-3 space-y-1">
                    <div className="flex justify-between items-start">
                      <p className="font-semibold text-sm">{s.service_type}</p>
                      <span className="text-xs text-muted-foreground">{new Date(s.service_date).toLocaleDateString("cs-CZ")}</span>
                    </div>
                    {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {s.mileage != null && <span>{s.mileage.toLocaleString("cs")} km</span>}
                      {s.price != null && <span className="font-medium text-foreground">{s.price.toLocaleString("cs")} Kč</span>}
                    </div>
                    {s.parts_used && <p className="text-[10px] text-muted-foreground">Díly: {s.parts_used}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyVehicles;
