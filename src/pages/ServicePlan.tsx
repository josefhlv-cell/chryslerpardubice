import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Wrench, AlertTriangle, ShoppingCart, CheckCircle, Clock } from "lucide-react";

type Vehicle = {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  engine: string | null;
  current_mileage: number | null;
};

type ServicePlanItem = {
  id: string;
  vehicle_id: string;
  service_name: string;
  interval_km: number | null;
  interval_months: number | null;
  last_service_km: number | null;
  last_service_date: string | null;
  recommended_part_oem: string | null;
  is_active: boolean;
};

type PartInfo = {
  oem_number: string;
  name: string;
  price_with_vat: number;
};

const DEFAULT_PLANS = [
  { service_name: "Výměna motorového oleje", interval_km: 15000, interval_months: 12, recommended_part_oem: null },
  { service_name: "Výměna olejového filtru", interval_km: 15000, interval_months: 12, recommended_part_oem: null },
  { service_name: "Výměna vzduchového filtru", interval_km: 30000, interval_months: 24, recommended_part_oem: null },
  { service_name: "Výměna kabinového filtru", interval_km: 20000, interval_months: 12, recommended_part_oem: null },
  { service_name: "Výměna palivového filtru", interval_km: 60000, interval_months: 48, recommended_part_oem: null },
  { service_name: "Výměna brzdové kapaliny", interval_km: 60000, interval_months: 24, recommended_part_oem: null },
  { service_name: "Výměna chladicí kapaliny", interval_km: 100000, interval_months: 60, recommended_part_oem: null },
  { service_name: "Kontrola brzd", interval_km: 30000, interval_months: 12, recommended_part_oem: null },
  { service_name: "Kontrola podvozku", interval_km: 30000, interval_months: 12, recommended_part_oem: null },
  { service_name: "Kontrola baterie", interval_km: 30000, interval_months: 12, recommended_part_oem: null },
  { service_name: "Kontrola rozvodů", interval_km: 100000, interval_months: 60, recommended_part_oem: null },
];

