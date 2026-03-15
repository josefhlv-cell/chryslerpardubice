import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Clock, User, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Session = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
};

type AdminInfo = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

const AdminActivityLog = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [admins, setAdmins] = useState<AdminInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);

      // Get admin user IDs
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = (roles || []).map((r: any) => r.user_id);

      if (adminIds.length === 0) {
        setLoading(false);
        return;
      }

      // Get admin profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", adminIds);
      setAdmins(profiles || []);

      // Calculate date range
      const now = new Date();
      let from: Date;
      if (period === "today") {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === "week") {
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const { data: sessionData } = await supabase
        .from("admin_sessions")
        .select("*")
        .in("user_id", adminIds)
        .gte("started_at", from.toISOString())
        .order("started_at", { ascending: false });

      setSessions(sessionData || []);
      setLoading(false);
    };

    fetch();
  }, [period]);

  const getAdminName = (userId: string) => {
    const admin = admins.find(a => a.user_id === userId);
    return admin?.full_name || admin?.email || userId.slice(0, 8);
  };

  const formatDuration = (minutes: number | null) => {
    if (minutes === null) return "probíhá…";
    if (minutes < 1) return "< 1 min";
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // Aggregate per admin
  const adminTotals = admins.map(admin => {
    const adminSessions = sessions.filter(s => s.user_id === admin.user_id);
    const totalMinutes = adminSessions.reduce((sum, s) => {
      if (s.duration_minutes !== null) return sum + s.duration_minutes;
      // Active session — calculate from start to now
      const start = new Date(s.started_at).getTime();
      return sum + (Date.now() - start) / 60000;
    }, 0);
    const activeSessions = adminSessions.filter(s => !s.ended_at);
    return {
      ...admin,
      totalMinutes,
      sessionCount: adminSessions.length,
      isOnline: activeSessions.length > 0,
    };
  }).sort((a, b) => b.totalMinutes - a.totalMinutes);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" /> Aktivita adminů
        </h3>
        <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Dnes</SelectItem>
            <SelectItem value="week">Týden</SelectItem>
            <SelectItem value="month">Měsíc</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Per-admin summary */}
      <div className="grid grid-cols-1 gap-3">
        {adminTotals.map(admin => (
          <Card key={admin.user_id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${admin.isOnline ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30"}`} />
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{getAdminName(admin.user_id)}</span>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">{formatDuration(admin.totalMinutes)}</p>
                  <p className="text-[10px] text-muted-foreground">{admin.sessionCount} session{admin.sessionCount !== 1 ? "s" : ""}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {adminTotals.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Žádná aktivita za zvolené období</p>
        )}
      </div>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium mb-3 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Poslední sessions
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {sessions.slice(0, 20).map(s => (
                <div key={s.id} className="flex justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${!s.ended_at ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                    <span className="text-muted-foreground">{getAdminName(s.user_id)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{formatTime(s.started_at)}</span>
                    <span className="font-semibold min-w-[50px] text-right">{formatDuration(s.duration_minutes)}</span>
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

export default AdminActivityLog;
