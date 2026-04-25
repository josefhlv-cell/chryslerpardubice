import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Play, Square, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type SyncResult = {
  oem_number: string;
  status: string;
  price_with_vat?: number;
  price_without_vat?: number;
  error?: string;
};

type SyncSummary = {
  total: number;
  batchProcessed: number;
  updated: number;
  errors: number;
  skipped: number;
  notFound: number;
  nextOffset: number;
};

const BATCH_SIZE = 100;
const INTER_BATCH_DELAY = 800;

const AdminBulkPriceSync = () => {
  const [running, setRunning] = useState(false);
  const [totalParts, setTotalParts] = useState(0);
  const [missingPriceCount, setMissingPriceCount] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [errors, setErrors] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [lockRetries, setLockRetries] = useState(0);
  const [results, setResults] = useState<SyncResult[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [cronWasPaused, setCronWasPaused] = useState(false);
  const [syncMode, setSyncMode] = useState<"force" | "missing">("force");
  const stopRef = useRef(false);

  useEffect(() => {
    countParts();
  }, []);

  const countParts = async () => {
    const [{ count: total }, { count: missing }] = await Promise.all([
      supabase.from("parts_new").select("id", { count: "exact", head: true }),
      supabase
        .from("parts_new")
        .select("id", { count: "exact", head: true })
        .in("catalog_source", ["mopar", "mopar_oem", "7zap", "epc-ai", "ai-epc", "epc-link"])
        .eq("price_with_vat", 0),
    ]);
    setTotalParts(total || 0);
    setMissingPriceCount(missing || 0);
  };

  const controlCron = useCallback(async (action: "pause" | "resume" | "status") => {
    try {
      const { data, error } = await supabase.functions.invoke("cron-control", {
        body: { action },
      });
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn(`Cron control '${action}' failed:`, e);
      return null;
    }
  }, []);

  const startSync = async (mode: "force" | "missing" = "force") => {
    stopRef.current = false;
    setSyncMode(mode);
    setRunning(true);
    setProcessed(0);
    setUpdated(0);
    setErrors(0);
    setSkipped(0);
    setLockRetries(0);
    setResults([]);
    setStartTime(Date.now());

    // Pause cron job to avoid lock conflicts
    const cronStatus = await controlCron("status");
    const cronActive = cronStatus?.active ?? false;
    if (cronActive) {
      await controlCron("pause");
      setCronWasPaused(true);
      toast({ title: "Cron pozastaven", description: "Automatická synchronizace pozastavena po dobu hromadného syncu." });
      // Wait for any running cron batch to finish
      await new Promise(r => setTimeout(r, 5000));
    }

    let offset = 0;
    let hasMore = true;
    let consecutiveLockFails = 0;

    while (hasMore && !stopRef.current) {
      try {
        const { data, error } = await supabase.functions.invoke("price-sync", {
          body: { batchSize: BATCH_SIZE, offset, mode },
        });

        if (error) throw error;

        // Handle lock conflicts
        if (data?.summary?.message?.includes('Skipped')) {
          consecutiveLockFails++;
          setLockRetries(prev => prev + 1);
          if (consecutiveLockFails >= 5) {
            toast({ title: "Lock konflikt", description: "Synchronizace blokována jiným procesem. Zkuste to znovu.", variant: "destructive" });
            break;
          }
          // Wait longer for lock to clear
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }
        consecutiveLockFails = 0;

        const summary: SyncSummary = data?.summary;
        const batchResults: SyncResult[] = data?.results || [];

        const batchProcessed = summary?.batchProcessed || 0;
        setProcessed(prev => prev + batchProcessed);
        setUpdated(prev => prev + (summary?.updated || 0));
        setErrors(prev => prev + (summary?.errors || 0));
        setSkipped(prev => prev + (summary?.skipped || 0) + (summary?.notFound || 0));
        setResults(prev => {
          const combined = [...prev, ...batchResults];
          // Keep last 500 results to avoid memory issues
          return combined.length > 500 ? combined.slice(-500) : combined;
        });

        offset = summary?.nextOffset || offset + BATCH_SIZE;

        if (batchProcessed < BATCH_SIZE) {
          hasMore = false;
        }

        // Delay between batches to be gentle on the catalog
        await new Promise(r => setTimeout(r, INTER_BATCH_DELAY));
      } catch (err: any) {
        console.error("Batch error:", err);
        setErrors(prev => prev + 1);
        offset += BATCH_SIZE;
        if (offset >= totalParts) hasMore = false;
        // Extra delay on error
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Resume cron if we paused it
    if (cronWasPaused) {
      await controlCron("resume");
      setCronWasPaused(false);
      toast({ title: "Cron obnoven", description: "Automatická synchronizace byla obnovena." });
    }

    setRunning(false);
  };

  const stopSync = async () => {
    stopRef.current = true;
    // Resume cron immediately on manual stop
    if (cronWasPaused) {
      await controlCron("resume");
      setCronWasPaused(false);
    }
  };

  const progressPercent = totalParts > 0 ? Math.min(100, Math.round((processed / totalParts) * 100)) : 0;

  const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
  const eta = processed > 0 && totalParts > processed
    ? Math.round(((elapsed / processed) * (totalParts - processed)))
    : 0;

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "updated": return <CheckCircle className="w-3 h-3 text-green-500" />;
      case "fresh":
      case "locked": return <Clock className="w-3 h-3 text-blue-500" />;
      case "not_found":
      case "error": return <XCircle className="w-3 h-3 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Hromadná synchronizace cen</h3>
              <p className="text-xs text-muted-foreground">
                Celkem dílů v databázi: <strong>{totalParts}</strong>
                {totalParts > 0 && (
                  <span className="ml-2">
                    (~{Math.ceil(totalParts / BATCH_SIZE)} dávek po {BATCH_SIZE})
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              {!running ? (
                <Button onClick={startSync} disabled={totalParts === 0} size="sm" className="gap-1">
                  <Play className="w-4 h-4" /> Spustit sync
                </Button>
              ) : (
                <Button onClick={stopSync} variant="destructive" size="sm" className="gap-1">
                  <Square className="w-4 h-4" /> Zastavit
                </Button>
              )}
              <Button onClick={countParts} variant="outline" size="icon" className="h-8 w-8" disabled={running}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {cronWasPaused && (
            <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 rounded-md p-2">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>Automatický cron pozastaven po dobu hromadného syncu</span>
            </div>
          )}

          {(running || processed > 0) && (
            <>
              <Progress value={progressPercent} />
              <div className="flex flex-wrap gap-3 text-xs">
                <span>📊 {processed}/{totalParts} ({progressPercent}%)</span>
                <span className="text-green-600">✅ Aktualizováno: {updated}</span>
                <span className="text-blue-600">⏭️ Přeskočeno: {skipped}</span>
                <span className="text-red-600">❌ Chyby: {errors}</span>
                {lockRetries > 0 && (
                  <span className="text-amber-500">🔒 Lock retry: {lockRetries}</span>
                )}
                {running && (
                  <>
                    <span>⏱️ {formatTime(elapsed)}</span>
                    {eta > 0 && <span>🕐 ETA: ~{formatTime(eta)}</span>}
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardContent className="p-3 max-h-80 overflow-y-auto">
            <h4 className="text-xs font-semibold mb-2">Výsledky (posledních {results.length})</h4>
            <div className="space-y-1">
              {[...results].reverse().slice(0, 100).map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                  {statusIcon(r.status)}
                  <span className="font-mono text-muted-foreground w-28 shrink-0">{r.oem_number}</span>
                  <Badge variant="outline" className="text-[9px]">{r.status}</Badge>
                  {r.price_with_vat && (
                    <span className="ml-auto font-semibold">{r.price_with_vat.toLocaleString("cs")} Kč</span>
                  )}
                  {r.error && <span className="text-red-500 truncate max-w-40">{r.error}</span>}
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
