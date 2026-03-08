import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Play, Square, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
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

const AdminBulkPriceSync = () => {
  const [running, setRunning] = useState(false);
  const [totalParts, setTotalParts] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [errors, setErrors] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [results, setResults] = useState<SyncResult[]>([]);
  const [currentBatch, setCurrentBatch] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const stopRef = useRef(false);

  // Count total parts on mount
  useEffect(() => {
    countParts();
  }, []);

  const countParts = async () => {
    const { count } = await supabase
      .from("parts_new")
      .select("id", { count: "exact", head: true });
    setTotalParts(count || 0);
  };

  const startSync = async () => {
    stopRef.current = false;
    setRunning(true);
    setProcessed(0);
    setUpdated(0);
    setErrors(0);
    setSkipped(0);
    setResults([]);
    setStartTime(Date.now());

    const BATCH_SIZE = 5;
    let offset = 0;
    let hasMore = true;

    while (hasMore && !stopRef.current) {
      try {
        setCurrentBatch([`Batch ${Math.floor(offset / BATCH_SIZE) + 1}...`]);

        const { data, error } = await supabase.functions.invoke("price-sync", {
          body: { batchSize: BATCH_SIZE, offset, mode: "auto" },
        });

        if (error) throw error;

        const summary: SyncSummary = data?.summary;
        const batchResults: SyncResult[] = data?.results || [];

        setProcessed(prev => prev + (summary?.batchProcessed || 0));
        setUpdated(prev => prev + (summary?.updated || 0));
        setErrors(prev => prev + (summary?.errors || 0));
        setSkipped(prev => prev + (summary?.skipped || 0));
        setResults(prev => [...prev, ...batchResults]);

        offset = summary?.nextOffset || offset + BATCH_SIZE;

        // Check if we've processed all parts
        if ((summary?.batchProcessed || 0) < BATCH_SIZE) {
          hasMore = false;
        }

        // Small delay between batches
        await new Promise(r => setTimeout(r, 500));
      } catch (err: any) {
        console.error("Batch error:", err);
        setErrors(prev => prev + 1);
        // Continue with next batch
        offset += BATCH_SIZE;
        if (offset >= totalParts) hasMore = false;
      }
    }

    setRunning(false);
    setCurrentBatch([]);
    toast({
      title: stopRef.current ? "Synchronizace zastavena" : "Synchronizace dokončena",
      description: `Zpracováno: ${processed}, Aktualizováno: ${updated}, Chyby: ${errors}`,
    });
  };

  const stopSync = () => {
    stopRef.current = true;
  };

  const progressPercent = totalParts > 0 ? Math.min(100, Math.round((processed / totalParts) * 100)) : 0;

  const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
  const eta = processed > 0 && totalParts > processed
    ? Math.round(((elapsed / processed) * (totalParts - processed)))
    : 0;

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
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
              <Button onClick={countParts} variant="outline" size="icon" className="h-8 w-8">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {(running || processed > 0) && (
            <>
              <Progress value={progressPercent} className="h-3" />
              <div className="flex flex-wrap gap-3 text-xs">
                <span>📊 {processed}/{totalParts} ({progressPercent}%)</span>
                <span className="text-green-600">✅ Aktualizováno: {updated}</span>
                <span className="text-blue-600">⏭️ Přeskočeno: {skipped}</span>
                <span className="text-red-600">❌ Chyby: {errors}</span>
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

      {/* Results log */}
      {results.length > 0 && (
        <Card>
          <CardContent className="p-3 max-h-80 overflow-y-auto">
            <h4 className="text-xs font-semibold mb-2">Výsledky ({results.length})</h4>
            <div className="space-y-1">
              {[...results].reverse().map((r, i) => (
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
