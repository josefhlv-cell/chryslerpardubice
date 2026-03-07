import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Wrench, Calendar, AlertTriangle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

type Vehicle = {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  engine: string | null;
  vin: string | null;
  current_mileage: number | null;
};

type ServicePlan = {
  id: string;
  vehicle_id: string;
  service_name: string;
  interval_km: number | null;
  interval_months: number | null;
  last_service_date: string | null;
  last_service_km: number | null;
  is_active: boolean;
  recommended_part_oem: string | null;
};

type Recommendation = {
  vehicle: Vehicle;
  plan: ServicePlan;
  urgency: "due" | "soon" | "upcoming";
  kmRemaining: number | null;
  daysRemaining: number | null;
  estimatedPrice: number | null;
};

const ServiceRecommendations = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    generateRecommendations();
  }, [user]);

  const generateRecommendations = async () => {
    if (!user) return;
    setLoading(true);

    const { data: vehicles } = await supabase
      .from("user_vehicles")
      .select("*")
      .eq("user_id", user.id);

    if (!vehicles?.length) { setLoading(false); return; }

    const { data: plans } = await supabase
      .from("service_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (!plans?.length) { setLoading(false); return; }

    const recs: Recommendation[] = [];
    const now = new Date();

    for (const plan of (plans as ServicePlan[])) {
      const vehicle = (vehicles as Vehicle[]).find(v => v.id === plan.vehicle_id);
      if (!vehicle) continue;

      let kmRemaining: number | null = null;
      let daysRemaining: number | null = null;
      let urgency: "due" | "soon" | "upcoming" | null = null;

      // Check km interval
      if (plan.interval_km && vehicle.current_mileage != null) {
        const lastKm = plan.last_service_km ?? 0;
        const nextKm = lastKm + plan.interval_km;
        kmRemaining = nextKm - vehicle.current_mileage;
        if (kmRemaining <= 0) urgency = "due";
        else if (kmRemaining <= plan.interval_km * 0.15) urgency = "soon";
        else if (kmRemaining <= plan.interval_km * 0.3) urgency = "upcoming";
      }

      // Check time interval
      if (plan.interval_months && plan.last_service_date) {
        const lastDate = new Date(plan.last_service_date);
        const nextDate = new Date(lastDate);
        nextDate.setMonth(nextDate.getMonth() + plan.interval_months);
        daysRemaining = Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysRemaining <= 0) urgency = "due";
        else if (daysRemaining <= 30 && (!urgency || urgency === "upcoming")) urgency = "soon";
        else if (daysRemaining <= 60 && !urgency) urgency = "upcoming";
      }

      // If no last service, mark as upcoming for new plans
      if (!plan.last_service_date && !plan.last_service_km) {
        urgency = "upcoming";
        kmRemaining = plan.interval_km ?? null;
        daysRemaining = plan.interval_months ? plan.interval_months * 30 : null;
      }

      if (urgency) {
        recs.push({
          vehicle,
          plan,
          urgency,
          kmRemaining,
          daysRemaining,
          estimatedPrice: getEstimatedPrice(plan.service_name),
        });
      }
    }

    // Sort: due first, then soon, then upcoming
    const order = { due: 0, soon: 1, upcoming: 2 };
    recs.sort((a, b) => order[a.urgency] - order[b.urgency]);

    setRecommendations(recs.slice(0, 5));
    setLoading(false);
  };

  const getEstimatedPrice = (serviceName: string): number => {
    const prices: Record<string, number> = {
      "Výměna motorového oleje": 2500,
      "Výměna olejového filtru": 800,
      "Výměna vzduchového filtru": 1200,
      "Výměna kabinového filtru": 900,
      "Výměna palivového filtru": 1500,
      "Výměna brzdové kapaliny": 1800,
      "Výměna chladicí kapaliny": 2200,
      "Kontrola brzd": 500,
      "Kontrola podvozku": 600,
      "Kontrola baterie": 300,
      "Kontrola rozvodů": 1000,
    };
    return prices[serviceName] ?? 1500;
  };

  const bookService = async (rec: Recommendation) => {
    if (!user) return;
    setBooking(rec.plan.id);

    const { error } = await supabase.from("service_bookings").insert({
      user_id: user.id,
      service_type: rec.plan.service_name,
      vehicle_brand: rec.vehicle.brand,
      vehicle_model: rec.vehicle.model,
      preferred_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      note: `Automatické doporučení servisu. VIN: ${rec.vehicle.vin || "–"}, km: ${rec.vehicle.current_mileage?.toLocaleString("cs") || "–"}`,
      wants_replacement_vehicle: false,
    });

    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      // Notify admin
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "🔧 Nová servisní poptávka",
        message: `${rec.vehicle.brand} ${rec.vehicle.model} – ${rec.plan.service_name} (VIN: ${rec.vehicle.vin || "–"}, ${rec.vehicle.current_mileage?.toLocaleString("cs") || "?"} km)`,
      });
      toast({ title: "Servis objednán", description: "Budeme vás kontaktovat s potvrzením termínu." });
    }
    setBooking(null);
  };

  if (loading) return null;
  if (!recommendations.length) return null;

  const urgencyStyles = {
    due: { bg: "bg-destructive/10 border-destructive/30", badge: "bg-destructive text-destructive-foreground", label: "Nutný servis" },
    soon: { bg: "bg-yellow-500/10 border-yellow-500/30", badge: "bg-yellow-500 text-white", label: "Brzy" },
    upcoming: { bg: "bg-primary/10 border-primary/30", badge: "bg-primary/20 text-primary", label: "Nadcházející" },
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Wrench className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Servisní doporučení</h3>
      </div>

      {recommendations.map((rec, i) => {
        const style = urgencyStyles[rec.urgency];
        return (
          <motion.div
            key={rec.plan.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className={`border ${style.bg}`}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {rec.urgency === "due" && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                      <p className="font-semibold text-sm truncate">{rec.plan.service_name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{rec.vehicle.brand} {rec.vehicle.model} {rec.vehicle.year || ""}</p>
                    <div className="flex gap-3 mt-1 flex-wrap">
                      <Badge className={`text-[10px] ${style.badge}`}>{style.label}</Badge>
                      {rec.kmRemaining != null && (
                        <span className="text-[10px] text-muted-foreground">
                          {rec.kmRemaining <= 0 ? "Překročeno" : `za ${rec.kmRemaining.toLocaleString("cs")} km`}
                        </span>
                      )}
                      {rec.daysRemaining != null && (
                        <span className="text-[10px] text-muted-foreground">
                          {rec.daysRemaining <= 0 ? "Prošlý termín" : `za ${rec.daysRemaining} dní`}
                        </span>
                      )}
                      {rec.estimatedPrice && (
                        <span className="text-[10px] font-medium">~{rec.estimatedPrice.toLocaleString("cs")} Kč</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0 text-xs"
                    onClick={() => bookService(rec)}
                    disabled={booking === rec.plan.id}
                  >
                    {booking === rec.plan.id ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                      <>
                        <Calendar className="w-3 h-3 mr-1" />
                        Objednat
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}

      <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => navigate("/service-plan")}>
        Zobrazit celý servisní plán →
      </Button>
    </div>
  );
};

export default ServiceRecommendations;
