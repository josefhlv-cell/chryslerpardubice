/**
 * VehicleInfoCard — jednoduchá karta pro zákazníka.
 * Zobrazuje rozpoznané vozidlo (VIN, značka, model, motor, převodovka, profil).
 * Bez raw dat, bez PIDů, bez debug informací.
 */
import { Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ObdVehicleInfo } from "@/contexts/ObdContext";

const UNKNOWN = "Neznámé";

function confidenceLabel(c?: "low" | "medium" | "high"): string {
  if (c === "high") return "vysoká";
  if (c === "medium") return "střední";
  if (c === "low") return "nízká";
  return UNKNOWN;
}

export function VehicleInfoCard({ info }: { info: ObdVehicleInfo }) {
  const vin = info.vin;
  const profile = info.profile;
  const isChrysler = profile.allowChryslerCustomPids;
  const isVag = profile.id === "vag_can";

  const rows: Array<[string, string]> = [
    ["VIN", vin?.vin || UNKNOWN],
    ["Značka", vin?.brand || UNKNOWN],
    ["Model", UNKNOWN],
    ["Rok", vin?.year ? String(vin.year) : UNKNOWN],
    ["Motor", UNKNOWN],
    ["Převodovka", profile.id === "chrysler_62te" ? "62TE" : UNKNOWN],
    ["Profil", profile.label],
    ["Zdroj", vin?.source || UNKNOWN],
    ["Jistota", confidenceLabel(vin?.confidence)],
  ];

  return (
    <div className="luxury-card p-4 space-y-3">
      <h3 className="font-display font-semibold text-sm flex items-center gap-2">
        <Car className="w-4 h-4 text-primary" />
        Vozidlo
      </h3>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <span className="text-muted-foreground">{k}</span>
            <span className={`font-medium ${v === UNKNOWN ? "text-muted-foreground italic" : ""} ${k === "VIN" ? "font-mono text-[11px] truncate" : ""}`}>
              {v}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {isChrysler && (
          <Badge className="bg-primary/15 text-primary border-0 text-[10px]">
            Chrysler PIDy: aktivní
          </Badge>
        )}
        {isVag && (
          <Badge variant="outline" className="text-[10px]">
            Chrysler PIDy: nepoužity
          </Badge>
        )}
        {profile.id === "unknown" && (
          <Badge variant="outline" className="text-[10px]">
            Profil není rozpoznán — pouze OBD-II
          </Badge>
        )}
      </div>
    </div>
  );
}

export default VehicleInfoCard;
