/**
 * AdminRemoteOBD — vzdálená diagnostika.
 * Admin vidí seznam zákazníků se souhlasem a jejich aktivní OBD relace v realtime.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, ShieldCheck, ShieldX, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Session {
  id: string;
  user_id: string;
  vin: string | null;
  started_at: string;
  last_seen: string;
  is_active: boolean;
  payload: any;
  dtcs: any[];
  profile_name?: string;
  profile_email?: string;
}

const AdminRemoteOBD = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Session | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("obd_live_sessions")
      .select("*")
      .order("last_seen", { ascending: false })
      .limit(100);
    const list = (data as any[]) || [];
    const userIds = [...new Set(list.map((s) => s.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", userIds);
    const map = new Map((profiles || []).map((p) => [p.user_id, p]));
    setSessions(
      list.map((s) => ({
        ...s,
        profile_name: map.get(s.user_id)?.full_name || "—",
        profile_email: map.get(s.user_id)?.email || "—",
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();
    const channel = supabase
      .channel("admin-obd-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "obd_live_sessions" },
        () => fetchSessions(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isLive = (s: Session) =>
    s.is_active && Date.now() - new Date(s.last_seen).getTime() < 60_000;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Vzdálená diagnostika
          </h2>
          <p className="text-xs text-muted-foreground">
            Vidíš jen zákazníky, kteří v profilu povolili sdílení diagnostiky.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchSessions}>
          Obnovit
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Načítám…</p>}
      {!loading && sessions.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            <ShieldX className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Žádné aktivní OBD relace se souhlasem.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-2 lg:grid-cols-2">
        {sessions.map((s) => (
          <Card
            key={s.id}
            className={`cursor-pointer transition-colors ${
              selected?.id === s.id ? "border-primary" : "hover:border-primary/40"
            }`}
            onClick={() => setSelected(s)}
          >
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{s.profile_name}</p>
                  <p className="text-[10px] text-muted-foreground">{s.profile_email}</p>
                </div>
                {isLive(s) ? (
                  <Badge className="bg-success/15 text-success border-success/30 gap-1">
                    <Wifi className="w-3 h-3" /> LIVE
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                    <WifiOff className="w-3 h-3" /> Offline
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                VIN: {s.vin || "—"} · DTCs: {Array.isArray(s.dtcs) ? s.dtcs.length : 0}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Posl. signál: {new Date(s.last_seen).toLocaleString("cs-CZ")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {selected && (
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-success" />
                Detail relace · {selected.profile_name}
              </h3>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Zavřít
              </Button>
            </div>
            <div className="space-y-2 text-xs">
              <p>
                <strong>VIN:</strong> {selected.vin || "—"}
              </p>
              <div>
                <strong>Aktuální PIDs:</strong>
                <pre className="mt-1 p-2 bg-muted/30 rounded text-[10px] overflow-x-auto">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
              <div>
                <strong>DTC kódy ({Array.isArray(selected.dtcs) ? selected.dtcs.length : 0}):</strong>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(selected.dtcs || []).map((d: any, i: number) => (
                    <Badge key={i} variant="outline">
                      {typeof d === "string" ? d : d.code}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminRemoteOBD;
