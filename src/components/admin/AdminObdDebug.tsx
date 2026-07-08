import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, Trash2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ObdHealthCheckCard from "@/components/obd/ObdHealthCheckCard";

type ObdDebugLog = {
  id: string;
  created_at: string;
  user_id: string | null;
  vehicle_id: string | null;
  adapter_id: string | null;
  adapter_name: string | null;
  connection_state: string | null;
  elm_profile: string | null;
  polling_paused: boolean | null;
  command_type: string | null;
  command: string | null;
  raw_response: string | null;
  cleaned_response: string | null;
  status: string | null;
  error: string | null;
  warnings: unknown;
  duration_ms: number | null;
  metadata: unknown;
};

const LIMIT_OPTIONS = [50, 100, 500];
const STATUS_OPTIONS = ["", "ok", "error", "timeout", "no_data", "warning", "info"];
const PROFILE_OPTIONS = ["", "debug", "simple"];

export default function AdminObdDebug() {
  const [logs, setLogs] = useState<ObdDebugLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState<number>(100);
  const [status, setStatus] = useState<string>("");
  const [commandType, setCommandType] = useState<string>("");
  const [commandQuery, setCommandQuery] = useState<string>("");
  const [errorOnly, setErrorOnly] = useState(false);
  const [userFilter, setUserFilter] = useState<string>("");
  const [vehicleFilter, setVehicleFilter] = useState<string>("");
  const [profileFilter, setProfileFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cleared, setCleared] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("obd_debug_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status) q = q.eq("status", status);
      if (commandType) q = q.eq("command_type", commandType);
      if (commandQuery) q = q.ilike("command", `%${commandQuery}%`);
      if (userFilter) q = q.eq("user_id", userFilter);
      if (vehicleFilter) q = q.eq("vehicle_id", vehicleFilter);
      if (profileFilter) q = q.eq("elm_profile", profileFilter);
      if (errorOnly) q = q.not("error", "is", null);

      const { data, error } = await q;
      if (error) throw error;
      setLogs((data ?? []) as ObdDebugLog[]);
      setCleared(false);
    } catch (e: any) {
      toast({ title: "Chyba načtení logů", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [limit, status, commandType, commandQuery, userFilter, vehicleFilter, profileFilter, errorOnly]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const commandTypes = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((l) => l.command_type && s.add(l.command_type));
    return Array.from(s).sort();
  }, [logs]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearView = () => {
    setLogs([]);
    setCleared(true);
    setExpanded(new Set());
  };

  const deleteAll = async () => {
    if (!confirm("Opravdu smazat VŠECHNY OBD debug logy z databáze? Tato akce je nevratná.")) return;
    try {
      const { error } = await supabase.from("obd_debug_logs").delete().not("id", "is", null);
      if (error) throw error;
      toast({ title: "Smazáno", description: "Všechny OBD debug logy byly odstraněny." });
      await fetchLogs();
    } catch (e: any) {
      toast({ title: "Chyba mazání", description: String(e?.message ?? e), variant: "destructive" });
    }
  };

  const statusColor = (s: string | null) => {
    switch (s) {
      case "ok": return "bg-green-500/15 text-green-400 border-green-500/30";
      case "error": return "bg-red-500/15 text-red-400 border-red-500/30";
      case "timeout": return "bg-orange-500/15 text-orange-400 border-orange-500/30";
      case "no_data": return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
      case "warning": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-primary" />
            OBD Debug — reálné logy BLE / ELM / DTC / Stellantis
          </h2>
          <p className="text-xs text-muted-foreground">
            Samostatná admin záložka. Nemíchá se s běžnou diagnostikou ani Stellantis panelem.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={clearView}>Clear view</Button>
          <Button size="sm" variant="destructive" onClick={deleteAll}>
            <Trash2 className="w-4 h-4 mr-1" /> Smazat vše (admin)
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Filtry</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <label className="text-xs text-muted-foreground">Limit</label>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Vše" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s || "_all"} value={s || "_all"}>{s || "Vše"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Command type</label>
            <Select value={commandType} onValueChange={(v) => setCommandType(v === "_all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Vše" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Vše</SelectItem>
                {commandTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">ELM profil</label>
            <Select value={profileFilter} onValueChange={(v) => setProfileFilter(v === "_all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Vše" /></SelectTrigger>
              <SelectContent>
                {PROFILE_OPTIONS.map((s) => <SelectItem key={s || "_all"} value={s || "_all"}>{s || "Vše"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Command obsahuje</label>
            <Input value={commandQuery} onChange={(e) => setCommandQuery(e.target.value)} placeholder="např. 03, 22F190" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">User ID</label>
            <Input value={userFilter} onChange={(e) => setUserFilter(e.target.value)} placeholder="uuid" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Vehicle ID</label>
            <Input value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} placeholder="uuid" />
          </div>
          <div className="flex items-end gap-2">
            <Checkbox id="err-only" checked={errorOnly} onCheckedChange={(v) => setErrorOnly(!!v)} />
            <label htmlFor="err-only" className="text-xs">Pouze chyby</label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Logy ({logs.length}) {cleared && <span className="text-xs text-muted-foreground">— view vyčištěn</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {logs.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground py-6 text-center">Žádné logy. Připojte adaptér a proveďte scan.</p>
          )}
          {logs.map((l) => {
            const isOpen = expanded.has(l.id);
            return (
              <div key={l.id} className="border border-border rounded-md text-xs">
                <button
                  onClick={() => toggle(l.id)}
                  className="w-full flex items-center gap-2 p-2 hover:bg-muted/40 text-left"
                >
                  {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <span className="text-muted-foreground w-32 shrink-0">
                    {new Date(l.created_at).toLocaleTimeString("cs-CZ", { hour12: false })}
                    <span className="text-[10px] block">{new Date(l.created_at).toLocaleDateString("cs-CZ")}</span>
                  </span>
                  <Badge variant="outline" className={statusColor(l.status)}>{l.status || "?"}</Badge>
                  <Badge variant="outline" className="font-mono">{l.command_type || "-"}</Badge>
                  <span className="font-mono truncate flex-1">{l.command || "—"}</span>
                  {l.elm_profile && <Badge variant="secondary" className="text-[10px]">{l.elm_profile}</Badge>}
                  {l.polling_paused && <Badge variant="secondary" className="text-[10px]">paused</Badge>}
                  {typeof l.duration_ms === "number" && (
                    <span className="text-muted-foreground text-[10px]">{l.duration_ms}ms</span>
                  )}
                  {l.error && <Badge variant="destructive" className="text-[10px]">err</Badge>}
                </button>
                {isOpen && (
                  <div className="p-3 border-t border-border bg-muted/20 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><span className="text-muted-foreground">user_id:</span> <span className="font-mono">{l.user_id || "—"}</span></div>
                      <div><span className="text-muted-foreground">vehicle_id:</span> <span className="font-mono">{l.vehicle_id || "—"}</span></div>
                      <div><span className="text-muted-foreground">adapter:</span> {l.adapter_name || l.adapter_id || "—"}</div>
                      <div><span className="text-muted-foreground">connection:</span> {l.connection_state || "—"}</div>
                    </div>
                    {l.error && (
                      <div><div className="text-muted-foreground text-[11px] mb-1">error:</div>
                        <pre className="bg-red-500/10 text-red-300 p-2 rounded overflow-x-auto whitespace-pre-wrap">{l.error}</pre>
                      </div>
                    )}
                    {l.warnings != null && (
                      <div><div className="text-muted-foreground text-[11px] mb-1">warnings:</div>
                        <pre className="bg-amber-500/10 text-amber-300 p-2 rounded overflow-x-auto whitespace-pre-wrap">{JSON.stringify(l.warnings, null, 2)}</pre>
                      </div>
                    )}
                    {l.raw_response && (
                      <div><div className="text-muted-foreground text-[11px] mb-1">raw_response:</div>
                        <pre className="bg-background p-2 rounded overflow-x-auto whitespace-pre-wrap font-mono">{l.raw_response}</pre>
                      </div>
                    )}
                    {l.cleaned_response && (
                      <div><div className="text-muted-foreground text-[11px] mb-1">cleaned_response:</div>
                        <pre className="bg-background p-2 rounded overflow-x-auto whitespace-pre-wrap font-mono">{l.cleaned_response}</pre>
                      </div>
                    )}
                    {l.metadata != null && (
                      <div><div className="text-muted-foreground text-[11px] mb-1">metadata:</div>
                        <pre className="bg-background p-2 rounded overflow-x-auto whitespace-pre-wrap">{JSON.stringify(l.metadata, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
