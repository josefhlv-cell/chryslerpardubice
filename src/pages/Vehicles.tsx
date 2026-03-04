import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Calendar, Fuel, Gauge } from "lucide-react";

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  fuel: string;
  power: string;
  condition: string;
  image: string;
  sale?: { original: number };
}

const mockVehicles: Vehicle[] = [
  { id: "1", brand: "Dodge", model: "Grand Caravan 3.6 SXT", year: 2018, price: 385000, mileage: 82582, fuel: "Benzín", power: "283 HP", condition: "Výborný", image: "/images/vehicles/dodge-grand-caravan.jpg", sale: { original: 399000 } },
  { id: "2", brand: "Chrysler", model: "Pacifica 3.6 Touring", year: 2017, price: 398000, mileage: 207798, fuel: "Benzín", power: "287 HP", condition: "Dobrý", image: "/images/vehicles/chrysler-pacifica.jpg" },
  { id: "3", brand: "Dodge", model: "Durango 5.7 HEMI RT AWD", year: 2021, price: 860000, mileage: 150140, fuel: "Benzín", power: "360 HP", condition: "Výborný", image: "/images/vehicles/dodge-durango.jpg", sale: { original: 879000 } },
  { id: "4", brand: "Chrysler", model: "Town & Country 3.6 LPG", year: 2014, price: 398000, mileage: 115729, fuel: "LPG", power: "283 HP", condition: "Dobrý", image: "/images/vehicles/chrysler-town-country.jpg" },
  { id: "5", brand: "Dodge", model: "Grand Caravan 3.6 RT LPG", year: 2014, price: 389000, mileage: 178000, fuel: "LPG", power: "283 HP", condition: "Dobrý", image: "/images/vehicles/dodge-grand-caravan-rt.jpg" },
];

const Vehicles = () => {
  const navigate = useNavigate();
  const [brandFilter, setBrandFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = mockVehicles.filter((v) => {
    if (brandFilter !== "all" && v.brand !== brandFilter) return false;
    if (searchQuery && !`${v.brand} ${v.model}`.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen pb-20">
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold mb-3">Vozy k prodeji</h1>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Hledat vůz..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Vše</SelectItem>
                <SelectItem value="Chrysler">Chrysler</SelectItem>
                <SelectItem value="Dodge">Dodge</SelectItem>
                <SelectItem value="Jeep">Jeep</SelectItem>
                <SelectItem value="RAM">RAM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.div>

        <div className="space-y-3">
          {filtered.map((vehicle, i) => (
            <motion.div
              key={vehicle.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => navigate(`/vehicles/${vehicle.id}`)}
              className="glass-card overflow-hidden cursor-pointer hover:border-primary/40 transition-all duration-300 group"
            >
              <div className="relative h-44 overflow-hidden">
                <img
                  src={vehicle.image}
                  alt={`${vehicle.brand} ${vehicle.model}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                {vehicle.sale && (
                  <div className="absolute top-3 left-3 gradient-accent px-2.5 py-1 rounded-lg text-xs font-bold text-accent-foreground shadow-lg">
                    SLEVA
                  </div>
                )}
              </div>
              <div className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold text-sm truncate">{vehicle.brand} {vehicle.model}</h3>
                    <span className="text-xs text-muted-foreground">{vehicle.condition}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-lg font-display font-bold text-gradient">
                      {(vehicle.price / 1000).toFixed(0)}tis Kč
                    </span>
                    {vehicle.sale && (
                      <p className="text-[10px] text-muted-foreground line-through">
                        {(vehicle.sale.original / 1000).toFixed(0)}tis Kč
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{vehicle.year}</span>
                  <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{(vehicle.mileage / 1000).toFixed(0)}tis km</span>
                  <span className="flex items-center gap-1"><Fuel className="w-3 h-3" />{vehicle.fuel}</span>
                  <span>{vehicle.power}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Žádné vozy nenalezeny</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Vehicles;