const ServicePlan = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [plans, setPlans] = useState<ServicePlanItem[]>([]);
  const [parts, setParts] = useState<Record<string, PartInfo>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user]);

  useEffect(() => {
    if (user) {
      supabase.from("user_vehicles").select("id, brand, model, year, engine, current_mileage")
        .eq("user_id", user.id).then(({ data }) => {
          setVehicles((data as Vehicle[]) || []);
          if (data?.length === 1) setSelectedVehicle(data[0].id);
          setLoading(false);
        });
    }
  }, [user]);

  useEffect(() => {
    if (!selectedVehicle) { setPlans([]); return; }
    fetchPlans();
  }, [selectedVehicle]);

  const fetchPlans = async () => {
    setLoading(true);
    const { data } = await supabase.from("service_plans")
      .select("*")
      .eq("vehicle_id", selectedVehicle)
      .eq("is_active", true)
      .order("interval_km", { ascending: true });
    const items = (data as ServicePlanItem[]) || [];
    setPlans(items);

    // Fetch related parts
    const oems = items.map(p => p.recommended_part_oem).filter(Boolean) as string[];
    if (oems.length) {
      const { data: partsData } = await supabase.from("parts_new")
        .select("oem_number, name, price_with_vat")
        .in("oem_number", oems);
      const map: Record<string, PartInfo> = {};
      partsData?.forEach(p => { map[p.oem_number] = p as PartInfo; });
      setParts(map);
    }
    setLoading(false);
  };

  const generatePlan = async () => {
    if (!user || !selectedVehicle) return;
    setGenerating(true);
    const vehicle = vehicles.find(v => v.id === selectedVehicle);
    
    for (const plan of DEFAULT_PLANS) {
      await supabase.from("service_plans").insert({
        vehicle_id: selectedVehicle,
        user_id: user.id,
        ...plan,
      } as any);
    }
    
    toast({ title: "Servisní plán vytvořen", description: `Pro ${vehicle?.brand} ${vehicle?.model}` });
    setGenerating(false);
    fetchPlans();
  };

  const getStatus = (plan: ServicePlanItem) => {
    const vehicle = vehicles.find(v => v.id === selectedVehicle);
    const currentKm = vehicle?.current_mileage || 0;
    const lastKm = plan.last_service_km || 0;
    const intervalKm = plan.interval_km || 999999;
    const kmSinceLast = currentKm - lastKm;
    const remaining = intervalKm - kmSinceLast;

    if (remaining <= 0) return { label: "Překročeno!", color: "destructive" as const, urgent: true };
    if (remaining <= intervalKm * 0.2) return { label: `Zbývá ${remaining.toLocaleString("cs")} km`, color: "secondary" as const, urgent: true };
    return { label: `Zbývá ${remaining.toLocaleString("cs")} km`, color: "outline" as const, urgent: false };
  };

  const vehicle = vehicles.find(v => v.id === selectedVehicle);

  if (authLoading) {
    return <div className="min-h-screen pb-20"><PageHeader title="Servisní plán" />
      <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div></div>;
  }

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Servisní plán" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {vehicles.length > 0 ? (
          <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
            <SelectTrigger><SelectValue placeholder="Vyberte vozidlo" /></SelectTrigger>
            <SelectContent>
              {vehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.brand} {v.model} {v.year || ""} {v.current_mileage ? `(${v.current_mileage.toLocaleString("cs")} km)` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">
            <p>Nejprve přidejte vozidlo</p>
            <Button size="sm" className="mt-2" onClick={() => navigate("/my-vehicles")}>Přidat vozidlo</Button>
          </CardContent></Card>
        )}

        {selectedVehicle && plans.length === 0 && !loading && (
          <Card className="border-primary/30">
            <CardContent className="p-6 text-center">
              <Wrench className="w-8 h-8 mx-auto mb-2 text-primary opacity-60" />
              <p className="text-sm text-muted-foreground mb-3">Pro toto vozidlo ještě nemáte servisní plán</p>
              <Button onClick={generatePlan} disabled={generating}>
                {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wrench className="w-4 h-4 mr-2" />}
                Vytvořit servisní plán
              </Button>
            </CardContent>
          </Card>
        )}

        {loading && selectedVehicle && (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        )}

        {plans.map((plan, i) => {
          const status = getStatus(plan);
          const part = plan.recommended_part_oem ? parts[plan.recommended_part_oem] : null;
          return (
            <motion.div key={plan.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className={status.urgent ? "border-destructive/40" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {status.urgent ? <AlertTriangle className="w-4 h-4 text-destructive shrink-0" /> : <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                        <p className="font-semibold text-sm">{plan.service_name}</p>
                      </div>
                      <div className="flex gap-2 mt-1.5 flex-wrap">
                        <Badge variant={status.color}>{status.label}</Badge>
                        {plan.interval_km && <Badge variant="outline" className="text-[10px]">každých {plan.interval_km.toLocaleString("cs")} km</Badge>}
                        {plan.interval_months && <Badge variant="outline" className="text-[10px]">každých {plan.interval_months} měs.</Badge>}
                      </div>
                      {plan.last_service_date && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          <Clock className="w-3 h-3 inline mr-0.5" />
                          Poslední: {new Date(plan.last_service_date).toLocaleDateString("cs-CZ")}
                          {plan.last_service_km ? ` při ${plan.last_service_km.toLocaleString("cs")} km` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  {part && (
                    <div className="mt-2 p-2 rounded bg-muted/50 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium">{part.name}</p>
                        <p className="text-[10px] text-muted-foreground">OEM: {part.oem_number} · {part.price_with_vat?.toLocaleString("cs")} Kč</p>
                      </div>
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate("/shop")}>
                        <ShoppingCart className="w-3 h-3 mr-1" />Objednat
                      </Button>
                    </div>
                  )}
                  {status.urgent && (
                    <Button size="sm" variant="hero" className="w-full mt-2 text-xs" onClick={() => navigate("/service")}>
                      <Wrench className="w-3.5 h-3.5 mr-1" />Objednat servis
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default ServicePlan;
