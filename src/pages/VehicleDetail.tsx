import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Calendar, Fuel, Gauge, Heart, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const mockVehicles = [
  { id: "1", brand: "Dodge", model: "Grand Caravan 3.6 SXT", year: 2018, price: 385000, mileage: 82582, fuel: "Benzín", power: "283 HP", condition: "Výborný", engine: "3.6L V6 Pentastar", transmission: "Automatická 6st", color: "Černá", vin: "2C4RDGCG5JR123456", description: "SXT S type Crew – 7 míst, kožené sedačky, zadní kamera, dvouzónová klimatizace. Servisní kniha.", image: "/images/vehicles/dodge-grand-caravan.jpg" },
  { id: "2", brand: "Chrysler", model: "Pacifica 3.6 Touring", year: 2017, price: 398000, mileage: 207798, fuel: "Benzín", power: "287 HP", condition: "Dobrý", engine: "3.6L V6 Pentastar", transmission: "Automatická 9st", color: "Bílá", vin: "2C4RC1BG5HR123456", description: "Touring – 8 míst, Stow'n Go sedadla, touchscreen 8.4\", Apple CarPlay.", image: "/images/vehicles/chrysler-pacifica.jpg" },
  { id: "3", brand: "Dodge", model: "Durango 5.7 HEMI RT AWD", year: 2021, price: 860000, mileage: 150140, fuel: "Benzín", power: "360 HP", condition: "Výborný", engine: "5.7L V8 HEMI MDS", transmission: "Automatická 8st", color: "Šedá metalíza", vin: "1C4SDJCT5MC123456", description: "RT AWD 4x4 – Limitovaná edice, kožená výbava, Uconnect 10.1\", vzduchový podvozek, tažné.", image: "/images/vehicles/dodge-durango.jpg" },
  { id: "4", brand: "Chrysler", model: "Town & Country 3.6 LPG", year: 2014, price: 398000, mileage: 115729, fuel: "LPG", power: "283 HP", condition: "Dobrý", engine: "3.6L V6 Pentastar + LPG", transmission: "Automatická 6st", color: "Stříbrná", vin: "2C4RC1CG5ER123456", description: "Limited – DVD pro zadní cestující, kožené sedačky, navigace, Stow'n Go.", image: "/images/vehicles/chrysler-town-country.jpg" },
  { id: "5", brand: "Dodge", model: "Grand Caravan 3.6 RT LPG", year: 2014, price: 389000, mileage: 178000, fuel: "LPG", power: "283 HP", condition: "Dobrý", engine: "3.6L V6 Pentastar + LPG", transmission: "Automatická 6st", color: "Černá", vin: "2C4RDGCG5ER789012", description: "RT – sportovní paket, 7 míst, LPG přestavba, dvouzónová klimatizace.", image: "/images/vehicles/dodge-grand-caravan-rt.jpg" },
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

      {/* Hero image */}
      <div className="relative h-56 overflow-hidden">
        <img
          src={vehicle.image}
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
              <span className="text-sm text-muted-foreground">{vehicle.condition} · {vehicle.year}</span>
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
              { icon: Gauge, label: "Km", value: `${(vehicle.mileage / 1000).toFixed(0)}tis` },
              { icon: Fuel, label: "Palivo", value: vehicle.fuel },
              { label: "Výkon", value: vehicle.power },
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
              <span className="text-right">{value}</span>
            </div>
          ))}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-4">
          <h3 className="font-display font-semibold text-sm mb-2">Popis</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{vehicle.description}</p>
        </motion.div>
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
