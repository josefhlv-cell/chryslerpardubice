import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wrench, ChevronRight } from "lucide-react";
import ServiceOrderDetail from "@/components/service/ServiceOrderDetail";

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

const MyServiceOrders = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [ordersRes, vehiclesRes] = await Promise.all([
      supabase.from("service_orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("user_vehicles").select("*").eq("user_id", user.id),
    ]);
    setOrders(ordersRes.data || []);
    setVehicles(vehiclesRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchData();

    if (user) {
      const channel = supabase
        .channel("my-service-orders")
        .on("postgres_changes", { event: "*", schema: "public", table: "service_orders", filter: `user_id=eq.${user.id}` }, () => {
          fetchData();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  const getVehicleLabel = (vId: string | null) => {
    if (!vId) return "—";
    const v = vehicles.find((x: any) => x.id === vId);
    return v ? `${v.brand} ${v.model} ${v.year || ""}` : "—";
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Moje servisní zakázky" />
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Detail zakázky" />
        <div className="p-4 max-w-lg mx-auto">
          <ServiceOrderDetail
            order={selectedOrder}
            vehicles={vehicles}
            onBack={() => { setSelectedOrder(null); fetchData(); }}
            isAdmin={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Moje servisní zakázky" />
      <div className="p-4 max-w-lg mx-auto space-y-3">
        {orders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Žádné servisní zakázky</p>
          </div>
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
      </div>
    </div>
  );
};

export default MyServiceOrders;
