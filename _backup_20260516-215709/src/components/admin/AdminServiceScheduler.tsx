import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Calendar, ChevronLeft, ChevronRight, Loader2, UserCog, Wrench } from "lucide-react";

type ServiceOrder = {
  id: string; vehicle_id: string | null; user_id: string; status: string;
  description: string | null; planned_work: string | null;
  estimated_price: number | null; eta_completion: string | null;
  mechanic_id: string | null; lift_id: string | null;
  created_at: string;
};
type Vehicle = { id: string; brand: string; model: string; year: number | null; license_plate: string | null };
type Mechanic = { id: string; name: string; active: boolean };
type Lift = { id: string; name: string; location: string | null; status: string };

const STATUS_LABELS: Record<string, string> = {
  received: "Přijato", diagnostics: "Diagnostika", waiting_approval: "Čeká schválení",
  waiting_parts: "Čeká díly", in_repair: "Oprava", testing: "Test",
  ready_pickup: "K vyzvednutí", completed: "Dokončeno",
};

const STATUS_COLORS: Record<string, string> = {
  received: "bg-yellow-100 text-yellow-800", diagnostics: "bg-blue-100 text-blue-800",
  waiting_approval: "bg-orange-100 text-orange-800", waiting_parts: "bg-purple-100 text-purple-800",
  in_repair: "bg-indigo-100 text-indigo-800", testing: "bg-cyan-100 text-cyan-800",
  ready_pickup: "bg-green-100 text-green-800", completed: "bg-green-200 text-green-900",
};

const AdminServiceScheduler = () => {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [lifts, setLifts] = useState<Lift[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"day" | "week">("day");
  const [selectedDate, setSelectedDate] = useState(new Date());

  const fetchAll = async () => {
    setLoading(true);
    const [ordersRes, vehiclesRes, mechRes, liftsRes] = await Promise.all([
      supabase.from("service_orders").select("*").neq("status", "completed").order("created_at"),
      supabase.from("user_vehicles").select("id, brand, model, year, license_plate"),
      supabase.from("mechanics").select("*").eq("active", true),
      supabase.from("service_lifts").select("*"),
    ]);
    setOrders((ordersRes.data as ServiceOrder[]) || []);
    setVehicles((vehiclesRes.data as Vehicle[]) || []);
    setMechanics((mechRes.data as Mechanic[]) || []);
    setLifts((liftsRes.data as Lift[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const getVehicle = (id: string | null) => vehicles.find(v => v.id === id);
  const getMechanic = (id: string | null) => mechanics.find(m => m.id === id);
  const getLift = (id: string | null) => lifts.find(l => l.id === id);

  const assignMechanic = async (orderId: string, mechanicId: string) => {
    await supabase.from("service_orders").update({ mechanic_id: mechanicId } as any).eq("id", orderId);
    toast({ title: "Mechanik přiřazen" });
    fetchAll();
  };

  const assignLift = async (orderId: string, liftId: string) => {
    // Mark lift as occupied
    await supabase.from("service_lifts").update({ status: "occupied" } as any).eq("id", liftId);
    await supabase.from("service_orders").update({ lift_id: liftId } as any).eq("id", orderId);
    toast({ title: "Zvedák přiřazen" });
    fetchAll();
  };

  const navigateDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + (view === "week" ? delta * 7 : delta));
    setSelectedDate(d);
  };

  const getWeekDays = () => {
    const start = new Date(selectedDate);
    start.setDate(start.getDate() - start.getDay() + 1); // Monday
    return Array.from({ length: view === "week" ? 7 : 1 }, (_, i) => {
      const d = new Date(view === "week" ? start : selectedDate);
      if (view === "week") d.setDate(start.getDate() + i);
      return d;
    });
  };

  const days = getWeekDays();
  const dateStr = (d: Date) => d.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" });

  // Group mechanics by workload
  const mechanicWorkload = mechanics.map(m => ({
    ...m,
    orderCount: orders.filter(o => o.mechanic_id === m.id).length,
  }));

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" /> Plánování servisu
        </h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={view === "day" ? "default" : "outline"} onClick={() => setView("day")}>Den</Button>
          <Button size="sm" variant={view === "week" ? "default" : "outline"} onClick={() => setView("week")}>Týden</Button>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => navigateDate(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium">
          {view === "day"
            ? selectedDate.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })
            : `${days[0].toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })} – ${days[6].toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}`
          }
        </span>
        <Button size="sm" variant="ghost" onClick={() => navigateDate(1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Mechanic workload overview */}
      <div className="grid grid-cols-2 gap-2">
        {mechanicWorkload.map(m => (
          <Card key={m.id} className={m.orderCount > 2 ? "border-orange-300" : ""}>
            <CardContent className="p-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCog className="w-3 h-3 text-primary" />
                <span className="text-xs font-medium">{m.name}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">{m.orderCount} zakázek</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lifts status */}
      <div className="flex gap-2 flex-wrap">
        {lifts.map(l => (
          <Badge
            key={l.id}
            className={
              l.status === "free" ? "bg-green-100 text-green-800" :
              l.status === "occupied" ? "bg-red-100 text-red-800" :
              "bg-gray-100 text-gray-800"
            }
          >
            {l.name}: {l.status === "free" ? "Volný" : l.status === "occupied" ? "Obsazený" : "Mimo provoz"}
          </Badge>
        ))}
      </div>

      {/* Orders list */}
      <div className="space-y-2">
        {orders.filter(o => o.status !== "completed").map(order => {
          const v = getVehicle(order.vehicle_id);
          const m = getMechanic(order.mechanic_id);
          const l = getLift(order.lift_id);

          return (
            <Card key={order.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {v ? `${v.brand} ${v.model} ${v.year || ""}` : "—"}
                      {v?.license_plate && <span className="text-xs text-muted-foreground ml-1">({v.license_plate})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{order.description || order.planned_work || "—"}</p>
                  </div>
                  <Badge className={STATUS_COLORS[order.status] || ""}>{STATUS_LABELS[order.status] || order.status}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Mechanik</label>
                    <Select value={order.mechanic_id || ""} onValueChange={v => assignMechanic(order.id, v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Přiřadit" /></SelectTrigger>
                      <SelectContent>
                        {mechanics.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Zvedák</label>
                    <Select value={order.lift_id || ""} onValueChange={v => assignLift(order.id, v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Přiřadit" /></SelectTrigger>
                      <SelectContent>
                        {lifts.filter(l => l.status === "free").map(l => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2 text-[10px] text-muted-foreground">
                  {m && <span>👨‍🔧 {m.name}</span>}
                  {l && <span>🔧 {l.name}</span>}
                  {order.eta_completion && <span>ETA: {new Date(order.eta_completion).toLocaleDateString("cs-CZ")}</span>}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {orders.filter(o => o.status !== "completed").length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Žádné aktivní zakázky</p>
        )}
      </div>
    </div>
  );
};

export default AdminServiceScheduler;
