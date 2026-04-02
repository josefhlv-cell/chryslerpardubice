import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Database, Download, RefreshCw, Loader2, Shield, Trash2, Clock } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";

interface BackupFile {
  name: string;
  created_at: string;
  metadata?: { size?: number };
}

const AdminBackups = () => {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("db-backup", {
        body: { action: "list" },
      });
      if (error) throw error;
      setBackups(data?.backups || []);
    } catch (e) {
      console.error("Failed to fetch backups:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const runBackup = async () => {
    setBackingUp(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("db-backup", {
        body: { action: "backup" },
      });
      if (error) throw error;
      setLastResult(data);
      if (data?.success) {
        toast({ title: "✅ Záloha vytvořena", description: `${data.total_rows} řádků, ${data.size_kb} KB` });
        fetchBackups();
      } else {
        toast({ title: "❌ Záloha selhala", description: data?.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setBackingUp(false);
    }
  };

  const downloadBackup = async (fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("backups")
        .download(`daily/${fileName}`);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Chyba stahování", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-4 h-4" />
            Zálohy databáze
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={runBackup} disabled={backingUp} size="sm" className="gap-1.5">
              {backingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
              {backingUp ? "Zálohuji…" : "Spustit zálohu"}
            </Button>
            <Button onClick={fetchBackups} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Obnovit seznam
            </Button>
          </div>

          {lastResult?.success && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium text-green-800 dark:text-green-200">✅ Záloha úspěšná</p>
              <p className="text-muted-foreground">
                {lastResult.tables} tabulek · {lastResult.total_rows} řádků · {lastResult.size_kb} KB
              </p>
              {lastResult.errors?.length > 0 && (
                <p className="text-amber-600 text-xs">{lastResult.errors.length} chyb(y): {lastResult.errors.join(", ")}</p>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Automatická záloha: denně v 02:00 UTC · Retence: 7 dní
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Uložené zálohy</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : backups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Žádné zálohy</p>
          ) : (
            <div className="space-y-2">
              {backups.map((b) => (
                <div
                  key={b.name}
                  className="flex items-center justify-between p-2.5 rounded-md border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Database className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(b.created_at), "d. MMMM yyyy, HH:mm", { locale: cs })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadBackup(b.name)}
                    className="shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminBackups;
