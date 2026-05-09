/**
 * AdminOfflineQueue — admin pohled na čekající offline změny mechaniků.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CloudOff, RefreshCw } from "lucide-react";

const AdminOfflineQueue = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("mechanic_offline_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const statusColor: Record<string, string> = {
    pending: "bg-warning/15 text-warning",
    synced: "bg-success/15 text-success",
    failed: "bg-destructive/15 text-destructive",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CloudOff className="w-5 h-5 text-primary" /> Offline fronta mechaniků
        </h2>
        <Button size="sm" variant="outline" onClick={fetchData}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Změny zaznamenané mechanikem v offline režimu, čekající na synchronizaci.
      </p>

      {!loading && items.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Fronta je prázdná.</CardContent></Card>
      )}

      <div className="space-y-2">
        {items.map((it) => (
          <Card key={it.id}>
            <CardContent className="p-3 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono">{it.action}</code>
                  <Badge variant="outline" className="text-[10px]">{it.entity_type}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  ID: {it.entity_id || "—"} · vytvořeno {new Date(it.client_created_at).toLocaleString("cs-CZ")}
                </p>
                {it.error && <p className="text-[10px] text-destructive mt-0.5">{it.error}</p>}
              </div>
              <Badge className={statusColor[it.status] || ""}>{it.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminOfflineQueue;
