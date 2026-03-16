import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wrench, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import ServiceOrderDetail from "@/components/service/ServiceOrderDetail";
import ServiceProgressIndicator from "@/components/ServiceProgressIndicator";
import ServiceReviewForm from "@/components/service/ServiceReviewForm";

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

const STATUS_STYLES: Record<string, string> = {
  received: "bg-warning/15 text-warning border-0",
  diagnostics: "bg-blue-500/15 text-blue-400 border-0",
  waiting_approval: "bg-orange-500/15 text-orange-400 border-0",
  waiting_parts: "bg-purple-500/15 text-purple-400 border-0",
  in_repair: "bg-primary/15 text-primary border-0",
  testing: "bg-cyan-500/15 text-cyan-400 border-0",
  ready_pickup: "bg-success/15 text-success border-0",
  completed: "bg-success/20 text-success border-0",
};

const MyServiceOrders = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Record<string, any>>({});
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
      <div className="min-h-screen pb-20 bg-background">
        <PageHeader title="Moje servisní zakázky" showBack />
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <div className="min-h-screen pb-20 bg-background">
        <PageHeader 
          title="Detail zakázky" 
          showBack 
          rightElement={
            <button onClick={() => { setSelectedOrder(null); fetchData(); }} className="text-sm text-muted-foreground">
              Zpět na seznam
            </button>
          }
        />
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
    <div className="min-h-screen pb-20 bg-background">
      <PageHeader title="Servisní zakázky" showBack />
      <div className="p-4 max-w-lg mx-auto space-y-3">
        {orders.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">Žádné servisní zakázky</p>
          </div>
        ) : (
          orders.map((o, i) => (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <button
                onClick={() => setSelectedOrder(o)}
                className="w-full text-left glass-card-elevated p-4 space-y-3 hover:border-primary/20 transition-all active:scale-[0.99]"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-display font-semibold truncate">{getVehicleLabel(o.vehicle_id)}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{o.description || o.planned_work || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_STYLES[o.status] || ""}>{STATUS_LABELS[o.status] || o.status}</Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                  </div>
                </div>
                
                {o.status !== "completed" && (
                  <ServiceProgressIndicator status={o.status} compact />
                )}

                <p className="text-[10px] text-muted-foreground/50">
                  {new Date(o.created_at).toLocaleDateString("cs-CZ")}
                </p>
              </button>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default MyServiceOrders;
