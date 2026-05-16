import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench, AlertTriangle, CheckCircle } from "lucide-react";

interface Props {
  vehicleId: string;
  currentMileage?: number | null;
}

interface PlanWithStatus {
  id: string;
  service_name: string;
  interval_km: number | null;
  interval_months: number | null;
  last_service_km: number | null;
  last_service_date: string | null;
  recommended_part_oem: string | null;
  status: "ok" | "soon" | "overdue";
  kmRemaining: number | null;
}

const AutoPartRecommendations = ({ vehicleId, currentMileage }: Props) => {
  const [plans, setPlans] = useState<PlanWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("service_plans")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .eq("is_active", true);

      if (data) {
        const now = new Date();
        const evaluated = data.map((p: any) => {
          let status: "ok" | "soon" | "overdue" = "ok";
          let kmRemaining: number | null = null;

          if (p.interval_km && currentMileage && p.last_service_km) {
            const nextKm = p.last_service_km + p.interval_km;
            kmRemaining = nextKm - currentMileage;
            if (kmRemaining <= 0) status = "overdue";
            else if (kmRemaining <= p.interval_km * 0.15) status = "soon";
          }

          if (p.interval_months && p.last_service_date) {
            const lastDate = new Date(p.last_service_date);
            const nextDate = new Date(lastDate);
            nextDate.setMonth(nextDate.getMonth() + p.interval_months);
            const daysLeft = (nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
            if (daysLeft <= 0) status = "overdue";
            else if (daysLeft <= 30 && status !== "overdue") status = "soon";
          }

          return { ...p, status, kmRemaining } as PlanWithStatus;
        });

        // Sort: overdue first, then soon, then ok
        evaluated.sort((a, b) => {
          const order = { overdue: 0, soon: 1, ok: 2 };
          return order[a.status] - order[b.status];
        });

        setPlans(evaluated);
      }
      setLoading(false);
    };
    fetch();
  }, [vehicleId, currentMileage]);

  if (loading || plans.length === 0) return null;

  const actionable = plans.filter(p => p.status !== "ok");
  if (actionable.length === 0) return null;

  return (
    <Card className="border-warning/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-warning" />
          <p className="text-sm font-semibold">Doporučená údržba</p>
        </div>
        <div className="space-y-2">
          {actionable.map(p => (
            <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 min-w-0">
                {p.status === "overdue" ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{p.service_name}</p>
                  {p.kmRemaining !== null && (
                    <p className="text-[10px] text-muted-foreground">
                      {p.kmRemaining <= 0
                        ? `Překročeno o ${Math.abs(p.kmRemaining).toLocaleString("cs")} km`
                        : `Za ${p.kmRemaining.toLocaleString("cs")} km`}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant={p.status === "overdue" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                {p.status === "overdue" ? "Po termínu" : "Blíží se"}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default AutoPartRecommendations;
