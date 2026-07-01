/**
 * AdminRemoteOBD — vzdálená diagnostika.
 * Admin vidí seznam zákazníků se souhlasem a jejich aktivní OBD relace v realtime.
 * Navíc respektuje individuální OBD oprávnění z tabulky customer_obd_permissions.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, ShieldCheck, ShieldX, Wifi, WifiOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CustomerObdPermissions {
  user_id: string;
  remote_obd: boolean;
  live_data: boolean;
  read_dtc: boolean;
  clear_dtc: boolean;
  gps: boolean;
  service_history: boolean;
  actuator_tests: boolean;
  adaptations: boolean;
  coding: boolean;
  ecu_flash: boolean;
  dpf_regen: boolean;
  epb_service: boolean;
  bms_reset: boolean;
  sos_mode: boolean;
}

const DEFAULT_PERMISSIONS: CustomerObdPermissions = {
  user_id: "",
  remote_obd: true,
  live_data: true,
  read_dtc: true,
  clear_dtc: false,
  gps: false,
  service_history: true,
  actuator_tests: false,
  adaptations: false,
  coding: false,
  ecu_flash: false,
  dpf_regen: false,
  epb_service: false,
  bms_reset: false,
  sos_mode: false,
};

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
  permissions?: CustomerObdPermissions;
}

const PermissionBadge = ({ enabled, children }: { enabled: boolean; children: string }) => (
  <Badge
    variant="outline"
    className={enabled ? "text-success border-success/30" : "text-muted-foreground border-border/40"}
  >
    {enabled ? children : `Bez ${children}`}
  </Badge>
);

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
    const userIds = [...new Set(list.map((s) => s.user_id).filter(Boolean))];

    if (userIds.length === 0) {
      setSessions([]);
      setLoading(false);
      return;
    }

    const [{ data: profiles }, { data: permissions }] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds),
      (supabase as any)
        .from("customer_obd_permissions")
        .select("*")
        .in("user_id", userIds),
    ]);

    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    const permissionMap = new Map((permissions || []).map((p: any) => [p.user_id, p]));

    setSessions(
      list.map((s) => {
        const p = permissionMap.get(s.user_id);

        const mergedPermissions: CustomerObdPermissions = {
          ...DEFAULT_PERMISSIONS,
          user_id: s.user_id,
          ...((p as Record<string, unknown>) || {}),
        };

        return {
          ...s,
          profile_name: profileMap.get(s.user_id)?.full_name || "—",
          profile_email: profileMap.get(s.user_id)?.email || "—",
          permissions: mergedPermissions,
        };
      }),
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_obd_permissions" },
        () => fetchSessions(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isLive = (s: Session) =>
    s.is_active && Date.now() - new Date(s.last_seen).getTime() < 60_000;

  const visibleSessions = useMemo(() => {
    return sessions.filter((s) => s.permissions?.remote_obd !== false);
  }, [sessions]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Vzdálená diagnostika
          </h2>
          <p className="text-xs text-muted-foreground">
            Vidíš zákazníky se souhlasem a s povolenou vzdálenou OBD diagnostikou.
            Jednotlivé funkce se řídí v kartě zákazníka → Oprávnění.
          </p>
        </div>

        <Button size="sm" variant="outline" onClick={fetchSessions}>
          Obnovit
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Načítám…</p>}

      {!loading && visibleSessions.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            <ShieldX className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Žádné aktivní OBD relace se souhlasem a povolenými oprávněními.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-2 lg:grid-cols-2">
        {visibleSessions.map((s) => (
          <Card
            key={s.id}
            className={`cursor-pointer transition-colors ${
              selected?.id === s.id ? "border-primary" : "hover:border-primary/40"
            }`}
            onClick={() => setSelected(s)}
          >
            <CardContent className="p-3 space-y-2">
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

              <div className="flex flex-wrap gap-1">
                <PermissionBadge enabled={!!s.permissions?.live_data}>Live</PermissionBadge>
                <PermissionBadge enabled={!!s.permissions?.read_dtc}>DTC</PermissionBadge>
                <PermissionBadge enabled={!!s.permissions?.clear_dtc}>Mazání</PermissionBadge>
                <PermissionBadge enabled={!!s.permissions?.gps}>GPS</PermissionBadge>
              </div>

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

            {!selected.permissions?.remote_obd ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs flex gap-2">
                <Lock className="w-4 h-4 text-destructive shrink-0" />
                Vzdálená OBD diagnostika je pro tohoto zákazníka vypnutá.
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <p>
                  <strong>VIN:</strong> {selected.vin || "—"}
                </p>

                <div className="flex flex-wrap gap-1">
                  <PermissionBadge enabled={!!selected.permissions?.live_data}>Live Data</PermissionBadge>
                  <PermissionBadge enabled={!!selected.permissions?.read_dtc}>Čtení DTC</PermissionBadge>
                  <PermissionBadge enabled={!!selected.permissions?.clear_dtc}>Mazání DTC</PermissionBadge>
                  <PermissionBadge enabled={!!selected.permissions?.gps}>GPS</PermissionBadge>
                  <PermissionBadge enabled={!!selected.permissions?.dpf_regen}>DPF</PermissionBadge>
                  <PermissionBadge enabled={!!selected.permissions?.coding}>Kódování</PermissionBadge>
                  <PermissionBadge enabled={!!selected.permissions?.ecu_flash}>Flash ECU</PermissionBadge>
                </div>

                {selected.permissions?.live_data ? (
                  <div>
                    <strong>Aktuální PIDs:</strong>
                    <pre className="mt-1 p-2 bg-muted/30 rounded text-[10px] overflow-x-auto">
                      {JSON.stringify(selected.payload, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/30 p-3 text-muted-foreground flex gap-2">
                    <Lock className="w-4 h-4 shrink-0" />
                    Live Data jsou pro tohoto zákazníka vypnutá.
                  </div>
                )}

                {selected.permissions?.read_dtc ? (
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
                ) : (
                  <div className="rounded-lg border border-border/30 p-3 text-muted-foreground flex gap-2">
                    <Lock className="w-4 h-4 shrink-0" />
                    Čtení DTC je pro tohoto zákazníka vypnuté.
                  </div>
                )}

                {!selected.permissions?.clear_dtc && (
                  <div className="rounded-lg border border-border/30 p-3 text-muted-foreground flex gap-2">
                    <Lock className="w-4 h-4 shrink-0" />
                    Mazání DTC je pro tohoto zákazníka vypnuté.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminRemoteOBD;