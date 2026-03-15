import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, FileDown, Wrench, Filter, Download } from "lucide-react";
import { motion } from "framer-motion";

type Vehicle = {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  engine: string | null;
  vin: string | null;
  current_mileage: number | null;
  license_plate: string | null;
};

type ServiceRecord = {
  id: string;
  vehicle_id: string;
  service_type: string;
  description: string | null;
  parts_used: string | null;
  price: number | null;
  mileage: number | null;
  service_date: string;
  photos: string[] | null;
};

const ServiceBook = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedVehicle = searchParams.get("vehicle");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(preselectedVehicle || "");
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_vehicles").select("*").eq("user_id", user.id).order("created_at").then(({ data }) => {
      setVehicles((data as Vehicle[]) || []);
      if (!selectedVehicleId && data?.length) setSelectedVehicleId(data[0].id);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!selectedVehicleId) { setRecords([]); return; }
    setLoading(true);
    supabase.from("service_history").select("*").eq("vehicle_id", selectedVehicleId).order("service_date", { ascending: false }).then(({ data }) => {
      setRecords((data as ServiceRecord[]) || []);
      setLoading(false);
    });
  }, [selectedVehicleId]);

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const totalCost = records.reduce((sum, r) => sum + (r.price ?? 0), 0);

  const exportPdf = async () => {
    if (!selectedVehicle || !records.length) return;
    setExporting(true);
    const v = selectedVehicle;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Servisní kniha – ${v.brand} ${v.model}</title>
      <style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#333}h1{font-size:20px;border-bottom:2px solid #1a1a2e;padding-bottom:8px}.vi{background:#f5f5f5;padding:12px;border-radius:8px;margin:16px 0}.vi p{margin:4px 0;font-size:13px}.r{border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin:8px 0}.rh{display:flex;justify-content:space-between;margin-bottom:6px}.rh h3{margin:0;font-size:14px}.rh span{font-size:12px;color:#888}.r p{margin:2px 0;font-size:12px;color:#555}.m{display:flex;gap:16px;font-size:12px;color:#666}.f{margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#999;text-align:center}@media print{body{padding:0}}</style></head><body>
      <h1>🔧 Servisní kniha</h1>
      <div class="vi"><p><strong>${v.brand} ${v.model} ${v.year || ""}</strong></p>${v.vin ? `<p>VIN: ${v.vin}</p>` : ""}${v.engine ? `<p>Motor: ${v.engine}</p>` : ""}${v.license_plate ? `<p>SPZ: ${v.license_plate}</p>` : ""}${v.current_mileage ? `<p>Aktuální km: ${v.current_mileage.toLocaleString("cs")}</p>` : ""}</div>
      ${records.map(r => `<div class="r"><div class="rh"><h3>${r.service_type}</h3><span>${new Date(r.service_date).toLocaleDateString("cs-CZ")}</span></div>${r.description ? `<p>${r.description}</p>` : ""}<div class="m">${r.mileage != null ? `<span>${r.mileage.toLocaleString("cs")} km</span>` : ""}${r.price != null ? `<span>${r.price.toLocaleString("cs")} Kč</span>` : ""}</div>${r.parts_used ? `<p>Díly: ${r.parts_used}</p>` : ""}</div>`).join("")}
      <div class="f">Vygenerováno: ${new Date().toLocaleDateString("cs-CZ")} | Chrysler CZ Servisní systém</div></body></html>`;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => { printWindow.print(); setExporting(false); }, 500);
    } else {
      toast({ title: "Povolte vyskakovací okna pro export", variant: "destructive" });
      setExporting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Servisní kniha" />
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Servisní kniha" />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* Vehicle selector — minimal */}
        {vehicles.length > 0 ? (
          <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
            <SelectTrigger className="border-border/40">
              <SelectValue placeholder="Vyberte vozidlo" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.brand} {v.model} {v.year ? `(${v.year})` : ""} {v.license_plate || ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">Nejprve přidejte vozidlo</p>
              <Button size="sm" onClick={() => navigate("/my-vehicles")}>Přidat vozidlo</Button>
            </CardContent>
          </Card>
        )}

        {/* Heading + filter row */}
        {selectedVehicle && (
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-lg">Servisní knížka</h2>
              <p className="text-xs text-muted-foreground">
                {records.length} záznamů · {totalCost.toLocaleString("cs")} Kč celkem
              </p>
            </div>
            <div className="flex items-center gap-2">
              {records.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportPdf} disabled={exporting} className="h-8">
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Filter className="w-3.5 h-3.5" />
                <span className="text-xs">Filtrovat</span>
              </Button>
            </div>
          </div>
        )}

        {/* Records — clean card list with bronze left border */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Žádné servisní záznamy</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {records.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="border-border/40 hover:border-primary/30 transition-colors overflow-hidden">
                  <div className="flex">
                    {/* Bronze left accent */}
                    <div className="w-1 shrink-0 gradient-bronze" />
                    <CardContent className="p-3.5 flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{r.service_type}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(r.service_date).toLocaleDateString("cs-CZ")}
                            {r.description && ` · ${r.description}`}
                          </p>
                        </div>
                        {r.price != null && (
                          <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                            {r.price.toLocaleString("cs")} Kč
                          </span>
                        )}
                      </div>
                      {/* Meta row */}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex gap-3 text-[11px] text-muted-foreground">
                          {r.mileage != null && <span>{r.mileage.toLocaleString("cs")} km</span>}
                          {r.parts_used && <span>{r.parts_used}</span>}
                        </div>
                        <button className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                          <Download className="w-3 h-3" />
                          Protokol
                        </button>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceBook;
