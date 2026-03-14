import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Plus, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import CarIcon from "@/components/CarIcon";

type Vehicle = {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  engine: string | null;
  vin: string | null;
  current_mileage: number | null;
  license_plate: string | null;
};

const VehicleCarousel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_vehicles")
      .select("*")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setVehicles((data as Vehicle[]) || []);
        setLoading(false);
      });
  }, [user]);

  if (loading) return null;

  if (!vehicles.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-base">Moje vozidla</h2>
        </div>
        <button
          onClick={() => navigate("/my-vehicles")}
          className="glass-card w-full p-6 flex flex-col items-center gap-3 hover:border-primary/30 transition-colors"
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-display font-semibold text-sm">Přidat vozidlo</p>
            <p className="text-xs text-muted-foreground mt-1">
              Přidejte své vozidlo pro personalizované služby
            </p>
          </div>
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-base">Moje vozidla</h2>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => navigate("/my-vehicles")}
        >
          Vše <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-hide">
        {vehicles.map((v, i) => (
          <motion.button
            key={v.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + i * 0.08 }}
            onClick={() => navigate(`/my-vehicles`)}
            className="glass-card min-w-[200px] snap-start p-4 flex flex-col gap-3 hover:border-primary/30 transition-all shrink-0"
          >
            <div className="flex items-center gap-3">
              <CarIcon car={v} size="md" />
              <div className="text-left min-w-0">
                <p className="font-display font-semibold text-sm truncate">
                  {v.brand} {v.model}
                </p>
                <p className="text-xs text-muted-foreground">{v.year || ""}</p>
              </div>
            </div>
            {v.current_mileage && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Gauge className="w-3.5 h-3.5" />
                <span>{v.current_mileage.toLocaleString("cs")} km</span>
              </div>
            )}
            {v.license_plate && (
              <div className="bg-secondary/50 rounded-md px-2 py-1 text-xs font-mono text-center tracking-wider">
                {v.license_plate}
              </div>
            )}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
};

export default VehicleCarousel;
