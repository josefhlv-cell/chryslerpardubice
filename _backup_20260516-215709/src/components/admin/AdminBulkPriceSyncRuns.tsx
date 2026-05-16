import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Play, RefreshCw, CheckCircle2, AlertCircle, Loader2, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Run = {
  id: string;
  mode: string;
  status: string;
  total_target: number;
  processed: number;
  updated_count: number;
  error_count: number;
  last_error: string | null;
  started_at: string;
  finished_at: string | null;
};

const AdminBulkPriceSyncRuns = () => {
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [starting, setStarting] = useState(false);

  const fetchRuns = async () => {
    const { data } = await supabase
      .from("price_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    const list = (data || []) as Run[];
    setRuns(list);
    setActiveRun(list.find((r) => r.status === "running") || null);
  };

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 5000);
    const channel = supabase
      .channel("price-sync-runs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "price_sync_runs" },
        () => fetchRuns()
      )
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const startSync = async (mode: "missing" | "all") => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-price-sync", {
        body: { action: "start", mode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Sync spuštěn",
        description: `Běží na serveru — můžete aplikaci klidně zavřít. Cílem je ${data.totalTarget} dílů.`,
      });
      fetchRuns();
    } catch (e: any) {
      toast({
        title: "Chyba spuštění",
        description: e.message || "Nepodařilo se spustit sync",
        variant: "destructive",
      });
    }
    setStarting(false);
  };

  const progress =
    activeRun && activeRun.total_target > 0
      ? Math.round((activeRun.processed / activeRun.total_target) * 100)
      : 0;

  return (
    <div className="space-y-3">
      <Card className="border-primary/30">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              {activeRun ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : (
                <Play className="w-4 h-4 text-primary" />
              )}
              Hromadný sync na serveru
            </h3>
            <Badge variant="outline" className="text-[10px]">
              Běží i po zavření aplikace
            </Badge>
          </div>

          {activeRun ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Režim: {activeRun.mode === "missing" ? "chybějící ceny" : "všechny díly"}
                </span>
                <span className="font-semibold">
                  {activeRun.processed} / {activeRun.total_target}
                </span>
              </div>
              <Progress value={progress} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>✅ Aktualizováno: {activeRun.updated_count}</span>
                {activeRun.error_count > 0 && (
                  <span className="text-orange-500">⚠ Chyby: {activeRun.error_count}</span>
                )}
                <span>{progress}%</span>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Běh pokračuje na serveru i když zavřete aplikaci. Po dokončení dostanete notifikaci.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                onClick={() => startSync("missing")}
                disabled={starting}
                className="gap-2"
              >
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Sync chybějících
              </Button>
              <Button
                onClick={() => startSync("all")}
                disabled={starting}
                variant="outline"
                className="gap-2"
              >
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync všech
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {runs.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Historie běhů
            </h4>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-xs py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <StatusIcon status={r.status} />
                    <div>
                      <div className="font-mono text-[10px]">
                        {new Date(r.started_at).toLocaleString("cs")}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.mode === "missing" ? "chybějící" : "všechny"} • {r.processed}/
                        {r.total_target} • ✓ {r.updated_count}
                        {r.error_count > 0 && (
                          <span className="text-orange-500"> • ⚠ {r.error_count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${statusColor(r.status)}`}
                  >
                    {statusLabel(r.status)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === "running") return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />;
  if (status === "completed") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
  return <AlertCircle className="w-3.5 h-3.5 text-orange-500" />;
};

const statusLabel = (s: string) =>
  s === "running" ? "Běží" : s === "completed" ? "Dokončeno" : "Selhalo";

const statusColor = (s: string) =>
  s === "running"
    ? "text-primary border-primary/30"
    : s === "completed"
    ? "text-green-600 border-green-300"
    : "text-orange-600 border-orange-300";

export default AdminBulkPriceSyncRuns;
