import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, BarChart3, TrendingUp, Clock, Wrench, Package } from "lucide-react";

type Stats = {
  totalOrders: number;
  totalRevenue: number;
  avgPrice: number;
  avgDurationDays: number;
  topRepairs: { type: string; count: number }[];
  topParts: { name: string; count: number }[];
  statusBreakdown: Record<string, number>;
};

const STATUS_LABELS: Record<string, string> = {
  received: "Přijato",
  diagnostics: "Diagnostika",
  waiting_approval: "Čeká schválení",
  waiting_parts: "Čeká na díly",
  in_repair: "Oprava",
  testing: "Testování",
  ready_pickup: "K vyzvednutí",
  completed: "Dokončeno",
};

const AdminServiceStatistics = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [ordersRes, partsRes] = await Promise.all([
        supabase.from("service_orders").select("*"),
        supabase.from("service_order_parts").select("name, quantity"),
      ]);

      const orders = ordersRes.data || [];
      const parts = partsRes.data || [];

      const completed = orders.filter((o: any) => o.status === "completed");
      const totalRevenue = completed.reduce((s: number, o: any) => s + (o.total_price || 0), 0);
      const avgPrice = completed.length ? totalRevenue / completed.length : 0;

      // Avg duration for completed orders
      let totalDays = 0;
      completed.forEach((o: any) => {
        const start = new Date(o.created_at).getTime();
        const end = new Date(o.updated_at).getTime();
        totalDays += (end - start) / (1000 * 60 * 60 * 24);
      });
      const avgDurationDays = completed.length ? totalDays / completed.length : 0;

      // Status breakdown
      const statusBreakdown: Record<string, number> = {};
      orders.forEach((o: any) => {
        statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
      });

      // Top repairs (from planned_work)
      const repairCounts: Record<string, number> = {};
      orders.forEach((o: any) => {
        const work = o.planned_work || o.description || "Ostatní";
        const key = work.substring(0, 40);
        repairCounts[key] = (repairCounts[key] || 0) + 1;
      });
      const topRepairs = Object.entries(repairCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => ({ type, count }));

      // Top parts
      const partCounts: Record<string, number> = {};
      parts.forEach((p: any) => {
        partCounts[p.name] = (partCounts[p.name] || 0) + (p.quantity || 1);
      });
      const topParts = Object.entries(partCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      setStats({
        totalOrders: orders.length,
        totalRevenue,
        avgPrice,
        avgDurationDays,
        topRepairs,
        topParts,
        statusBreakdown,
      });
      setLoading(false);
    };

    fetchStats();
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (!stats) return null;

  const maxStatus = Math.max(...Object.values(stats.statusBreakdown), 1);

  return (
    <div className="space-y-4">
      <h3 className="font-display font-semibold text-sm flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" /> Statistiky servisu
      </h3>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{stats.totalOrders}</p>
            <p className="text-[10px] text-muted-foreground">Celkem zakázek</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{stats.totalRevenue.toLocaleString("cs")}</p>
            <p className="text-[10px] text-muted-foreground">Celkový obrat (Kč)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{Math.round(stats.avgPrice).toLocaleString("cs")}</p>
            <p className="text-[10px] text-muted-foreground">Průměrná cena (Kč)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{stats.avgDurationDays.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground">Průměr dní opravy</p>
          </CardContent>
        </Card>
      </div>

      {/* Status breakdown bar chart */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-medium mb-3 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Rozložení stavů</p>
          <div className="space-y-2">
            {Object.entries(stats.statusBreakdown).map(([status, count]) => (
              <div key={status}>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span>{STATUS_LABELS[status] || status}</span>
                  <span className="font-semibold">{count}</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(count / maxStatus) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top repairs */}
      {stats.topRepairs.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium mb-2 flex items-center gap-1"><Wrench className="w-3 h-3" /> Nejčastější opravy</p>
            {stats.topRepairs.map((r, i) => (
              <div key={i} className="flex justify-between text-xs py-1 border-b border-border/30 last:border-0">
                <span className="truncate">{r.type}</span>
                <span className="font-semibold">{r.count}×</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Top parts */}
      {stats.topParts.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium mb-2 flex items-center gap-1"><Package className="w-3 h-3" /> Nejpoužívanější díly</p>
            {stats.topParts.map((p, i) => (
              <div key={i} className="flex justify-between text-xs py-1 border-b border-border/30 last:border-0">
                <span className="truncate">{p.name}</span>
                <span className="font-semibold">{p.count}×</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminServiceStatistics;
