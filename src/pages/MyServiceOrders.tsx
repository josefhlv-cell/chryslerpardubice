import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchUserServiceOrders, fetchUserReviews, subscribeToServiceOrders } from "@/api/serviceOrdersAPI";
import { fetchUserVehicles } from "@/api/garageAPI";
import { fetchMyBookings } from "@/api/serviceBookingsAPI";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Wrench, ChevronRight, CalendarDays, X } from "lucide-react";
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
  const [bookings, setBookings] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [ordersData, vehiclesData, reviewsData, bookingsData] = await Promise.all([
      fetchUserServiceOrders(user.id),
      fetchUserVehicles(user.id),
      fetchUserReviews(user.id),
      fetchMyBookings(user.id).catch(() => []),
    ]);
    setOrders(ordersData);
    setVehicles(vehiclesData);
    setBookings(bookingsData || []);
    const reviewMap: Record<string, any> = {};
    reviewsData.forEach((r: any) => { reviewMap[r.service_order_id] = r; });
    setReviews(reviewMap);
    setLoading(false);
  };

  const cancelBooking = async (id: string) => {
    const { error } = await supabase
      .from("service_bookings")
      .update({ status: "cancelled" as any, admin_note: "Zrušeno na žádost zákazníka" })
      .eq("id", id);
    if (error) {
      toast.error("Nepodařilo se zrušit rezervaci", { description: error.message });
      return;
    }
    toast.success("Rezervace zrušena");
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
  };


  useEffect(() => {
    if (user) fetchData();

    if (user) {
      return subscribeToServiceOrders(user.id, fetchData);
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

  const activeBookings = bookings.filter((b) => b.status === "pending" || b.status === "confirmed");

  return (
    <div className="min-h-screen pb-20 bg-background">
      <PageHeader title="Servisní zakázky" showBack />
      <div className="p-4 max-w-lg mx-auto space-y-3">
        {activeBookings.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold px-1">Moje rezervace</h2>
            {activeBookings.map((b) => (
              <div key={b.id} className="glass-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
                      <p className="text-sm font-semibold truncate">{b.service_type || "Servis"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[b.vehicle_brand, b.vehicle_model].filter(Boolean).join(" ") || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.confirmed_date
                        ? `Potvrzeno: ${new Date(b.confirmed_date).toLocaleDateString("cs-CZ")}`
                        : `Preferováno: ${new Date(b.preferred_date).toLocaleDateString("cs-CZ")}`}
                    </p>
                  </div>
                  <Badge className={b.status === "confirmed" ? "bg-success/15 text-success border-0" : "bg-warning/15 text-warning border-0"}>
                    {b.status === "confirmed" ? "Potvrzeno" : "Čeká"}
                  </Badge>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="w-full text-destructive hover:bg-destructive/10 border-destructive/30">
                      <X className="w-3.5 h-3.5 mr-1" /> Zrušit rezervaci
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Zrušit rezervaci?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Opravdu chcete zrušit rezervaci na {b.service_type}? Doporučujeme nás informovat i telefonicky.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Zpět</AlertDialogCancel>
                      <AlertDialogAction onClick={() => cancelBooking(b.id)} className="bg-destructive hover:bg-destructive/90">
                        Ano, zrušit
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}

        {orders.length === 0 && activeBookings.length === 0 ? (
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
              {o.status === "completed" && isEnabled("service_reviews") && (
                <div className="mt-2">
                  <ServiceReviewForm
                    serviceOrderId={o.id}
                    existingReview={reviews[o.id] || null}
                    onReviewSubmitted={fetchData}
                  />
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default MyServiceOrders;
