import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Calendar, Fuel, Gauge, ArrowDownUp, ExternalLink } from "lucide-react";
import { fetchVehicles } from "@/lib/api";

const Vehicles = () => {
  const navigate = useNavigate();
  const [brandFilter, setBrandFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles", brandFilter, searchQuery],
    queryFn: () => fetchVehicles({ brand: brandFilter, search: searchQuery }),
  });

  return (
    <div className="min-h-screen pb-20">
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-display text-2xl font-bold">Vozy k prodeji</h1>
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => navigate("/vehicle-offer")}>
              <ArrowDownUp className="w-3.5 h-3.5" />
              Výkup / Dovoz
            </Button>
          </div>
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
                <SelectItem value="RAM">RAM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Načítám vozy...</div>
        ) : (
          <div className="space-y-3">
            {vehicles.map((vehicle, i) => (
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
                    src={vehicle.images?.[0] || "/placeholder.svg"}
                    alt={`${vehicle.brand} ${vehicle.model}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
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
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{vehicle.year}</span>
                    {vehicle.mileage && <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{(vehicle.mileage / 1000).toFixed(0)}tis km</span>}
                    {vehicle.fuel && <span className="flex items-center gap-1"><Fuel className="w-3 h-3" />{vehicle.fuel}</span>}
                    {vehicle.power && <span>{vehicle.power}</span>}
                    {vehicle.listing_url && (
                      <a
                        href={vehicle.listing_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />chrysler.cz
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!isLoading && vehicles.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Žádné vozy nenalezeny</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Vehicles;
