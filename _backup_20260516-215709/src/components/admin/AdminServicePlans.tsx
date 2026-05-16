import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Vehicle = { id: string; user_id: string; brand: string; model: string; year: number | null; current_mileage: number | null };
type Profile = { user_id: string; full_name: string | null; email: string | null };
type Plan = {
  id: string; vehicle_id: string; service_name: string;
  interval_km: number | null; interval_months: number | null;
  last_service_km: number | null; last_service_date: string | null;
  recommended_part_oem: string | null; is_active: boolean; is_custom: boolean;
};

const AdminServicePlans = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);

  // Form
  const [serviceName, setServiceName] = useState("");
  const [intervalKm, setIntervalKm] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("");
  const [lastKm, setLastKm] = useState("");
  const [lastDate, setLastDate] = useState("");
  const [partOem, setPartOem] = useState("");

  useEffect(() => {
    supabase.from("profiles").select("user_id, full_name, email").order("full_name")
      .then(({ data }) => setProfiles((data as Profile[]) || []));
  }, []);

  useEffect(() => {
    if (!selectedUserId) { setVehicles([]); return; }
    supabase.from("user_vehicles").select("*").eq("user_id", selectedUserId)
      .then(({ data }) => { setVehicles((data as Vehicle[]) || []); setSelectedVehicleId(""); });
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedVehicleId) { setPlans([]); return; }
    fetchPlans();
  }, [selectedVehicleId]);

  const fetchPlans = async () => {
    setLoading(true);
    const { data } = await supabase.from("service_plans").select("*")
      .eq("vehicle_id", selectedVehicleId).order("interval_km");
    setPlans((data as Plan[]) || []);
    setLoading(false);
  };

  const resetForm = () => {
    setEditPlan(null); setServiceName(""); setIntervalKm(""); setIntervalMonths("");
    setLastKm(""); setLastDate(""); setPartOem("");
  };

  const openEdit = (p: Plan) => {
    setEditPlan(p); setServiceName(p.service_name);
    setIntervalKm(p.interval_km?.toString() || "");
    setIntervalMonths(p.interval_months?.toString() || "");
    setLastKm(p.last_service_km?.toString() || "");
    setLastDate(p.last_service_date || ""); setPartOem(p.recommended_part_oem || "");
    setDialogOpen(true);
  };

  const save = async () => {
    if (!serviceName || !selectedVehicleId || !selectedUserId) return;
    const payload: any = {
      vehicle_id: selectedVehicleId, user_id: selectedUserId, service_name: serviceName,
      interval_km: intervalKm ? parseInt(intervalKm) : null,
      interval_months: intervalMonths ? parseInt(intervalMonths) : null,
      last_service_km: lastKm ? parseInt(lastKm) : null,
      last_service_date: lastDate || null,
      recommended_part_oem: partOem || null,
      is_custom: true,
    };
    if (editPlan) {
      await supabase.from("service_plans").update(payload).eq("id", editPlan.id);
    } else {
      await supabase.from("service_plans").insert(payload);
    }
    toast({ title: "Uloženo" });
    setDialogOpen(false); resetForm(); fetchPlans();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("service_plans").update({ is_active: active } as any).eq("id", id);
    fetchPlans();
  };

  const remove = async (id: string) => {
    await supabase.from("service_plans").delete().eq("id", id);
    fetchPlans();
    toast({ title: "Smazáno" });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Zákazník</label>
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger><SelectValue placeholder="Vyberte zákazníka" /></SelectTrigger>
          <SelectContent>
            {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email || "–"}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {vehicles.length > 0 && (
        <div>
          <label className="text-sm font-medium">Vozidlo</label>
          <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
            <SelectTrigger><SelectValue placeholder="Vyberte vozidlo" /></SelectTrigger>
            <SelectContent>
              {vehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.brand} {v.model} {v.year || ""} {v.current_mileage ? `(${v.current_mileage.toLocaleString("cs")} km)` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedVehicleId && (
        <>
          <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }} className="w-full">
            <Plus className="w-4 h-4 mr-1" />Přidat úkon
          </Button>

          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Žádné servisní úkony</p>
          ) : (
            <div className="space-y-2">
              {plans.map(p => (
                <Card key={p.id} className={!p.is_active ? "opacity-50" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{p.service_name}</p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {p.interval_km && <Badge variant="outline" className="text-[10px]">{p.interval_km.toLocaleString("cs")} km</Badge>}
                          {p.interval_months && <Badge variant="outline" className="text-[10px]">{p.interval_months} měs.</Badge>}
                          {p.is_custom && <Badge variant="secondary" className="text-[10px]">Vlastní</Badge>}
                        </div>
                        {p.last_service_date && <p className="text-[10px] text-muted-foreground mt-1">Poslední: {new Date(p.last_service_date).toLocaleDateString("cs-CZ")}{p.last_service_km ? ` při ${p.last_service_km.toLocaleString("cs")} km` : ""}</p>}
                      </div>
                      <div className="flex gap-1 items-center">
                        <Switch checked={p.is_active} onCheckedChange={(v) => toggleActive(p.id, v)} />
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Edit className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
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
        <DialogContent>
          <DialogHeader><DialogTitle>{editPlan ? "Upravit úkon" : "Přidat servisní úkon"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-sm font-medium">Název úkonu *</label>
              <Input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="Výměna oleje" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-sm font-medium">Interval km</label>
                <Input type="number" value={intervalKm} onChange={e => setIntervalKm(e.target.value)} placeholder="15000" /></div>
              <div><label className="text-sm font-medium">Interval měs.</label>
                <Input type="number" value={intervalMonths} onChange={e => setIntervalMonths(e.target.value)} placeholder="12" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-sm font-medium">Poslední km</label>
                <Input type="number" value={lastKm} onChange={e => setLastKm(e.target.value)} /></div>
              <div><label className="text-sm font-medium">Poslední datum</label>
                <Input type="date" value={lastDate} onChange={e => setLastDate(e.target.value)} /></div>
            </div>
            <div><label className="text-sm font-medium">OEM díl (volitelné)</label>
              <Input value={partOem} onChange={e => setPartOem(e.target.value)} placeholder="68218951AA" /></div>
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

export default AdminServicePlans;
