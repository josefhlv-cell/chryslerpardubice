import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Edit, ToggleRight, ImagePlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  service_history_enabled: boolean;
};

type Vehicle = {
  id: string;
  user_id: string;
  brand: string;
  model: string;
  year: number | null;
  license_plate: string | null;
};

type ServiceRecord = {
  id: string;
  vehicle_id: string;
  user_id: string;
  service_type: string;
  description: string | null;
  parts_used: string | null;
  price: number | null;
  mileage: number | null;
  service_date: string;
  photos: string[] | null;
};

const AdminServiceHistory = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ServiceRecord | null>(null);
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [partsUsed, setPartsUsed] = useState("");
  const [price, setPrice] = useState("");
  const [mileage, setMileage] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("profiles").select("id, user_id, full_name, email, service_history_enabled").order("full_name");
      setProfiles((data as Profile[]) || []);
    };
    fetch();
  }, []);

  useEffect(() => {
    if (!selectedUserId) { setVehicles([]); return; }
    const fetch = async () => {
      const { data } = await supabase.from("user_vehicles").select("*").eq("user_id", selectedUserId);
      setVehicles((data as Vehicle[]) || []);
      setSelectedVehicleId("");
    };
    fetch();
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedVehicleId) { setRecords([]); return; }
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase.from("service_history").select("*").eq("vehicle_id", selectedVehicleId).order("service_date", { ascending: false });
      setRecords((data as ServiceRecord[]) || []);
      setLoading(false);
    };
    fetch();
  }, [selectedVehicleId]);

  const toggleServiceHistory = async (profileId: string, _userId: string, enabled: boolean) => {
    await supabase.from("profiles").update({ service_history_enabled: enabled }).eq("id", profileId);
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, service_history_enabled: enabled } : p));
    toast({ title: enabled ? "Servisní knížka zapnuta" : "Servisní knížka vypnuta" });
  };

  const resetForm = () => {
    setEditRecord(null);
    setServiceType("");
    setDescription("");
    setPartsUsed("");
    setPrice("");
    setMileage("");
    setServiceDate("");
    setPhotos([]);
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (r: ServiceRecord) => {
    setEditRecord(r);
    setServiceType(r.service_type);
    setDescription(r.description || "");
    setPartsUsed(r.parts_used || "");
    setPrice(r.price?.toString() || "");
    setMileage(r.mileage?.toString() || "");
    setServiceDate(r.service_date);
    setPhotos(r.photos || []);
    setDialogOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const newPhotos = [...photos];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${selectedVehicleId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("service-photos").upload(path, file);
      if (error) {
        toast({ title: "Chyba nahrávání", description: error.message, variant: "destructive" });
        continue;
      }
      const { data: urlData } = supabase.storage.from("service-photos").getPublicUrl(path);
      newPhotos.push(urlData.publicUrl);
    }
    setPhotos(newPhotos);
    setUploading(false);
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!serviceType || !serviceDate || !selectedVehicleId || !selectedUserId) {
      toast({ title: "Vyplňte typ servisu a datum", variant: "destructive" });
      return;
    }
    const payload: any = {
      vehicle_id: selectedVehicleId,
      user_id: selectedUserId,
      service_type: serviceType,
      description: description || null,
      parts_used: partsUsed || null,
      price: price ? parseFloat(price) : null,
      mileage: mileage ? parseInt(mileage) : null,
      service_date: serviceDate,
      photos: photos.length > 0 ? photos : [],
    };

    if (editRecord) {
      const { error } = await supabase.from("service_history").update(payload).eq("id", editRecord.id);
      if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("service_history").insert(payload);
      if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    }
    toast({ title: "Uloženo" });
    setDialogOpen(false);
    resetForm();
    const { data } = await supabase.from("service_history").select("*").eq("vehicle_id", selectedVehicleId).order("service_date", { ascending: false });
    setRecords((data as ServiceRecord[]) || []);
  };

  const remove = async (id: string) => {
    await supabase.from("service_history").delete().eq("id", id);
    setRecords(prev => prev.filter(r => r.id !== id));
    toast({ title: "Smazáno" });
  };

  const selectedProfile = profiles.find(p => p.user_id === selectedUserId);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Zákazník</label>
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger><SelectValue placeholder="Vyberte zákazníka" /></SelectTrigger>
          <SelectContent>
            {profiles.map(p => (
              <SelectItem key={p.user_id} value={p.user_id}>
                {p.full_name || p.email || "–"}
                {p.service_history_enabled && " ✓"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedProfile && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <ToggleRight className="w-4 h-4" />
            <span className="text-sm">Servisní knížka</span>
          </div>
          <Switch
            checked={selectedProfile.service_history_enabled}
            onCheckedChange={(v) => toggleServiceHistory(selectedProfile.id, selectedProfile.user_id, v)}
          />
        </div>
      )}

      {vehicles.length > 0 && (
        <div>
          <label className="text-sm font-medium">Vozidlo</label>
          <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
            <SelectTrigger><SelectValue placeholder="Vyberte vozidlo" /></SelectTrigger>
            <SelectContent>
              {vehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.brand} {v.model} {v.year ? `(${v.year})` : ""} {v.license_plate || ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedUserId && vehicles.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Zákazník nemá žádná vozidla</p>
      )}

      {selectedVehicleId && (
        <>
          <Button size="sm" onClick={openAdd} className="w-full">
            <Plus className="w-4 h-4 mr-1" />Přidat záznam
          </Button>

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : records.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Žádné záznamy</p>
          ) : (
            <div className="space-y-2">
              {records.map(r => (
                <Card key={r.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm">{r.service_type}</p>
                        <p className="text-xs text-muted-foreground">{new Date(r.service_date).toLocaleDateString("cs-CZ")}</p>
                        {r.description && <p className="text-xs text-muted-foreground mt-1">{r.description}</p>}
                        <div className="flex gap-3 text-xs mt-1">
                          {r.mileage != null && <span>{r.mileage.toLocaleString("cs")} km</span>}
                          {r.price != null && <span className="font-medium">{r.price.toLocaleString("cs")} Kč</span>}
                        </div>
                        {r.photos && r.photos.length > 0 && (
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {r.photos.map((url, i) => (
                              <img key={i} src={url} alt="Foto" className="w-16 h-16 rounded object-cover border" />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Edit className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editRecord ? "Upravit záznam" : "Přidat servisní záznam"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Typ servisu *</label>
              <Input value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="Výměna oleje" />
            </div>
            <div>
              <label className="text-sm font-medium">Datum *</label>
              <Input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Popis</label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Použité díly</label>
              <Input value={partsUsed} onChange={e => setPartsUsed(e.target.value)} placeholder="Olejový filtr, olej 5W30" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium">Kilometry</label>
                <Input type="number" value={mileage} onChange={e => setMileage(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Cena (Kč)</label>
                <Input type="number" value={price} onChange={e => setPrice(e.target.value)} />
              </div>
            </div>
            {/* Photos */}
            <div>
              <label className="text-sm font-medium">Fotografie</label>
              <div className="flex gap-1.5 flex-wrap mt-1">
                {photos.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="Foto" className="w-20 h-20 rounded object-cover border" />
                    <button onClick={() => removePhoto(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <label className="w-20 h-20 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary transition-colors">
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5 text-muted-foreground" />}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Zrušit</Button>
            <Button onClick={save}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminServiceHistory;
