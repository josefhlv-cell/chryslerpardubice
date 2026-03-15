import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Calendar, Fuel, Gauge, Heart, MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchVehicleById, createVehicleInquiry } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const VehicleDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: vehicle, isLoading, error } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => fetchVehicleById(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Načítám..." showBack />
        <div className="p-4 text-center text-muted-foreground">Načítám detail vozu...</div>
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Vůz nenalezen" showBack />
        <div className="p-4 text-center text-muted-foreground">Tento vůz neexistuje.</div>
      </div>
    );
  }

  const heroImage = vehicle.images?.[0] || "/placeholder.svg";

  return (
    <div className="min-h-screen pb-24">
      <PageHeader title={`${vehicle.brand} ${vehicle.model}`} showBack />

      {/* Hero image */}
      <div className="relative h-56 overflow-hidden">
        <img
          src={heroImage}
          alt={`${vehicle.brand} ${vehicle.model}`}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto -mt-8 relative z-10">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-display font-bold">{vehicle.brand} {vehicle.model}</h1>
              <span className="text-sm text-muted-foreground">{vehicle.condition || "—"} · {vehicle.year}</span>
            </div>
            <span className="text-2xl font-display font-bold text-gradient">
              {(vehicle.price / 1000).toFixed(0)}tis Kč
            </span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Calendar, label: "Rok", value: vehicle.year },
              { icon: Gauge, label: "Km", value: vehicle.mileage ? `${(vehicle.mileage / 1000).toFixed(0)}tis` : "—" },
              { icon: Fuel, label: "Palivo", value: vehicle.fuel || "—" },
              { label: "Výkon", value: vehicle.power || "—" },
            ].map((stat, i) => (
              <div key={i} className="glass-card p-3 text-center">
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                <p className="text-xs font-semibold mt-0.5">{String(stat.value)}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-4 space-y-2">
          <h3 className="font-display font-semibold text-sm mb-3">Technické údaje</h3>
          {[
            ["Motor", vehicle.engine],
            ["Převodovka", vehicle.transmission],
            ["Barva", vehicle.color],
            ["VIN", vehicle.vin],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-right">{value || "—"}</span>
            </div>
          ))}
        </motion.div>

        {vehicle.description && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-4">
            <h3 className="font-display font-semibold text-sm mb-2">Popis</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{vehicle.description}</p>
          </motion.div>
        )}

        {/* Gallery */}
        {vehicle.images && vehicle.images.length > 1 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <h3 className="font-display font-semibold text-sm mb-2">Galerie</h3>
            <div className="grid grid-cols-3 gap-2">
              {vehicle.images.slice(1).map((img, i) => (
                <div key={i} className="aspect-video rounded-lg overflow-hidden">
                  <img src={img} alt={`${vehicle.brand} ${vehicle.model} ${i + 2}`} className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background/95 backdrop-blur-xl border-t border-border">
        <div className="flex gap-3 max-w-lg mx-auto">
          <Button variant="outline" size="lg" className="shrink-0" onClick={() => toast.success("Přidáno do oblíbených")}>
            <Heart className="w-5 h-5" />
          </Button>
          <Button variant="hero" size="lg" className="flex-1" onClick={() => toast.success("Poptávka odeslána! Budeme vás kontaktovat.")}>
            <MessageSquare className="w-4 h-4" />
            Mám zájem
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VehicleDetail;
