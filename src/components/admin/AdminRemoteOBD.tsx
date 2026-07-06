/** AdminRemoteOBD — vzdálená diagnostika nad aktivními zákaznickými OBD relacemi. */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, ShieldCheck, Wifi, WifiOff, Lock, RefreshCw, Trash2, ListChecks, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { DEFAULT_OBD_PERMISSIONS, type ObdPermissions } from "@/hooks/obd/use-obd-permissions";
import { resolveDTCInfo } from "@/lib/obd/dtc-engine";

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
  permissions?: ObdPermissions;
}

interface RemoteCommand {
  id: string;
  user_id: string;
  command_type: string;
  command_payload: any;
  status: string;
  result: any;
  error: string | null;
  created_at: string;
  executed_at: string | null;
}

const PermissionBadge = ({ enabled, children }: { enabled: boolean; children: string }) => (
  <Badge variant="outline" className={enabled ? "text-success border-success/30" : "text-muted-foreground border-border/40"}>
    {enabled ? children : `Bez ${children}`}
  </Badge>
);

const AdminRemoteOBD = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [commands, setCommands] = useState<RemoteCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Session | null>(null);
  const [customCommand, setCustomCommand] = useState("");

  const fetchCommands = async (userId: string) => {
    const { data, error } = await supabase
      .from("obd_remote_commands")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);
    if (!error) setCommands((data || []) as RemoteCommand[]);
  };

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
      supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds),
      supabase.from("obd_permissions").select("*").in("user_id", userIds),
    ]);

    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    const permissionMap = new Map((permissions || []).map((p: any) => [p.user_id, p]));

    const mapped = list.map((s) => ({
      ...s,
      profile_name: profileMap.get(s.user_id)?.full_name || "—",
      profile_email: profileMap.get(s.user_id)?.email || "—",
      permissions: { ...DEFAULT_OBD_PERMISSIONS, ...((permissionMap.get(s.user_id) as Record<string, unknown>) || {}) },
    }));

    setSessions(mapped);
    setSelected((prev) => (prev ? mapped.find((s) => s.id === prev.id) || prev : prev));
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();
    const channel = supabase
      .channel("admin-obd-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "obd_live_sessions" }, () => fetchSessions())
      .on("postgres_changes", { event: "*", schema: "public", table: "obd_permissions" }, () => fetchSessions())
      .on("postgres_changes", { event: "*", schema: "public", table: "obd_remote_commands" }, (payload) => {
        if (selected && (payload.new as any)?.user_id === selected.user_id) fetchCommands(selected.user_id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.user_id]);

  useEffect(() => {
    if (selected) fetchCommands(selected.user_id);
  }, [selected?.user_id]);

  const isLive = (s: Session) => s.is_active && Date.now() - new Date(s.last_seen).getTime() < 60_000;
  const visibleSessions = useMemo(() => sessions, [sessions]);

  const sendRemoteCommand = async (commandType: string, payload: Record<string, unknown> = {}) => {
    if (!selected) return;
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("obd_remote_commands").insert({
      user_id: selected.user_id,
      command_type: commandType,
      command_payload: payload as any,
      status: "pending",
      created_by: authData.user?.id ?? null,
    });

    if (error) {
      toast({ title: "Chyba vzdáleného příkazu", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Příkaz odeslán", description: commandType });
    fetchCommands(selected.user_id);
  };

  const sendCustom = async () => {
    const command = customCommand.trim().toUpperCase();
    if (!command) return;
    setCustomCommand("");
    await sendRemoteCommand("custom_command", { command });
  };

  const statusClass = (status: string) => {
    if (status === "done") return "bg-success/15 text-success border-success/30";
    if (status === "error") return "bg-destructive/15 text-destructive border-destructive/30";
    if (status === "running") return "bg-primary/15 text-primary border-primary/30";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Vzdálená diagnostika
          </h2>
          <p className="text-xs text-muted-foreground">Aktivní zákaznické OBD relace, live data, DTC a vzdálené příkazy.</p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchSessions}>Obnovit</Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Načítám…</p>}

      {!loading && visibleSessions.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Žádné OBD relace.</CardContent></Card>
      )}

      <div className="grid gap-2 lg:grid-cols-2">
        {visibleSessions.map((s) => (
          <Card key={s.id} className={`cursor-pointer transition-colors ${selected?.id === s.id ? "border-primary" : "hover:border-primary/40"}`} onClick={() => setSelected(s)}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">{s.profile_name}</p><p className="text-[10px] text-muted-foreground">{s.profile_email}</p></div>
                {isLive(s) ? <Badge className="bg-success/15 text-success border-success/30 gap-1"><Wifi className="w-3 h-3" /> LIVE</Badge> : <Badge variant="outline" className="gap-1 text-muted-foreground"><WifiOff className="w-3 h-3" /> Offline</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground">VIN: {s.vin || "—"} · DTCs: {Array.isArray(s.dtcs) ? s.dtcs.length : 0}</p>
              <div className="flex flex-wrap gap-1">
                <PermissionBadge enabled={!!s.permissions?.live_data}>Live</PermissionBadge>
                <PermissionBadge enabled={!!s.permissions?.dtc_read}>DTC</PermissionBadge>
                <PermissionBadge enabled={!!s.permissions?.dtc_clear}>Mazání</PermissionBadge>
                <PermissionBadge enabled={!!s.permissions?.terminal}>Terminál</PermissionBadge>
              </div>
              <p className="text-[10px] text-muted-foreground">Posl. signál: {new Date(s.last_seen).toLocaleString("cs-CZ")}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {selected && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-success" /> Detail relace · {selected.profile_name}</h3>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Zavřít</Button>
            </div>

            <div className="flex flex-wrap gap-1">
              <PermissionBadge enabled={!!selected.permissions?.live_data}>Live Data</PermissionBadge>
              <PermissionBadge enabled={!!selected.permissions?.dtc_read}>Čtení DTC</PermissionBadge>
              <PermissionBadge enabled={!!selected.permissions?.dtc_clear}>Mazání DTC</PermissionBadge>
              <PermissionBadge enabled={!!selected.permissions?.can_bus}>CAN</PermissionBadge>
              <PermissionBadge enabled={!!selected.permissions?.uds}>UDS</PermissionBadge>
              <PermissionBadge enabled={!!selected.permissions?.coding}>Kódování</PermissionBadge>
              <PermissionBadge enabled={!!selected.permissions?.flash}>Flash</PermissionBadge>
            </div>

            {selected.permissions?.live_data ? (
              <div><strong className="text-xs">Live data:</strong><pre className="mt-1 p-2 bg-muted/30 rounded text-[10px] overflow-x-auto max-h-56">{JSON.stringify(selected.payload, null, 2)}</pre></div>
            ) : <div className="rounded-lg border p-3 text-muted-foreground flex gap-2 text-xs"><Lock className="w-4 h-4" /> Live Data jsou vypnutá.</div>}

            {selected.permissions?.dtc_read ? (
              <div>
                <strong className="text-xs">DTC kódy ({Array.isArray(selected.dtcs) ? selected.dtcs.length : 0}):</strong>
                <div className="mt-1 space-y-1">
                  {(selected.dtcs || []).length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Žádné aktivní kódy.</p>
                  )}
                  {(selected.dtcs || []).map((d: any, i: number) => {
                    const code = typeof d === "string" ? d : d.code;
                    const info = typeof d === "string" ? resolveDTCInfo(d) : {
                      description: d.description || resolveDTCInfo(code).description,
                      severity: d.severity || resolveDTCInfo(code).severity,
                    };
                    const sevColor = info.severity === "critical" || info.severity === "high"
                      ? "text-destructive border-destructive/40"
                      : info.severity === "medium" ? "text-amber-500 border-amber-500/40"
                      : "text-muted-foreground";
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded border p-2 text-[11px] ${sevColor}`}>
                        <Badge variant="outline" className="font-mono">{code}</Badge>
                        <span className="flex-1">{info.description}</span>
                        <span className="uppercase text-[9px] opacity-70">{info.severity}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : <div className="rounded-lg border p-3 text-muted-foreground flex gap-2 text-xs"><Lock className="w-4 h-4" /> Čtení DTC je vypnuté.</div>}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => sendRemoteCommand("read_dtc")} disabled={!isLive(selected)}><ListChecks className="w-3.5 h-3.5 mr-1" /> Číst DTC</Button>
              <Button size="sm" variant="outline" onClick={() => sendRemoteCommand("full_dtc_scan")} disabled={!isLive(selected)}><ListChecks className="w-3.5 h-3.5 mr-1" /> Všechny ECU</Button>
              <Button size="sm" variant="outline" onClick={() => sendRemoteCommand("clear_dtc")} disabled={!isLive(selected)}><Trash2 className="w-3.5 h-3.5 mr-1" /> Mazat DTC</Button>
              <Button size="sm" variant="outline" onClick={() => sendRemoteCommand("refresh_live")} disabled={!isLive(selected)}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh</Button>
            </div>

            <div className="flex gap-2">
              <Input value={customCommand} onChange={(e) => setCustomCommand(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendCustom()} placeholder="Vlastní OBD/AT příkaz" className="font-mono text-xs" disabled={!isLive(selected)} />
              <Button size="sm" onClick={sendCustom} disabled={!isLive(selected) || !customCommand.trim()}><Send className="w-3.5 h-3.5 mr-1" /> Odeslat</Button>
            </div>

            <div className="space-y-2">
              <strong className="text-xs">Stav příkazů</strong>
              {commands.length === 0 ? <p className="text-xs text-muted-foreground">Žádné příkazy.</p> : commands.map((cmd) => (
                <div key={cmd.id} className="rounded-lg border border-border/30 p-2 text-xs space-y-1">
                  <div className="flex items-center justify-between"><span className="font-mono">{cmd.command_type}</span><Badge variant="outline" className={statusClass(cmd.status)}>{cmd.status}</Badge></div>
                  <p className="text-[10px] text-muted-foreground">{new Date(cmd.created_at).toLocaleString("cs-CZ")}</p>
                  {cmd.result && <pre className="bg-muted/30 rounded p-2 text-[10px] overflow-auto max-h-28">{JSON.stringify(cmd.result, null, 2)}</pre>}
                  {cmd.error && <p className="text-[10px] text-destructive">{cmd.error}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminRemoteOBD;
