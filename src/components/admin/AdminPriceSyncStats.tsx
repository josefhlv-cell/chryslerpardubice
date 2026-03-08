import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Activity, CheckCircle, Clock, AlertCircle, TrendingUp } from "lucide-react";

type Stats = {
  total: number;
  withPrice: number;
  updatedToday: number;
  updatedLastHour: number;
  neverUpdated: number;
  avgPrice: number;
  recentUpdates: { oem_number: string; price_with_vat: number; last_price_update: string }[];
};

const AdminPriceSyncStats = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchStats = async () => {
    setLoading(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    const [totalRes, withPriceRes, todayRes, hourRes, neverRes, recentRes] = await Promise.all([
      supabase.from("parts_new").select("id", { count: "exact", head: true }),
      supabase.from("parts_new").select("id", { count: "exact", head: true }).gt("price_with_vat", 0),
      supabase.from("parts_new").select("id", { count: "exact", head: true }).gte("last_price_update", todayStart),
      supabase.from("parts_new").select("id", { count: "exact", head: true }).gte("last_price_update", hourAgo),
      supabase.from("parts_new").select("id", { count: "exact", head: true }).is("last_price_update", null),
      supabase.from("parts_new")
        .select("oem_number, price_with_vat, last_price_update")
        .not("last_price_update", "is", null)
        .gt("price_with_vat", 0)
        .order("last_price_update", { ascending: false })
        .limit(15),
    ]);

    setStats({
      total: totalRes.count || 0,
      withPrice: withPriceRes.count || 0,
      updatedToday: todayRes.count || 0,
      updatedLastHour: hourRes.count || 0,
      neverUpdated: neverRes.count || 0,
      avgPrice: 0,
      recentUpdates: (recentRes.data || []) as any,
    });
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (!stats) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center">
          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const coverage = stats.total > 0 ? Math.round((stats.withPrice / stats.total) * 100) : 0;
  const todayPercent = stats.total > 0 ? Math.round((stats.updatedToday / stats.total) * 100) : 0;

  const timeSinceRefresh = Math.round((Date.now() - lastRefresh.getTime()) / 1000);

  return (
    <div className="space-y-3">
      {/* Live indicator */}
      <Card className="border-primary/30">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <h3 className="font-semibold text-sm">Automatický sync cen</h3>
              <Badge variant="outline" className="text-[9px] text-green-600 border-green-300">
                AKTIVNÍ — každé 2 min
              </Badge>
            </div>
            <Button onClick={fetchStats} variant="ghost" size="icon" className="h-7 w-7" disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              icon={<Activity className="w-4 h-4 text-primary" />}
              label="Pokryto cenami"
              value={`${coverage}%`}
              sub={`${stats.withPrice} / ${stats.total}`}
            />
            <MetricCard
              icon={<TrendingUp className="w-4 h-4 text-green-500" />}
              label="Aktualizováno dnes"
              value={stats.updatedToday.toString()}
              sub={`${todayPercent}% z celku`}
            />
            <MetricCard
              icon={<Clock className="w-4 h-4 text-blue-500" />}
              label="Poslední hodina"
              value={stats.updatedLastHour.toString()}
              sub={`~${Math.round(stats.updatedLastHour / 6 * 10) / 10}/min`}
            />
            <MetricCard
              icon={<AlertCircle className="w-4 h-4 text-orange-500" />}
              label="Čeká na sync"
              value={stats.neverUpdated.toString()}
              sub="bez ceny"
            />
          </div>

          {/* Coverage bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Pokrytí cenami</span>
              <span>{coverage}%</span>
            </div>
            <Progress value={coverage} />
          </div>

          {/* Today progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Dnešní progres</span>
              <span>{todayPercent}%</span>
            </div>
            <Progress value={todayPercent} />
          </div>

          <p className="text-[10px] text-muted-foreground text-right">
            Auto-refresh za {Math.max(0, 30 - timeSinceRefresh)}s
          </p>
        </CardContent>
      </Card>

      {/* Recent updates feed */}
      {stats.recentUpdates.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              Poslední aktualizace
            </h4>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {stats.recentUpdates.map((u, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                  <span className="font-mono text-muted-foreground">{u.oem_number}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{u.price_with_vat?.toLocaleString("cs")} Kč</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatTimeAgo(u.last_price_update)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const MetricCard = ({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) => (
  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
    <p className="text-lg font-bold">{value}</p>
    <p className="text-[10px] text-muted-foreground">{sub}</p>
  </div>
);

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "teď";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default AdminPriceSyncStats;
