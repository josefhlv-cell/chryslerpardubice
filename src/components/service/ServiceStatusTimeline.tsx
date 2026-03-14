import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";

type StatusEntry = {
  id: string;
  old_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  received: "Přijato do servisu",
  diagnostics: "Diagnostika",
  waiting_approval: "Čeká na schválení",
  waiting_parts: "Čeká na díly",
  in_repair: "Oprava probíhá",
  testing: "Testování vozidla",
  ready_pickup: "Připraveno k vyzvednutí",
  completed: "Dokončeno",
};

const ServiceStatusTimeline = ({ orderId }: { orderId: string }) => {
  const [history, setHistory] = useState<StatusEntry[]>([]);

  useEffect(() => {
    supabase
      .from("service_order_status_history")
      .select("*")
      .eq("service_order_id", orderId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setHistory((data as StatusEntry[]) || []));

    const channel = supabase
      .channel(`status-history-${orderId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "service_order_status_history", filter: `service_order_id=eq.${orderId}` }, (payload) => {
        setHistory(prev => [payload.new as StatusEntry, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  if (history.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-medium flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-primary" /> Historie stavu
        </p>
        <div className="relative">
          <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />
          <div className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="relative pl-6">
                <div className="absolute left-[5px] top-1.5 w-2 h-2 rounded-full bg-primary" />
                <p className="text-xs font-medium">{STATUS_LABELS[h.new_status] || h.new_status}</p>
                {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
                <p className="text-[10px] text-muted-foreground">
                  {new Date(h.created_at).toLocaleString("cs-CZ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ServiceStatusTimeline;
