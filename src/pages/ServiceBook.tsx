import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, FileDown, Wrench, Calendar, Gauge, Package, ChevronDown, ChevronUp } from "lucide-react";
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
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
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

  const exportPdf = async () => {
    if (!selectedVehicle || !records.length) return;
    setExporting(true);

    // Generate a printable HTML and use browser print
    const v = selectedVehicle;
    const html = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Servisní kniha – ${v.brand} ${v.model}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
        h1 { font-size: 20px; border-bottom: 2px solid #1a1a2e; padding-bottom: 8px; }
        .vehicle-info { background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 16px 0; }
        .vehicle-info p { margin: 4px 0; font-size: 13px; }
        .record { border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px; margin: 8px 0; }
        .record-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .record-header h3 { margin: 0; font-size: 14px; }
        .record-header span { font-size: 12px; color: #888; }
        .record p { margin: 2px 0; font-size: 12px; color: #555; }
        .meta { display: flex; gap: 16px; font-size: 12px; color: #666; }
        .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #999; text-align: center; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>🔧 Servisní kniha</h1>
      <div class="vehicle-info">
        <p><strong>${v.brand} ${v.model} ${v.year || ""}</strong></p>
        ${v.vin ? `<p>VIN: ${v.vin}</p>` : ""}
        ${v.engine ? `<p>Motor: ${v.engine}</p>` : ""}
        ${v.license_plate ? `<p>SPZ: ${v.license_plate}</p>` : ""}
        ${v.current_mileage ? `<p>Aktuální km: ${v.current_mileage.toLocaleString("cs")}</p>` : ""}
      </div>
      ${records.map(r => `
        <div class="record">
          <div class="record-header">
            <h3>${r.service_type}</h3>
            <span>${new Date(r.service_date).toLocaleDateString("cs-CZ")}</span>
          </div>
          ${r.description ? `<p>${r.description}</p>` : ""}
          <div class="meta">
            ${r.mileage != null ? `<span>${r.mileage.toLocaleString("cs")} km</span>` : ""}
            ${r.price != null ? `<span>${r.price.toLocaleString("cs")} Kč</span>` : ""}
          </div>
          ${r.parts_used ? `<p>Díly: ${r.parts_used}</p>` : ""}
        </div>
      `).join("")}
      <div class="footer">Vygenerováno: ${new Date().toLocaleDateString("cs-CZ")} | Chrysler CZ Servisní systém</div>
      </body></html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
        setExporting(false);
      }, 500);
    } else {
      toast({ title: "Povolte vyskakovací okna pro export", variant: "destructive" });
      setExporting(false);
    }
  };

  const totalCost = records.reduce((sum, r) => sum + (r.price ?? 0), 0);

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
        {/* Vehicle selector */}
        {vehicles.length > 0 ? (
          <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
            <SelectTrigger>
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

        {/* Vehicle summary */}
        {selectedVehicle && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3">
              <p className="font-display font-semibold text-sm">{selectedVehicle.brand} {selectedVehicle.model} {selectedVehicle.year || ""}</p>
              <div className="flex gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                {selectedVehicle.vin && <span>VIN: {selectedVehicle.vin}</span>}
                {selectedVehicle.engine && <span>{selectedVehicle.engine}</span>}
                {selectedVehicle.current_mileage != null && <span>{selectedVehicle.current_mileage.toLocaleString("cs")} km</span>}
              </div>
              {records.length > 0 && (
                <div className="flex gap-4 mt-2 text-xs">
                  <span>Záznamů: <strong>{records.length}</strong></span>
                  <span>Celkem: <strong>{totalCost.toLocaleString("cs")} Kč</strong></span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Export button */}
        {records.length > 0 && (
          <Button variant="outline" size="sm" className="w-full" onClick={exportPdf} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
            Exportovat servisní knihu (PDF)
          </Button>
        )}

        {/* Timeline */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Žádné servisní záznamy</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

            <div className="space-y-0">
              {records.map((r, i) => {
                const isExpanded = expandedRecord === r.id;
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="relative pl-10 pb-4"
                  >
                    {/* Timeline dot */}
                    <div className="absolute left-[11px] top-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />

                    <Card
                      className="cursor-pointer hover:border-primary/30 transition-colors"
                      onClick={() => setExpandedRecord(isExpanded ? null : r.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Wrench className="w-3.5 h-3.5 text-primary shrink-0" />
                              <p className="font-semibold text-sm truncate">{r.service_type}</p>
                            </div>
                            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(r.service_date).toLocaleDateString("cs-CZ")}
                              </span>
                              {r.mileage != null && (
                                <span className="flex items-center gap-1">
                                  <Gauge className="w-3 h-3" />
                                  {r.mileage.toLocaleString("cs")} km
                                </span>
                              )}
                              {r.price != null && (
                                <span className="font-medium text-foreground">{r.price.toLocaleString("cs")} Kč</span>
                              )}
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>

                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-3 pt-3 border-t space-y-2"
                          >
                            {r.description && (
                              <p className="text-xs text-muted-foreground">{r.description}</p>
                            )}
                            {r.parts_used && (
                              <div className="flex items-start gap-1.5">
                                <Package className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                                <p className="text-xs text-muted-foreground">{r.parts_used}</p>
                              </div>
                            )}
                            {r.photos && r.photos.length > 0 && (
                              <div className="flex gap-1.5 flex-wrap">
                                {r.photos.map((url, pi) => (
                                  <img
                                    key={pi}
                                    src={url}
                                    alt="Foto"
                                    className="w-20 h-20 rounded object-cover border cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); window.open(url, "_blank"); }}
                                  />
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceBook;
