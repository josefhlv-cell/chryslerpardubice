import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Bell, ChevronRight, Wrench } from "lucide-react";
import QuickActions from "./QuickActions";
import VehicleCarousel from "./VehicleCarousel";
import ServiceRecommendations from "@/components/ServiceRecommendations";
import ServiceProgressIndicator from "@/components/ServiceProgressIndicator";
import VehicleHealthDiagram from "@/components/VehicleHealthDiagram";
import TondaAvatar from "@/components/TondaAvatar";

const Dashboard = () => {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [activeOrder, setActiveOrder] = useState<any>(null);

  const firstName = profile?.full_name?.split(" ")[0] || "uživateli";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Dobré ráno" : hour < 18 ? "Dobré odpoledne" : "Dobrý večer";

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
  }, [user]);

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="px-5 pt-6 pb-4 flex items-center justify-between"
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
            {greeting}
          </p>
          <h1 className="font-display font-bold text-xl mt-1 tracking-tight">
            {firstName}
          </h1>
        </div>
        <button
          onClick={() => navigate("/notifications")}
          className="w-10 h-10 rounded-lg border border-border/50 flex items-center justify-center hover:border-primary/30 transition-colors"
        >
          <Bell className="w-4.5 h-4.5 text-muted-foreground" />
        </button>
      </motion.div>

      {/* Content */}
      <div className="px-5 space-y-5">
        {/* AI Mechanic CTA - minimal */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
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

        {/* Active service order */}
        {activeOrder && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <button
              onClick={() => navigate("/my-service-orders")}
              className="w-full text-left"
            >
              <div className="border border-border/40 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <h3 className="font-display font-semibold text-sm tracking-tight">Aktivní servis</h3>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <ServiceProgressIndicator status={activeOrder.status} compact />
                {activeOrder.description && (
                  <p className="text-xs text-muted-foreground truncate">{activeOrder.description}</p>
                )}
              </div>
            </button>
          </motion.div>
        )}

        {/* Quick Actions */}
        <QuickActions />

        {/* Vehicle Carousel */}
        <VehicleCarousel />

        {/* Vehicle Health */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <VehicleHealthDiagram />
        </motion.div>

        {/* Service Recommendations */}
        <ServiceRecommendations />
      </div>
    </div>
  );
};

export default Dashboard;
