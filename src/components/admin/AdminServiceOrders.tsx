import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Wrench, ChevronRight } from "lucide-react";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import ServiceOrderDetail from "@/components/service/ServiceOrderDetail";

type Vehicle = { id: string; brand: string; model: string; year: number | null; license_plate: string | null; user_id: string };
type ProfileInfo = { user_id: string; full_name: string | null; email: string | null; phone: string | null };
type ServiceOrder = {
  id: string; vehicle_id: string | null; user_id: string; status: string;
  description: string | null; mileage: number | null; planned_work: string | null;
  estimated_price: number | null; eta_completion: string | null;
  labor_price: number | null; parts_total: number | null; total_price: number | null;
  customer_approved: boolean | null; created_at: string; updated_at: string;
  mechanic_id: string | null; lift_id: string | null;
  profile_name?: string | null; profile_email?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  received: "Přijato do servisu",
  diagnostics: "Diagnostika",
  waiting_approval: "Čeká na schválení",
  waiting_parts: "Čeká na díly",
  in_repair: "Oprava probíhá",
  testing: "Testování vozidla",
  ready_pickup: "Připraveno k vyzvednutí",
  completed: "Dokončeno",
};

const STATUS_COLORS: Record<string, string> = {
  received: "bg-yellow-100 text-yellow-800",
  diagnostics: "bg-blue-100 text-blue-800",
  waiting_approval: "bg-orange-100 text-orange-800",
  waiting_parts: "bg-purple-100 text-purple-800",
  in_repair: "bg-indigo-100 text-indigo-800",
  testing: "bg-cyan-100 text-cyan-800",
  ready_pickup: "bg-green-100 text-green-800",
  completed: "bg-green-200 text-green-900",
};

const AdminServiceOrders = () => {
  const { isEnabled } = useFeatureFlags();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);

  // Create form
  const [formVehicleId, setFormVehicleId] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formMileage, setFormMileage] = useState("");
  const [formPlannedWork, setFormPlannedWork] = useState("");
  const [formEstPrice, setFormEstPrice] = useState("");
  const [formEta, setFormEta] = useState("");

  const fetchOrders = async () => {
    setLoading(true);
    const [ordersRes, vehiclesRes] = await Promise.all([
      supabase.from("service_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("user_vehicles").select("*"),
    ]);
    const rawOrders = (ordersRes.data as ServiceOrder[]) || [];
    setVehicles((vehiclesRes.data as Vehicle[]) || []);

    // Enrich with profile data
    const userIds = [...new Set(rawOrders.map(o => o.user_id))];
    let profileMap = new Map<string, ProfileInfo>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email, phone").in("user_id", userIds);
      (profiles || []).forEach(p => profileMap.set(p.user_id, p));
    }
    setOrders(rawOrders.map(o => ({
      ...o,
      profile_name: profileMap.get(o.user_id)?.full_name || null,
      profile_email: profileMap.get(o.user_id)?.email || null,
    })));
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();

    // Real-time subscription
    const channel = supabase
      .channel("service-orders-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const getVehicleLabel = (vId: string | null) => {
    if (!vId) return "—";
    const v = vehicles.find(x => x.id === vId);
    return v ? `${v.brand} ${v.model} ${v.year || ""} ${v.license_plate || ""}` : vId.slice(0, 8);
  };

  const createOrder = async () => {
    if (!formVehicleId) { toast({ title: "Vyberte vozidlo", variant: "destructive" }); return; }
    const vehicle = vehicles.find(v => v.id === formVehicleId);
    if (!vehicle) return;

    const { error } = await supabase.from("service_orders").insert({
      vehicle_id: formVehicleId,
      user_id: vehicle.user_id,
      description: formDesc || null,
      mileage: formMileage ? parseInt(formMileage) : null,
      planned_work: formPlannedWork || null,
      estimated_price: formEstPrice ? parseFloat(formEstPrice) : null,
      eta_completion: formEta || null,
      status: "received" as any,
    } as any);

    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }

    // Log status history
    toast({ title: "Zakázka vytvořena" });
    setShowCreate(false);
    setFormVehicleId(""); setFormDesc(""); setFormMileage(""); setFormPlannedWork(""); setFormEstPrice(""); setFormEta("");
    fetchOrders();
  };

  if (selectedOrder) {
    return (
      <ServiceOrderDetail
        order={selectedOrder}
        vehicles={vehicles}
        onBack={() => { setSelectedOrder(null); fetchOrders(); }}
        isAdmin={true}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" /> Servisní zakázky
        </h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nová zakázka
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Žádné servisní zakázky</p>
      ) : (
        orders.map((o) => (
          <Card key={o.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelectedOrder(o)}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{getVehicleLabel(o.vehicle_id)}</p>
                  <p className="text-xs text-muted-foreground truncate">{o.description || o.planned_work || "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(o.created_at).toLocaleDateString("cs-CZ")}
                    {o.estimated_price != null && ` · ~${o.estimated_price.toLocaleString("cs")} Kč`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={STATUS_COLORS[o.status] || ""}>{STATUS_LABELS[o.status] || o.status}</Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nová servisní zakázka</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Vozidlo *</label>
              <Select value={formVehicleId} onValueChange={setFormVehicleId}>
                <SelectTrigger><SelectValue placeholder="Vyberte vozidlo" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.brand} {v.model} {v.year || ""} {v.license_plate || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Popis závady</label>
              <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Popište závadu..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Stav km</label>
                <Input type="number" value={formMileage} onChange={e => setFormMileage(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Odhad ceny (Kč)</label>
                <Input type="number" value={formEstPrice} onChange={e => setFormEstPrice(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Plánované práce</label>
              <Textarea value={formPlannedWork} onChange={e => setFormPlannedWork(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">ETA dokončení</label>
              <Input type="datetime-local" value={formEta} onChange={e => setFormEta(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Zrušit</Button>
            <Button onClick={createOrder}>Vytvořit zakázku</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminServiceOrders;
