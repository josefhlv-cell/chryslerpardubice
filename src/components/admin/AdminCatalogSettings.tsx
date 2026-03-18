import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Settings, CheckCircle, Save, Activity, Database, Wifi, Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type CatalogConfig = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  ready: boolean;
};

type DiagResult = {
  mopar: { status: string; responseTime: number };
  sag: { status: string; responseTime: number };
  intercars: { status: string; responseTime: number };
};

const AdminCatalogSettings = () => {
  const [catalogs, setCatalogs] = useState<CatalogConfig[]>([
    { id: "mopar", name: "Mopar EPC", description: "Originální díly Chrysler, Jeep, Dodge, RAM", enabled: true, ready: true },
    { id: "sag", name: "SAG Connect", description: "Alternativní díly – SAG/QWP (+ 15% marže)", enabled: true, ready: true },
    { id: "autokelly", name: "AutoKelly", description: "Alternativní díly – AutoKelly (+ 15% marže)", enabled: true, ready: true },
    { id: "intercars", name: "InterCars", description: "Alternativní díly – vyžaduje API klíč", enabled: false, ready: false },
  ]);
  const [hasChanges, setHasChanges] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);
  const [partsCount, setPartsCount] = useState({ parts_new: 0, parts_catalog: 0, supersessions: 0 });

  useEffect(() => {
    loadCounts();
  }, []);

  const loadCounts = async () => {
    const [pn, pc, ss] = await Promise.all([
      supabase.from("parts_new").select("id", { count: "exact", head: true }),
      supabase.from("parts_catalog").select("id", { count: "exact", head: true }),
      supabase.from("part_supersessions").select("id", { count: "exact", head: true }),
    ]);
    setPartsCount({
      parts_new: pn.count ?? 0,
      parts_catalog: pc.count ?? 0,
      supersessions: ss.count ?? 0,
    });
  };

  const toggleCatalog = (id: string) => {
    setCatalogs(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
    setHasChanges(true);
  };

  const saveChanges = () => {
    toast({ title: "Nastavení katalogů uloženo" });
    setHasChanges(false);
  };

  const runDiagnostics = async () => {
    setDiagRunning(true);
    try {
      const start = Date.now();
      const { data, error } = await supabase.functions.invoke("catalog-search", {
        body: { oemCodes: ["68218951AA"], mode: "force" },
      });
      const elapsed = Date.now() - start;

      if (error) throw error;

      setDiagResult(data?.diagnostics || {
        mopar: { status: 'unknown', responseTime: elapsed },
        sag: { status: 'disabled', responseTime: 0 },
        intercars: { status: 'disabled', responseTime: 0 },
      });
      await loadCounts();
      toast({ title: "Diagnostika dokončena" });
    } catch (err: any) {
      toast({ title: "Chyba diagnostiky", description: err.message, variant: "destructive" });
      setDiagResult({
        mopar: { status: 'error', responseTime: 0 },
        sag: { status: 'disabled', responseTime: 0 },
        intercars: { status: 'disabled', responseTime: 0 },
      });
    }
    setDiagRunning(false);
  };

  const statusBadge = (status: string) => {
    if (status === 'ok') return <Badge className="bg-green-100 text-green-800 text-[10px]"><CheckCircle className="w-3 h-3 mr-0.5" />OK</Badge>;
    if (status === 'disabled') return <Badge variant="outline" className="text-[10px]">Vypnuto</Badge>;
    return <Badge className="bg-red-100 text-red-800 text-[10px]">Chyba</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Settings className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Nastavení katalogů</h3>
      </div>

      {catalogs.map(c => (
        <Card key={c.id} className={c.enabled ? "border-primary/40" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{c.name}</p>
                  {c.enabled && <Badge className="bg-green-100 text-green-800 text-[10px]"><CheckCircle className="w-3 h-3 mr-0.5" />Aktivní</Badge>}
                  {!c.enabled && c.ready && <Badge variant="outline" className="text-[10px]">Připraveno</Badge>}
                  {!c.enabled && !c.ready && <Badge variant="outline" className="text-[10px] text-muted-foreground">Vyžaduje konfiguraci</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
              </div>
              <Switch checked={c.enabled} onCheckedChange={() => toggleCatalog(c.id)} disabled={!c.ready && !c.enabled} />
            </div>
          </CardContent>
        </Card>
      ))}

      <Button className="w-full" onClick={saveChanges} disabled={!hasChanges}>
        <Save className="w-4 h-4 mr-2" />
        Uložit nastavení katalogů
      </Button>

      {/* Diagnostics */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-primary" />
              Diagnostika katalogů
            </h4>
            <Button size="sm" variant="outline" onClick={runDiagnostics} disabled={diagRunning}>
              {diagRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Wifi className="w-3.5 h-3.5 mr-1" />}
              {diagRunning ? "Testuji..." : "Spustit test"}
            </Button>
          </div>

          <div className="space-y-2">
            {/* Database stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-muted/50 rounded-lg p-2 text-center">
                <Database className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-lg font-bold">{partsCount.parts_new}</p>
                <p className="text-[10px] text-muted-foreground">Díly (cache)</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2 text-center">
                <Database className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-lg font-bold">{partsCount.parts_catalog}</p>
                <p className="text-[10px] text-muted-foreground">Díly (CSV)</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2 text-center">
                <RefreshCw className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-lg font-bold">{partsCount.supersessions}</p>
                <p className="text-[10px] text-muted-foreground">Náhrady</p>
              </div>
            </div>

            {/* Catalog status */}
            {diagResult && (
              <div className="space-y-1.5 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span>Mopar EPC</span>
                  <div className="flex items-center gap-2">
                    {statusBadge(diagResult.mopar.status)}
                    {diagResult.mopar.responseTime > 0 && (
                      <span className="text-muted-foreground flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />{diagResult.mopar.responseTime}ms
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>SAG Connect</span>
                  {statusBadge(diagResult.sag.status)}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>InterCars</span>
                  {statusBadge(diagResult.intercars.status)}
                </div>
              </div>
            )}

            {!diagResult && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Klikněte na "Spustit test" pro ověření katalogů
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCatalogSettings;
