import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Bell, MessageCircle } from "lucide-react";
import QuickActions from "./QuickActions";
import VehicleCarousel from "./VehicleCarousel";
import ServiceRecommendations from "@/components/ServiceRecommendations";
import TondaAvatar from "@/components/TondaAvatar";

const Dashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const firstName = profile?.full_name?.split(" ")[0] || "uživateli";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Dobré ráno" : hour < 18 ? "Dobré odpoledne" : "Dobrý večer";

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-5 pt-4 pb-2 flex items-center justify-between"
      >
        <div>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            {greeting}
          </p>
          <h1 className="font-display font-bold text-xl mt-0.5">
            {firstName} 👋
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate("/notifications")}
            className="p-2 rounded-lg hover:bg-secondary transition-colors relative"
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </motion.div>

      {/* Content */}
      <div className="px-5 space-y-6 mt-2">
        {/* AI Mechanic CTA */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => navigate("/ai-mechanic")}
          className="w-full glass-card p-3.5 flex items-center gap-3 hover:border-primary/30 transition-all"
        >
          <TondaAvatar size="sm" />
          <div className="text-left flex-1 min-w-0">
            <p className="font-display font-semibold text-sm">
              Zeptejte se Tondy
            </p>
            <p className="text-xs text-muted-foreground truncate">
              AI mechanik poradí s čímkoli
            </p>
          </div>
          <MessageCircle className="w-4 h-4 text-primary shrink-0" />
        </motion.button>

        {/* Quick Actions */}
        <QuickActions />

        {/* Vehicle Carousel */}
        <VehicleCarousel />

        {/* Service Recommendations */}
        <ServiceRecommendations />
      </div>
    </div>
  );
};

export default Dashboard;
