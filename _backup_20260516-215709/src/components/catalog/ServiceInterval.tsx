/**
 * ServiceInterval Component
 * Displays service interval status for user's vehicles.
 * Uses km_start-based calculation logic from serviceAPI.
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, AlertTriangle, Clock, ChevronDown, ChevronRight, Calendar, Gauge } from "lucide-react";
import CarIcon from "@/components/CarIcon";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  getAllVehicleReports,
  type VehicleServiceReport,
  type ServiceDueItem,
  type ServiceUrgency,
} from "@/api/serviceAPI";

// ---- Urgency styling ----

const urgencyConfig: Record<ServiceUrgency, { color: string; bg: string; border: string; label: string; progressColor: string }> = {
  due: {
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/30",
    label: "Nutný servis",
    progressColor: "bg-destructive",
  },
  soon: {
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/30",
    label: "Brzy",
    progressColor: "bg-warning",
  },
  ok: {
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    label: "V pořádku",
    progressColor: "bg-green-500",
  },
};

// ---- Sub-components ----

const ServiceItemRow = ({ item }: { item: ServiceDueItem }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = urgencyConfig[item.urgency];

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-foreground/5 transition-colors"
      >
        {item.urgency === "due" && <AlertTriangle className={`w-4 h-4 ${cfg.color} shrink-0`} />}
        {item.urgency === "soon" && <Clock className={`w-4 h-4 ${cfg.color} shrink-0`} />}
        {item.urgency === "ok" && <Wrench className={`w-4 h-4 ${cfg.color} shrink-0`} />}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.plan.service_name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className={`text-[10px] ${cfg.color} border-current/30`}>
              {cfg.label}
            </Badge>
            {item.kmRemaining !== null && (
              <span className="text-[10px] text-muted-foreground">
                {item.kmRemaining <= 0
                  ? `Překročeno o ${Math.abs(item.kmRemaining).toLocaleString("cs")} km`
                  : `za ${item.kmRemaining.toLocaleString("cs")} km`}
              </span>
            )}
            {item.daysRemaining !== null && (
              <span className="text-[10px] text-muted-foreground">
                {item.daysRemaining <= 0
                  ? "Prošlý termín"
                  : `za ${item.daysRemaining} dní`}
              </span>
            )}
          </div>
        </div>

        {/* Progress bar mini */}
        <div className="w-16 shrink-0">
          <Progress value={item.progressPercent} className="h-1.5" />
        </div>

        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <Separator />
            <div className="p-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Efektivní km:</span>
                <p className="font-medium">{item.effectiveKm.toLocaleString("cs")} km</p>
              </div>
              <div>
                <span className="text-muted-foreground">Poslední servis km:</span>
                <p className="font-medium">
                  {item.effectiveLastServiceKm > 0
                    ? `${item.effectiveLastServiceKm.toLocaleString("cs")} km`
                    : "—"}
                </p>
              </div>
              {item.plan.interval_km && (
                <div>
                  <span className="text-muted-foreground">Interval:</span>
                  <p className="font-medium">{item.plan.interval_km.toLocaleString("cs")} km</p>
                </div>
              )}
              {item.plan.interval_months && (
                <div>
                  <span className="text-muted-foreground">Interval:</span>
                  <p className="font-medium">{item.plan.interval_months} měsíců</p>
                </div>
              )}
              {item.dueAtKm !== null && (
                <div>
                  <span className="text-muted-foreground">Servis při:</span>
                  <p className="font-medium">{item.dueAtKm.toLocaleString("cs")} km</p>
                </div>
              )}
              {item.plan.last_service_date && (
                <div>
                  <span className="text-muted-foreground">Poslední datum:</span>
                  <p className="font-medium">{new Date(item.plan.last_service_date).toLocaleDateString("cs-CZ")}</p>
                </div>
              )}
              {item.plan.recommended_part_oem && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Doporučený díl:</span>
                  <p className="font-mono font-medium">{item.plan.recommended_part_oem}</p>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-muted-foreground">Průběh intervalu:</span>
                <div className="mt-1">
                  <Progress value={item.progressPercent} className="h-2" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.progressPercent}%</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const VehicleServiceCard = ({ report }: { report: VehicleServiceReport }) => {
  const [showHistory, setShowHistory] = useState(false);
  const dueCount = report.items.filter((i) => i.urgency === "due").length;
  const soonCount = report.items.filter((i) => i.urgency === "soon").length;

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-3">
        {/* Vehicle header */}
        <div className="flex items-center gap-3">
          <CarIcon car={report.vehicle} size="md" />
          <div className="flex-1 min-w-0">
            <h4 className="font-display font-semibold text-sm">
              {report.vehicle.brand} {report.vehicle.model} {report.vehicle.year || ""}
            </h4>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Gauge className="w-3 h-3" />
              {report.vehicle.current_mileage?.toLocaleString("cs") || "?"} km
              <span className="opacity-50">·</span>
              <span>start: {report.vehicle.km_start.toLocaleString("cs")} km</span>
              {report.vehicle.vin && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="font-mono">{report.vehicle.vin}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            {dueCount > 0 && (
              <Badge className="bg-destructive text-destructive-foreground text-[10px]">{dueCount} urgentní</Badge>
            )}
            {soonCount > 0 && (
              <Badge className="bg-warning text-warning-foreground text-[10px]">{soonCount} brzy</Badge>
            )}
          </div>
        </div>

        {/* Service items */}
        {(report.vehicle.current_mileage ?? 0) < report.vehicle.km_start ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Aktuální km ({(report.vehicle.current_mileage ?? 0).toLocaleString("cs")}) je nižší než km_start ({report.vehicle.km_start.toLocaleString("cs")}). Servisní intervaly se zobrazí po aktualizaci stavu km.
          </p>
        ) : report.items.length > 0 ? (
          <div className="space-y-2">
            {report.items.map((item) => (
              <ServiceItemRow key={item.plan.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-3">
            Žádné servisní plány. Přidejte je v nastavení vozidla.
          </p>
        )}

        {/* History toggle */}
        {report.history.length > 0 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => setShowHistory(!showHistory)}
            >
              <Calendar className="w-3.5 h-3.5 mr-1" />
              Historie servisů ({report.history.length})
              <ChevronRight className={`w-3.5 h-3.5 ml-1 transition-transform ${showHistory ? "rotate-90" : ""}`} />
            </Button>

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1.5">
                    {report.history.slice(0, 10).map((entry) => (
                      <div key={entry.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 text-xs">
                        <span className="text-muted-foreground shrink-0">
                          {new Date(entry.service_date).toLocaleDateString("cs-CZ")}
                        </span>
                        <span className="font-medium truncate flex-1">{entry.service_type}</span>
                        {entry.mileage && (
                          <span className="text-muted-foreground shrink-0">{entry.mileage.toLocaleString("cs")} km</span>
                        )}
                        {entry.price !== null && (
                          <span className="font-medium shrink-0">{entry.price.toLocaleString("cs")} Kč</span>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ---- Main Component ----

const ServiceInterval = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState<VehicleServiceReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    getAllVehicleReports(user.id)
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return null;
  if (!user) return null;
  if (reports.length === 0) return null;

  const totalDue = reports.reduce((sum, r) => sum + r.items.filter((i) => i.urgency === "due").length, 0);
  const totalSoon = reports.reduce((sum, r) => sum + r.items.filter((i) => i.urgency === "soon").length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          <h3 className="font-display font-semibold">Servisní intervaly</h3>
        </div>
        <div className="flex gap-1.5">
          {totalDue > 0 && (
            <Badge className="bg-destructive text-destructive-foreground text-xs">{totalDue} urgentní</Badge>
          )}
          {totalSoon > 0 && (
            <Badge className="bg-warning text-warning-foreground text-xs">{totalSoon} brzy</Badge>
          )}
          {totalDue === 0 && totalSoon === 0 && (
            <Badge className="bg-green-500/20 text-green-400 text-xs">Vše v pořádku</Badge>
          )}
        </div>
      </div>

      {/* Vehicle reports */}
      <div className="space-y-3">
        {reports.map((report) => (
          <VehicleServiceCard key={report.vehicle.id} report={report} />
        ))}
      </div>
    </div>
  );
};

export default ServiceInterval;
