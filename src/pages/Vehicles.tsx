import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
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
}

const mockVehicles: Vehicle[] = [
  { id: "1", brand: "Chrysler", model: "300C", year: 2021, price: 890000, mileage: 45000, fuel: "Benzín", power: "292 HP", condition: "Výborný", image: "" },
  { id: "2", brand: "Jeep", model: "Grand Cherokee L", year: 2023, price: 1650000, mileage: 12000, fuel: "Diesel", power: "264 HP", condition: "Nový", image: "" },
  { id: "3", brand: "Dodge", model: "Challenger R/T", year: 2022, price: 1450000, mileage: 8500, fuel: "Benzín", power: "375 HP", condition: "Výborný", image: "" },
  { id: "4", brand: "RAM", model: "1500 Laramie", year: 2023, price: 1890000, mileage: 5000, fuel: "Diesel", power: "264 HP", condition: "Nový", image: "" },
  { id: "5", brand: "Jeep", model: "Wrangler Rubicon", year: 2020, price: 1250000, mileage: 32000, fuel: "Benzín", power: "285 HP", condition: "Velmi dobrý", image: "" },
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
      <PageHeader title="Vozy k prodeji" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Hledat vůz..." className="pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vše</SelectItem>
              <SelectItem value="Chrysler">Chrysler</SelectItem>
              <SelectItem value="Jeep">Jeep</SelectItem>
              <SelectItem value="Dodge">Dodge</SelectItem>
              <SelectItem value="RAM">RAM</SelectItem>
            </SelectContent>
          </Select>
        </motion.div>

        <div className="space-y-3">
          {filtered.map((vehicle, i) => (
            <motion.div
              key={vehicle.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => navigate(`/vehicles/${vehicle.id}`)}
              className="glass-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
            >
              <div className="h-40 bg-secondary flex items-center justify-center">
                <span className="text-4xl font-display font-bold text-muted-foreground/30">
                  {vehicle.brand}
                </span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display font-semibold">{vehicle.brand} {vehicle.model}</h3>
                    <span className="text-xs text-muted-foreground">{vehicle.condition}</span>
                  </div>
                  <span className="text-lg font-display font-bold text-gradient">
                    {(vehicle.price / 1000).toFixed(0)}tis Kč
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
