import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, Phone, Eye, User } from "lucide-react";
import CarIcon from "@/components/CarIcon";

type FaultReport = {
  id: string;
  user_id: string;
  vin: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_engine: string | null;
  mileage: number | null;
  description: string;
  photos: string[];
  ai_analysis: string | null;
  ai_risk_level: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  // joined profile data
  profile_name?: string | null;
  profile_email?: string | null;
  profile_phone?: string | null;
};

const statusColors: Record<string, string> = {
  new: "bg-yellow-100 text-yellow-800 border-yellow-300",
  in_progress: "bg-blue-100 text-blue-800 border-blue-300",
  resolved: "bg-green-100 text-green-800 border-green-300",
  closed: "bg-muted text-muted-foreground border-muted",
};

const statusLabels: Record<string, string> = {
  new: "Nové",
  in_progress: "Řeší se",
  resolved: "Vyřešeno",
  closed: "Uzavřeno",
};

const AdminFaultReports = () => {
  const [reports, setReports] = useState<FaultReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FaultReport | null>(null);
  const [formStatus, setFormStatus] = useState("");
  const [formNote, setFormNote] = useState("");

  const fetchReports = async () => {
    setLoading(true);
    const { data } = await supabase.from("fault_reports" as any).select("*").order("created_at", { ascending: false });
    setReports((data as any as FaultReport[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, []);

  const openDetail = (r: FaultReport) => {
    setSelected(r);
    setFormStatus(r.status);
    setFormNote(r.admin_note || "");
  };

  const save = async () => {
    if (!selected) return;
    const { error } = await supabase.from("fault_reports" as any).update({ status: formStatus, admin_note: formNote } as any).eq("id", selected.id);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Uloženo" });
    setSelected(null);
    fetchReports();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-destructive" />
        <span className="text-sm font-medium">Hlášení poruch ({reports.length})</span>
      </div>

      {reports.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Žádná hlášení</p>}

      {reports.map(r => (
        <Card key={r.id} className={`cursor-pointer hover:border-primary/40 transition-colors ${r.ai_risk_level === "high" ? "border-destructive/50" : ""}`} onClick={() => openDetail(r)}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex gap-3 min-w-0 flex-1">
                {r.vehicle_brand && r.vehicle_model && (
                  <CarIcon car={{ brand: r.vehicle_brand, model: r.vehicle_model, year: r.vehicle_year }} size="sm" />
                )}
                <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {r.ai_risk_level === "high" && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
                  <p className="font-semibold text-sm truncate">
                    {r.vehicle_brand} {r.vehicle_model} {r.vehicle_year || ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                {r.vin && <p className="text-[10px] text-muted-foreground mt-1">VIN: {r.vin}</p>}
                <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString("cs-CZ")}</p>
                {r.photos?.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {r.photos.slice(0, 3).map((url, i) => (
                      <img key={i} src={url} alt="" className="w-10 h-10 rounded object-cover border" />
                    ))}
                    {r.photos.length > 3 && <span className="text-xs text-muted-foreground self-center">+{r.photos.length - 3}</span>}
                  </div>
                )}
              </div>
              </div>
              <Badge className={statusColors[r.status] || ""}>{statusLabels[r.status] || r.status}</Badge>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detail hlášení poruchy</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-3">
                  {selected.vehicle_brand && selected.vehicle_model && (
                    <CarIcon car={{ brand: selected.vehicle_brand, model: selected.vehicle_model, year: selected.vehicle_year }} size="md" />
                  )}
                  <div>
                    <p className="font-semibold">{selected.vehicle_brand} {selected.vehicle_model} {selected.vehicle_year || ""}</p>
                    {selected.vin && <p className="text-xs text-muted-foreground">VIN: {selected.vin}</p>}
                  </div>
                </div>
                {selected.vehicle_engine && <p><span className="font-medium">Motor:</span> {selected.vehicle_engine}</p>}
                {selected.mileage && <p><span className="font-medium">km:</span> {selected.mileage.toLocaleString("cs")}</p>}
                <p><span className="font-medium">Čas:</span> {new Date(selected.created_at).toLocaleString("cs-CZ")}</p>
              </div>

              <div>
                <p className="text-sm font-medium mb-1">Popis problému:</p>
                <p className="text-sm bg-muted/50 p-3 rounded-lg">{selected.description}</p>
              </div>

              {selected.photos?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Fotografie:</p>
                  <div className="flex gap-2 flex-wrap">
                    {selected.photos.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-24 h-24 rounded object-cover border cursor-pointer" onClick={() => window.open(url, "_blank")} />
                    ))}
                  </div>
                </div>
              )}

              {selected.ai_analysis && (
                <div>
                  <p className="text-sm font-medium mb-1">AI analýza:</p>
                  <p className="text-xs bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">{selected.ai_analysis}</p>
                </div>
              )}

              {selected.ai_risk_level === "high" && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-center">
                  <AlertTriangle className="w-5 h-5 mx-auto text-destructive mb-1" />
                  <p className="text-sm font-bold text-destructive">Vysoké riziko</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Stav</label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Poznámka admina</label>
                <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Zavřít</Button>
            <Button onClick={save}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminFaultReports;
