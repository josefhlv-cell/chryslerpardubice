import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Bell, ChevronRight, Wrench, BookOpen, Phone, Car } from "lucide-react";
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

    supabase
      .from("user_vehicles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (data?.length) {
          setPrimaryVehicle(data[0]);
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
          {/* Header row */}
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
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
                className="relative w-9 h-9 rounded-full border border-border/40 flex items-center justify-center hover:border-primary/30 transition-colors"
              >
                <Bell className="w-4 h-4 text-muted-foreground" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
              </button>
              <button
                onClick={() => navigate("/account")}
                className="w-9 h-9 rounded-full border border-border/40 flex items-center justify-center overflow-hidden bg-muted"
              >
                <span className="text-xs font-semibold text-muted-foreground">
                  {firstName.charAt(0).toUpperCase()}
                </span>
              </button>
            </div>
          </div>

          {/* Vehicle image — larger */}
          <div className="relative flex justify-center py-4">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent" />
            {primaryVehicle ? (
              <CarIcon car={primaryVehicle} size="lg" className="!w-56 !h-32 relative z-10" />
            ) : (
              <div className="w-56 h-32 rounded-xl bg-secondary/30 flex items-center justify-center">
                <svg viewBox="0 4 36 18" className="w-28 h-18 text-muted-foreground/20">
                  <path d="M5 18 L5 14 L8 10 L14 8 L22 8 L28 10 L31 14 L31 18 Z M8 18 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M24 18 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0" fill="currentColor" />
                </svg>
              </div>
            )}
          </div>

          {/* Status row */}
          <div className="flex items-center justify-between px-5 pb-4">
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

          {/* Full-width bronze CTA */}
          <div className="px-5 pb-4">
            <Button
              variant="hero"
              size="lg"
              className="w-full text-sm"
              onClick={() => navigate("/service")}
            >
              <Phone className="w-4 h-4 mr-2" />
              Objednat Servis
            </Button>
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
        </div>
      </motion.div>

      {/* Two action cards side by side */}
      <div className="px-5 mt-4">
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            onClick={() => navigate("/service")}
            className="glass-card p-4 flex flex-col items-center gap-3 hover:border-primary/30 transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xs font-medium tracking-wide">Objednat Servis</span>
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onClick={() => navigate("/shop")}
            className="glass-card p-4 flex flex-col items-center gap-3 hover:border-primary/30 transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xs font-medium tracking-wide">Katalog</span>
          </motion.button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 space-y-5 mt-5">
        {/* AI Mechanic CTA */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
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

        <VehicleCarousel />
        <ServiceRecommendations />
      </div>
    </div>
  );
};

export default Dashboard;
