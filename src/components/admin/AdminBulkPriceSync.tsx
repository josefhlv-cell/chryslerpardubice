import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Play, Square, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  updated_at?: string;
  finished_at: string | null;
};

type RecentPart = {
  oem_number: string;
  price_with_vat: number | null;
  last_price_update: string | null;
};

const AdminBulkPriceSync = () => {
  const [totalParts, setTotalParts] = useState(0);
  const [missingPriceCount, setMissingPriceCount] = useState(0);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [recent, setRecent] = useState<RecentPart[]>([]);

  const countParts = useCallback(async () => {
    const allowed = ['mopar', 'mopar_oem', 'csv', 'epc-link', '7zap', 'epc-ai', 'ai-epc', 'makro', 'catcar', 'jm_oem'];
    const [{ count: total }, { count: missing }] = await Promise.all([
      supabase.from("parts_new").select("id", { count: "exact", head: true }).in("catalog_source", allowed).neq("is_active", false),
      supabase
        .from("parts_new")
        .select("id", { count: "exact", head: true })
        .in("catalog_source", allowed)
        .neq("is_active", false)
        .or("price_with_vat.is.null,price_with_vat.eq.0"),
    ]);
    setTotalParts(total || 0);
    setMissingPriceCount(missing || 0);
  }, []);

  const fetchActiveRun = useCallback(async () => {
    const { data } = await supabase
      .from("price_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = (data as Run | null) || null;
    setActiveRun(r && r.status === "running" ? r : null);
  }, []);

  const fetchRecent = useCallback(async () => {
    const { data } = await supabase
      .from("parts_new")
      .select("oem_number, price_with_vat, last_price_update")
      .not("last_price_update", "is", null)
      .order("last_price_update", { ascending: false })
      .limit(20);
    setRecent((data as RecentPart[]) || []);
  }, []);

  useEffect(() => {
    countParts();
    fetchActiveRun();
    fetchRecent();
    const interval = setInterval(() => {
      fetchActiveRun();
      fetchRecent();
    }, 4000);
    const channel = supabase
      .channel("bulk-sync-runs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "price_sync_runs" },
        () => fetchActiveRun()
      )
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [countParts, fetchActiveRun, fetchRecent]);

  const startSync = async (mode: "all" | "missing") => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-price-sync", {
        body: { action: "start", mode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Sync spuštěn na serveru",
        description: `Běží nezávisle — můžete zavřít aplikaci. Cíl: ${data.totalTarget} dílů.`,
      });
      fetchActiveRun();
    } catch (e: any) {
      toast({ title: "Chyba spuštění", description: e.message || "Nepodařilo se spustit", variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const stopSync = async () => {
    if (!activeRun) return;
    setStopping(true);
    try {
      await supabase
        .from("price_sync_runs")
        .update({
          status: "failed",
          last_error: "Zastaveno administrátorem",
          finished_at: new Date().toISOString(),
        })
        .eq("id", activeRun.id);
      toast({ title: "Sync zastaven" });
      fetchActiveRun();
    } catch (e: any) {
      toast({ title: "Nelze zastavit", description: e.message, variant: "destructive" });
    } finally {
      setStopping(false);
    }
  };

  const target = activeRun?.total_target || (activeRun?.mode === "missing" ? missingPriceCount : totalParts);
  const processed = activeRun?.processed || 0;
  const progressPercent = target > 0 ? Math.min(100, Math.round((processed / target) * 100)) : 0;

  const elapsed = activeRun ? Math.round((Date.now() - new Date(activeRun.started_at).getTime()) / 1000) : 0;
  const eta = activeRun && processed > 0 && target > processed
    ? Math.round((elapsed / processed) * (target - processed))
    : 0;

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold text-sm">Hromadná synchronizace cen</h3>
              <p className="text-xs text-muted-foreground">
                Celkem dílů v databázi: <strong>{totalParts}</strong>
                {missingPriceCount > 0 && (
                  <span className="ml-2 text-amber-500">
                    · Chybí cena: <strong>{missingPriceCount}</strong>
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {!activeRun ? (
                <>
                  <Button onClick={() => startSync("all")} disabled={totalParts === 0 || starting} size="sm" className="gap-1">
                    <Play className="w-4 h-4" /> Sync všech
                  </Button>
                  <Button
                    onClick={() => startSync("missing")}
                    disabled={missingPriceCount === 0 || starting}
                    size="sm"
                    variant="secondary"
                    className="gap-1"
                  >
                    <Play className="w-4 h-4" /> Sync chybějících ({missingPriceCount})
                  </Button>
                </>
              ) : (
                <Button onClick={stopSync} disabled={stopping} variant="destructive" size="sm" className="gap-1">
                  <Square className="w-4 h-4" /> Zastavit ({activeRun.mode})
                </Button>
              )}
              <Button onClick={countParts} variant="outline" size="icon" className="h-8 w-8" disabled={!!activeRun}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 w-full">
              Běží na serveru — pokračuje i po zavření aplikace. Zdroje: Mopar / CSV / EPC / 7zap / J+M OEM.
            </p>
          </div>

          {activeRun && (
            <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 rounded-md p-2">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>Server-side běh — neukončí se zavřením prohlížeče. Automatický cron je pozastaven.</span>
            </div>
          )}

          {activeRun && (
            <>
              <Progress value={progressPercent} />
              <div className="flex flex-wrap gap-3 text-xs">
                <span>📊 {processed}/{target} ({progressPercent}%)</span>
                <span className="text-green-600">✅ Aktualizováno: {activeRun.updated_count}</span>
                {activeRun.error_count > 0 && (
                  <span className="text-red-600">❌ Chyby: {activeRun.error_count}</span>
                )}
                <span>⏱️ {formatTime(elapsed)}</span>
                {eta > 0 && <span>🕐 ETA: ~{formatTime(eta)}</span>}
              </div>
              {activeRun.last_error && (
                <p className="text-[11px] text-red-500 truncate">⚠ {activeRun.last_error}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {recent.length > 0 && (
        <Card>
          <CardContent className="p-3 max-h-80 overflow-y-auto">
            <h4 className="text-xs font-semibold mb-2">Nedávno aktualizované ceny</h4>
            <div className="space-y-1">
              {recent.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                  {r.price_with_vat && r.price_with_vat > 0 ? (
                    <CheckCircle className="w-3 h-3 text-green-500" />
                  ) : (
                    <XCircle className="w-3 h-3 text-amber-500" />
                  )}
                  <span className="font-mono text-muted-foreground w-32 shrink-0 truncate">{r.oem_number}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {r.price_with_vat && r.price_with_vat > 0 ? "updated" : "no_price"}
                  </Badge>
                  {r.price_with_vat && r.price_with_vat > 0 && (
                    <span className="ml-auto font-semibold">{r.price_with_vat.toLocaleString("cs")} Kč</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminBulkPriceSync;
