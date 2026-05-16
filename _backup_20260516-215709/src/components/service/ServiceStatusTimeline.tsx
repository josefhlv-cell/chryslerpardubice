import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Clock, Package, Search, Wrench, FlaskConical, CheckCircle2, Hourglass, AlertCircle } from "lucide-react";

type StatusEntry = {
  id: string;
  old_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string;
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  received: { label: "Přijato do servisu", icon: Package, color: "text-warning" },
  diagnostics: { label: "Diagnostika", icon: Search, color: "text-blue-400" },
  waiting_approval: { label: "Čeká na schválení", icon: Hourglass, color: "text-orange-400" },
  waiting_parts: { label: "Čeká na díly", icon: AlertCircle, color: "text-purple-400" },
  in_repair: { label: "Oprava probíhá", icon: Wrench, color: "text-primary" },
  testing: { label: "Testování vozidla", icon: FlaskConical, color: "text-cyan-400" },
  ready_pickup: { label: "Připraveno k vyzvednutí", icon: CheckCircle2, color: "text-success" },
  completed: { label: "Dokončeno", icon: CheckCircle2, color: "text-success" },
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
    <div className="glass-card p-4">
      <p className="text-sm font-display font-semibold flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-primary" /> Historie stavu
      </p>
      <div className="relative">
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border/60" />
        <div className="space-y-4">
          {history.map((h, i) => {
            const config = STATUS_CONFIG[h.new_status] || { label: h.new_status, icon: Clock, color: "text-muted-foreground" };
            const Icon = config.icon;
            return (
              <motion.div
                key={h.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="relative pl-9"
              >
                <div className={`absolute left-[7px] top-0.5 w-[17px] h-[17px] rounded-full bg-card border-2 border-border flex items-center justify-center ${i === 0 ? "border-primary" : ""}`}>
                  <Icon className={`w-2.5 h-2.5 ${i === 0 ? "text-primary" : config.color}`} />
                </div>
                <div>
                  <p className={`text-xs font-semibold ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {config.label}
                  </p>
                  {h.note && <p className="text-[11px] text-muted-foreground mt-0.5">{h.note}</p>}
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {new Date(h.created_at).toLocaleString("cs-CZ")}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ServiceStatusTimeline;
