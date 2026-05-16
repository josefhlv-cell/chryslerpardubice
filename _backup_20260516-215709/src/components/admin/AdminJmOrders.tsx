import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Send } from "lucide-react";

interface JmOrder {
  id: string;
  order_id: string;
  user_id: string;
  nextis_order_id: string | null;
  status: string;
  items: any;
  total_price: number | null;
  error_message: string | null;
  attempts: number;
  sent_at: string | null;
  created_at: string;
}

const STATUS_CLASS: Record<string, string> = {
  sent: "bg-green-500/15 text-green-400 border-green-500/30",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground",
};

export default function AdminJmOrders() {
  const { toast } = useToast();
  const [rows, setRows] = useState<JmOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("jm_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast({ title: "Chyba", description: error.message, variant: "destructive" });
    setRows((data as JmOrder[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-jm-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "jm_orders" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const retry = async (orderId: string, jmId: string) => {
    setBusyId(jmId);
    try {
      const { data, error } = await supabase.functions.invoke("dispatch-jm-order", {
        body: { order_id: orderId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Odesláno", description: `Nextis ID: ${(data as any)?.nextisOrderId ?? "—"}` });
      load();
    } catch (e: any) {
      toast({ title: "Retry selhal", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Odeslané objednávky J+M
          <Badge variant="outline" className="text-[10px]">automatické po zaplacení</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Obnovit
          </Button>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          <span className="text-xs text-muted-foreground ml-auto">{rows.length} záznamů</span>
        </div>

        {rows.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground">Zatím nic neodesláno.</p>
        )}

        <div className="space-y-2">
          {rows.map((r) => {
            const cls = STATUS_CLASS[r.status] || "bg-muted text-muted-foreground";
            const code = Array.isArray(r.items) && r.items[0]?.code;
            const qty = Array.isArray(r.items) && r.items[0]?.qty;
            return (
              <div key={r.id} className="rounded-md border p-2 text-xs space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${cls}`}>
                    {r.status}
                  </Badge>
                  {r.nextis_order_id && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10">
                      Nextis #{r.nextis_order_id}
                    </Badge>
                  )}
                  <span className="font-mono">{code}</span>
                  <span className="text-muted-foreground">×{qty}</span>
                  {r.total_price != null && (
                    <span className="ml-auto font-semibold">
                      {Number(r.total_price).toLocaleString("cs-CZ")} Kč
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-3">
                  <span>order: {r.order_id.slice(0, 8)}…</span>
                  <span>pokusů: {r.attempts}</span>
                  <span>{new Date(r.created_at).toLocaleString("cs-CZ")}</span>
                </div>
                {r.error_message && (
                  <p className="text-red-400 text-[10px] font-mono break-all">
                    {r.error_message}
                  </p>
                )}
                {(r.status === "failed" || r.status === "pending") && (
                  <div className="pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px]"
                      onClick={() => retry(r.order_id, r.id)}
                      disabled={busyId === r.id}
                    >
                      {busyId === r.id ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3 mr-1" />
                      )}
                      Odeslat znovu
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
