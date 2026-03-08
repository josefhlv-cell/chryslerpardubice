import { useState, useEffect, useRef } from "react";
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
import { Car, Plus, Trash2, Edit, Search, Loader2, History, Camera, ImagePlus, Gauge, FileText, BookOpen, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import CarIcon from "@/components/CarIcon";
import VINDetailPanel from "@/components/VINDetailPanel";
import type { VINDecodeResult } from "@/api/partsAPI";

type UserVehicle = {
  id: string;
  user_id: string;
  vin: string | null;
  brand: string;
  model: string;
  year: number | null;
  engine: string | null;
  license_plate: string | null;
  current_mileage: number | null;
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
  photos: string[] | null;
};

const MyVehicles = () => {
  const { user, profile, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<UserVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<UserVehicle | null>(null);
  const [vinLoading, setVinLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const spzFileInputRef = useRef<HTMLInputElement>(null);

  // History
  const [historyVehicle, setHistoryVehicle] = useState<UserVehicle | null>(null);
  const [serviceHistory, setServiceHistory] = useState<ServiceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Mileage dialog
  const [mileageVehicle, setMileageVehicle] = useState<UserVehicle | null>(null);
  const [mileageInput, setMileageInput] = useState("");

  // Form
  const [vin, setVin] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [engine, setEngine] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [currentMileage, setCurrentMileage] = useState("");
  const [vinDecodeResult, setVinDecodeResult] = useState<VINDecodeResult | null>(null);

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
    setVin(""); setBrand(""); setModel(""); setYear(""); setEngine(""); setLicensePlate(""); setCurrentMileage("");
    setEditVehicle(null);
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (v: UserVehicle) => {
    setEditVehicle(v);
    setVin(v.vin || ""); setBrand(v.brand); setModel(v.model);
    setYear(v.year?.toString() || ""); setEngine(v.engine || "");
    setLicensePlate(v.license_plate || ""); setCurrentMileage(v.current_mileage?.toString() || "");
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

  // OCR VIN from photo
  const handleVinPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `ocr/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("fault-photos").upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("fault-photos").getPublicUrl(path);

      const { data, error } = await supabase.functions.invoke("vin-ocr", {
        body: { imageUrl: urlData.publicUrl, type: "vin" },
      });
      if (error) throw error;
      if (data?.vin) {
        setVin(data.vin);
        toast({ title: "VIN rozpoznán z fotografie", description: data.vin });
        // Auto-decode
        setVinLoading(true);
        const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${data.vin}?format=json`);
        const json = await res.json();
        const r = json.Results?.[0];
        if (r) {
          if (r.Make) setBrand(r.Make);
          if (r.Model) setModel(r.Model);
          if (r.ModelYear) setYear(r.ModelYear);
          const ep = [r.DisplacementL ? `${r.DisplacementL}L` : "", r.FuelTypePrimary || ""].filter(Boolean);
          if (ep.length) setEngine(ep.join(" "));
        }
        setVinLoading(false);
      } else {
        toast({ title: "VIN nebyl rozpoznán", description: data?.error || "Zkuste lepší fotku", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Chyba OCR", description: err.message, variant: "destructive" });
    }
    setOcrLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // OCR SPZ from photo
  const handleSpzPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `ocr/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("fault-photos").upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("fault-photos").getPublicUrl(path);

      const { data, error } = await supabase.functions.invoke("vin-ocr", {
        body: { imageUrl: urlData.publicUrl, type: "spz" },
      });
      if (error) throw error;
      if (data?.spz) {
        setLicensePlate(data.spz);
        toast({ title: "SPZ rozpoznána", description: data.spz });
      } else {
        toast({ title: "SPZ nebyla rozpoznána", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Chyba OCR", description: err.message, variant: "destructive" });
    }
    setOcrLoading(false);
    if (spzFileInputRef.current) spzFileInputRef.current.value = "";
  };

  const save = async () => {
    if (!user || !brand || !model) {
      toast({ title: "Vyplňte značku a model", variant: "destructive" });
      return;
    }
    const payload: any = {
      user_id: user.id,
      vin: vin || null,
      brand, model,
      year: year ? parseInt(year) : null,
      engine: engine || null,
      license_plate: licensePlate || null,
      current_mileage: currentMileage ? parseInt(currentMileage) : null,
    };

    if (editVehicle) {
      const { error } = await supabase.from("user_vehicles").update(payload).eq("id", editVehicle.id);
      if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
      // Log mileage change
      if (currentMileage && parseInt(currentMileage) !== editVehicle.current_mileage) {
        await supabase.from("mileage_history" as any).insert({
          vehicle_id: editVehicle.id, user_id: user.id, mileage: parseInt(currentMileage), source: "user",
        } as any);
      }
      toast({ title: "Vozidlo upraveno" });
    } else {
      const { data: newV, error } = await supabase.from("user_vehicles").insert(payload).select().single();
      if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
      // Log initial mileage
      if (currentMileage && newV) {
        await supabase.from("mileage_history" as any).insert({
          vehicle_id: (newV as any).id, user_id: user.id, mileage: parseInt(currentMileage), source: "user",
        } as any);
      }
      // Notify admin about new vehicle
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "🚗 Nové vozidlo přidáno",
        message: `${brand} ${model} ${year || ""} ${vin ? `(VIN: ${vin})` : ""}`,
      });
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

  const updateMileage = async () => {
    if (!user || !mileageVehicle || !mileageInput) return;
    const km = parseInt(mileageInput);
    await supabase.from("user_vehicles").update({ current_mileage: km } as any).eq("id", mileageVehicle.id);
    await supabase.from("mileage_history" as any).insert({
      vehicle_id: mileageVehicle.id, user_id: user.id, mileage: km, source: "user",
    } as any);
    toast({ title: "Kilometry aktualizovány" });
    setMileageVehicle(null);
    setMileageInput("");
    fetchVehicles();
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
                <div className="flex items-start gap-3">
                  <CarIcon car={v} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                  <div>
                    <p className="font-display font-semibold text-sm">{v.brand} {v.model}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {v.year && <Badge variant="outline" className="text-xs">{v.year}</Badge>}
                      {v.engine && <Badge variant="outline" className="text-xs">{v.engine}</Badge>}
                      {v.license_plate && <Badge variant="outline" className="text-xs">{v.license_plate}</Badge>}
                      {v.current_mileage != null && (
                        <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => { setMileageVehicle(v); setMileageInput(v.current_mileage?.toString() || ""); }}>
                          <Gauge className="w-3 h-3 mr-0.5" />{v.current_mileage.toLocaleString("cs")} km
                        </Badge>
                      )}
                    </div>
                    {v.vin && <p className="text-[10px] text-muted-foreground mt-1">VIN: {v.vin}</p>}
                  </div>
                  <div className="flex gap-1">
                    {!v.current_mileage && (
                      <Button size="icon" variant="ghost" onClick={() => { setMileageVehicle(v); setMileageInput(""); }}>
                        <Gauge className="w-4 h-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => navigate("/service-plan")}>
                      <FileText className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => navigate(`/service-book?vehicle=${v.id}`)} title="Servisní kniha">
                      <BookOpen className="w-4 h-4" />
                    </Button>
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
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editVehicle ? "Upravit vozidlo" : "Přidat vozidlo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* VIN with OCR */}
            <div>
              <label className="text-sm font-medium">VIN</label>
              <div className="flex gap-2">
                <Input value={vin} onChange={e => setVin(e.target.value)} placeholder="Zadejte VIN" className="flex-1" />
                <Button variant="outline" onClick={decodeVin} disabled={vinLoading} title="Dekódovat VIN">
                  {vinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={ocrLoading} title="Fotka VIN">
                  {ocrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                </Button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleVinPhoto} />
              <p className="text-[10px] text-muted-foreground mt-1">Zadejte ručně, vyfotografujte VIN štítek nebo technický průkaz</p>
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
                <div className="flex gap-1">
                  <Input value={licensePlate} onChange={e => setLicensePlate(e.target.value)} placeholder="1A2 3456" className="flex-1" />
                  <Button variant="outline" size="icon" onClick={() => spzFileInputRef.current?.click()} disabled={ocrLoading} title="Fotka SPZ">
                    <ImagePlus className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <input ref={spzFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSpzPhoto} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium">Motor</label>
                <Input value={engine} onChange={e => setEngine(e.target.value)} placeholder="3.6L V6" />
              </div>
              <div>
                <label className="text-sm font-medium">Kilometry</label>
                <Input type="number" value={currentMileage} onChange={e => setCurrentMileage(e.target.value)} placeholder="50000" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Zrušit</Button>
            <Button onClick={save}>{editVehicle ? "Uložit" : "Přidat"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mileage Update Dialog */}
      <Dialog open={!!mileageVehicle} onOpenChange={() => setMileageVehicle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aktualizovat kilometry – {mileageVehicle?.brand} {mileageVehicle?.model}</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium">Aktuální stav kilometrů</label>
            <Input type="number" value={mileageInput} onChange={e => setMileageInput(e.target.value)} placeholder="např. 85000" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMileageVehicle(null)}>Zrušit</Button>
            <Button onClick={updateMileage}>Uložit</Button>
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
                    {s.photos && s.photos.length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {s.photos.map((url, pi) => (
                          <img key={pi} src={url} alt="Foto" className="w-16 h-16 rounded object-cover border cursor-pointer" onClick={() => window.open(url, '_blank')} />
                        ))}
                      </div>
                    )}
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
