import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Calendar, Fuel, Gauge, Heart, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const mockVehicles = [
  { id: "1", brand: "Chrysler", model: "300C", year: 2021, price: 890000, mileage: 45000, fuel: "Benzín", power: "292 HP", condition: "Výborný", engine: "3.6L V6 Pentastar", transmission: "Automatická 8st", color: "Phantom Black", vin: "2C3CCARG5MH123456", description: "Plně servisované vozidlo v perfektním stavu. Výbava Touring – kožené sedačky, vyhřívání, navigace, kamera." },
  { id: "2", brand: "Jeep", model: "Grand Cherokee L", year: 2023, price: 1650000, mileage: 12000, fuel: "Diesel", power: "264 HP", condition: "Nový", engine: "3.0L V6 EcoDiesel", transmission: "Automatická 8st", color: "Silver Zynith", vin: "1C4RJKBG5P8123456", description: "7místný Grand Cherokee L ve výbavě Overland. Vzduchový podvozek, panorama, audio Harman Kardon." },
  { id: "3", brand: "Dodge", model: "Challenger R/T", year: 2022, price: 1450000, mileage: 8500, fuel: "Benzín", power: "375 HP", condition: "Výborný", engine: "5.7L V8 HEMI", transmission: "Manuální 6st", color: "TorRed", vin: "2C3CDZBT5NH123456", description: "Ikonický muscle car s motorem HEMI V8. Sériový stav, servisní kniha." },
  { id: "4", brand: "RAM", model: "1500 Laramie", year: 2023, price: 1890000, mileage: 5000, fuel: "Diesel", power: "264 HP", condition: "Nový", engine: "3.0L V6 EcoDiesel", transmission: "Automatická 8st", color: "Patriot Blue", vin: "1C6SRFJT5PN123456", description: "Full-size pickup ve výbavě Laramie. Vzduchový podvozek, kožená výbava, 12\" displej." },
  { id: "5", brand: "Jeep", model: "Wrangler Rubicon", year: 2020, price: 1250000, mileage: 32000, fuel: "Benzín", power: "285 HP", condition: "Velmi dobrý", engine: "3.6L V6 Pentastar", transmission: "Automatická 8st", color: "Sarge Green", vin: "1C4HJXCG5LW123456", description: "Rubicon s off-road paketem, lanovým navijákem a LED přídavnými světly." },
];

const VehicleDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const vehicle = mockVehicles.find((v) => v.id === id);

  if (!vehicle) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Vůz nenalezen" showBack />
        <div className="p-4 text-center text-muted-foreground">Tento vůz neexistuje.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <PageHeader title={`${vehicle.brand} ${vehicle.model}`} showBack />

      {/* Hero image placeholder */}
      <div className="h-56 bg-secondary flex items-center justify-center">
        <span className="text-5xl font-display font-bold text-muted-foreground/20">{vehicle.brand}</span>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold">{vehicle.brand} {vehicle.model}</h1>
              <span className="text-sm text-muted-foreground">{vehicle.condition} · {vehicle.year}</span>
            </div>
            <span className="text-2xl font-display font-bold text-gradient">
              {(vehicle.price / 1000).toFixed(0)}tis&nbsp;Kč
            </span>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Calendar, label: "Rok", value: vehicle.year },
              { icon: Gauge, label: "Km", value: `${(vehicle.mileage / 1000).toFixed(0)}tis` },
              { icon: Fuel, label: "Palivo", value: vehicle.fuel },
              { label: "Výkon", value: vehicle.power },
            ].map((stat, i) => (
              <div key={i} className="glass-card p-3 text-center">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-sm font-semibold mt-0.5">{stat.value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Technical */}
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
              <span>{value}</span>
            </div>
          ))}
        </motion.div>

        {/* Description */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-4">
          <h3 className="font-display font-semibold text-sm mb-2">Popis</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{vehicle.description}</p>
        </motion.div>
      </div>

      {/* Fixed bottom CTA */}
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
