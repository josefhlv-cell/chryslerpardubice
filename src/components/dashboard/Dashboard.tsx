import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Bell, ChevronRight, Wrench, Search, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import VehicleCarousel from "./VehicleCarousel";
import ServiceRecommendations from "@/components/ServiceRecommendations";
import ServiceProgressIndicator from "@/components/ServiceProgressIndicator";
import TondaAvatar from "@/components/TondaAvatar";
import CarIcon from "@/components/CarIcon";

const Dashboard = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [primaryVehicle, setPrimaryVehicle] = useState<any>(null);
  const [lastServiceDate, setLastServiceDate] = useState<string | null>(null);

  const firstName = profile?.full_name?.split(" ")[0] || "uživateli";

  useEffect(() => {
    if (!user) return;

    // Fetch active service order
    supabase
      .from("service_orders")
      .select("*")
      .eq("user_id", user.id)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.length) setActiveOrder(data[0]);
      });

    // Fetch primary vehicle
    supabase
      .from("user_vehicles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (data?.length) {
          setPrimaryVehicle(data[0]);
          // Fetch last service for this vehicle
          supabase
            .from("service_history")
            .select("service_date")
            .eq("vehicle_id", data[0].id)
            .order("service_date", { ascending: false })
            .limit(1)
            .then(({ data: sh }) => {
              if (sh?.length) setLastServiceDate(sh[0].service_date);
            });
        }
      });
  }, [user]);

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* Hero Vehicle Card */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="px-5 pt-5"
      >
        <div className="glass-card-elevated overflow-hidden">
          {/* Vehicle hero section */}
          <div className="relative px-5 pt-5 pb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="font-display font-bold text-xl tracking-tight">
                  {primaryVehicle ? `Můj ${primaryVehicle.brand}` : `Můj Chrysler`}
                </h1>
                {primaryVehicle && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {primaryVehicle.model} {primaryVehicle.year || ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate("/notifications")}
                  className="w-9 h-9 rounded-full border border-border/40 flex items-center justify-center hover:border-primary/30 transition-colors"
                >
                  <Bell className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => navigate("/account")}
                  className="w-9 h-9 rounded-full border border-primary/40 flex items-center justify-center overflow-hidden"
                >
                  <TondaAvatar size="sm" />
                </button>
              </div>
            </div>

            {/* Vehicle image */}
            {primaryVehicle ? (
              <div className="flex justify-center my-2">
                <CarIcon car={primaryVehicle} size="lg" className="!w-48 !h-28" />
              </div>
            ) : (
              <div className="flex justify-center my-2">
                <div className="w-48 h-28 rounded-xl bg-secondary/30 flex items-center justify-center">
                  <svg viewBox="0 4 36 18" className="w-24 h-16 text-muted-foreground/20">
                    <path d="M5 18 L5 14 L8 10 L14 8 L22 8 L28 10 L31 14 L31 18 Z M8 18 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M24 18 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0" fill="currentColor" />
                  </svg>
                </div>
              </div>
            )}

            {/* Status row */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Stav</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-success/15 text-success">
                  OK
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Příští servis</span>
                <span className="text-xs font-semibold text-foreground">
                  {lastServiceDate
                    ? new Date(new Date(lastServiceDate).getTime() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" })
                    : "—"
                  }
                </span>
              </div>
            </div>
          </div>

          {/* Active service order indicator */}
          {activeOrder && (
            <button
              onClick={() => navigate("/my-service-orders")}
              className="w-full border-t border-border/30 px-5 py-3 flex items-center gap-3 hover:bg-card/80 transition-colors"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-medium flex-1 text-left">Aktivní servis</span>
              <ServiceProgressIndicator status={activeOrder.status} compact className="flex-1" />
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {/* Two action buttons */}
          <div className="grid grid-cols-2 border-t border-border/30">
            <button
              onClick={() => navigate("/service")}
              className="flex items-center justify-center gap-2 py-3.5 text-sm font-medium border-r border-border/30 hover:bg-card/80 transition-colors group"
            >
              <Wrench className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-xs tracking-wide">Objednat Servis</span>
            </button>
            <button
              onClick={() => navigate("/shop")}
              className="flex items-center justify-center gap-2 py-3.5 text-sm font-medium hover:bg-card/80 transition-colors group"
            >
              <Search className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-xs tracking-wide">Katalog</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Content */}
      <div className="px-5 space-y-5 mt-5">
        {/* AI Mechanic CTA */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => navigate("/ai-mechanic")}
          className="w-full border border-border/40 rounded-lg p-4 flex items-center gap-3.5 hover:border-primary/30 transition-all group"
        >
          <TondaAvatar size="sm" />
          <div className="text-left flex-1 min-w-0">
            <p className="font-display font-semibold text-sm tracking-tight">
              Zeptejte se Tondy
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI mechanik poradí s čímkoli
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </motion.button>

        {/* Vehicle Carousel (if multiple vehicles) */}
        <VehicleCarousel />

        {/* Service Recommendations */}
        <ServiceRecommendations />
      </div>
    </div>
  );
};

export default Dashboard;
