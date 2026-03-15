import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Car, BookOpen, FileText, Activity, AlertTriangle, 
  Cpu, MessageCircle, ChevronRight, Wrench, Shield
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import TondaAvatar from "@/components/TondaAvatar";
import CarIcon from "@/components/CarIcon";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import ServiceProgressIndicator from "@/components/ServiceProgressIndicator";
import VehicleCarousel from "@/components/dashboard/VehicleCarousel";
import ServiceRecommendations from "@/components/ServiceRecommendations";

const Garage = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [activeOrder, setActiveOrder] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_vehicles").select("*").eq("user_id", user.id).order("created_at", { ascending: true })
      .then(({ data }) => { if (data) setVehicles(data); });
    supabase.from("service_orders").select("*").eq("user_id", user.id).neq("status", "completed")
      .order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.length) setActiveOrder(data[0]); });
  }, [user]);

  const garageItems = [
    { path: "/my-vehicles", label: "Moje vozidla", sub: `${vehicles.length} vozidel`, icon: Car, color: "text-primary" },
    { path: "/my-service-orders", label: "Servisní zakázky", sub: activeOrder ? "Aktivní zakázka" : "Žádné aktivní", icon: FileText, color: "text-primary" },
    { path: "/service-book", label: "Servisní knížka", sub: "Historie servisu", icon: BookOpen, color: "text-primary" },
    { path: "/service-plan", label: "Plán údržby", sub: "Intervaly a připomínky", icon: Wrench, color: "text-primary" },
    { path: "/obd", label: "OBD Diagnostika", sub: "Bluetooth diagnostika", icon: Activity, color: "text-primary" },
    { path: "/epc", label: "EPC Diagramy", sub: "Technické schémata", icon: Cpu, color: "text-primary" },
    { path: "/emergency", label: "SOS Pomoc", sub: "Nouzová asistence", icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold tracking-tight">Virtuální garáž</h1>
          <p className="text-xs text-muted-foreground mt-1">Vaše vozidla, servis a nástroje</p>
        </motion.div>

        {/* Primary vehicle card */}
        {vehicles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass-card-elevated overflow-hidden"
          >
            <button onClick={() => navigate("/my-vehicles")} className="w-full text-left">
              <div className="flex items-center gap-4 p-4">
                <CarIcon car={vehicles[0]} size="md" className="!w-24 !h-14 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm truncate">
                    {vehicles[0].brand} {vehicles[0].model}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {vehicles[0].year} · {vehicles[0].current_mileage ? `${(vehicles[0].current_mileage / 1000).toFixed(0)}tis km` : "—"}
                  </p>
                  {vehicles[0].vin && (
                    <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 truncate">{vehicles[0].vin}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </button>
            {activeOrder && (
              <button
                onClick={() => navigate("/my-service-orders")}
                className="w-full border-t border-border/30 px-4 py-3 flex items-center gap-3 hover:bg-card/80 transition-colors"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-medium flex-1 text-left">Aktivní servis</span>
                <ServiceProgressIndicator status={activeOrder.status} compact className="flex-1" />
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </motion.div>
        )}

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
            <p className="font-display font-semibold text-sm tracking-tight">AI Mechanik Tonda</p>
            <p className="text-xs text-muted-foreground mt-0.5">Poradí s diagnostikou i opravou</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </motion.button>

        {/* Garage items grid */}
        <div className="space-y-2">
          {garageItems.map((item, i) => (
            <motion.button
              key={item.path}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.04 }}
              onClick={() => navigate(item.path)}
              className="w-full glass-card p-4 flex items-center gap-3.5 hover:border-primary/30 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <item.icon className={`w-5 h-5 ${item.color}`} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-[11px] text-muted-foreground">{item.sub}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </motion.button>
          ))}
        </div>

        {/* Orders & notifications */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-2 gap-2"
        >
          <button
            onClick={() => navigate("/orders")}
            className="glass-card p-3.5 text-left hover:border-primary/30 transition-all"
          >
            <p className="text-xs font-medium">Objednávky</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Historie nákupů</p>
          </button>
          <button
            onClick={() => navigate("/notifications")}
            className="glass-card p-3.5 text-left hover:border-primary/30 transition-all"
          >
            <p className="text-xs font-medium">Notifikace</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Upozornění</p>
          </button>
        </motion.div>

        {isAdmin && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            onClick={() => navigate("/admin")}
            className="w-full glass-card p-4 flex items-center gap-3.5 hover:border-primary/30 transition-all"
          >
            <Shield className="w-5 h-5 text-primary" />
            <div className="text-left flex-1">
              <p className="text-sm font-medium">Admin Panel</p>
              <p className="text-[10px] text-muted-foreground">Správa aplikace</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </motion.button>
        )}
      </div>
    </div>
  );
};

export default Garage;
