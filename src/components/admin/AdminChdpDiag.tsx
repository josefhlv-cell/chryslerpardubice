/**
 * AdminChdpDiag — sjednocené admin rozhraní pro CHDP OBD diagnostiku.
 * Výběr zákazníka a vozidla → stav online/offline → live hodnoty a DTC → vzdálené příkazy.
 *
 * Data:
 *  - profiles              → seznam zákazníků
 *  - user_vehicles         → jejich vozy (VIN, SPZ, značka/model)
 *  - obd_live_sessions     → poslední živá relace na uživatele (payload, dtcs, last_seen)
 *  - obd_remote_commands   → fronta vzdálených příkazů (server-to-device)
 *  - obd_permissions       → co má admin dovoleno posílat
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Activity, Wifi, WifiOff, Search, User as UserIcon, Car, RefreshCw,
  ListChecks, Trash2, Send, Lock, Radio, Gauge, Thermometer, AlertTriangle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DEFAULT_OBD_PERMISSIONS, type ObdPermissions } from "@/hooks/obd/use-obd-permissions";
import { resolveDTCInfo } from "@/lib/obd/dtc-engine";
import AdminObdPermissions from "@/components/admin/AdminObdPermissions";
import { DpfCard } from "@/components/obd/DpfCard";

interface CustomerRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  vehicles: VehicleRow[];
  session?: SessionRow;
}

interface VehicleRow {
  id: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  spz: string | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  vin: string | null;
  started_at: string;
  last_seen: string;
  is_active: boolean;
  payload: any;
  dtcs: any[];
}

interface CommandRow {
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

const LIVE_WINDOW_MS = 60_000;

const AdminChdpDiag = () => {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<ObdPermissions>(DEFAULT_OBD_PERMISSIONS);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [customCmd, setCustomCmd] = useState("");

  const loadAll = async () => {
    setLoading(true);
    const [{ data: profs }, { data: vehs }, { data: sess }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, phone").order("full_name", { ascending: true }),
      supabase.from("user_vehicles").select("id, user_id, brand, model, year, vin, spz"),
      supabase.from("obd_live_sessions").select("*").order("last_seen", { ascending: false }),
    ]);

    const vehiclesByUser = new Map<string, VehicleRow[]>();
    for (const v of (vehs as any[]) || []) {
      const arr = vehiclesByUser.get(v.user_id) || [];
      arr.push({ id: v.id, brand: v.brand, model: v.model, year: v.year, vin: v.vin, spz: v.spz });
      vehiclesByUser.set(v.user_id, arr);
    }

    // Poslední relace per user (list už je seřazený DESC podle last_seen)
    const sessionByUser = new Map<string, SessionRow>();
    for (const s of (sess as any[]) || []) {
      if (!sessionByUser.has(s.user_id)) sessionByUser.set(s.user_id, s as SessionRow);
    }

    const rows: CustomerRow[] = ((profs as any[]) || []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      vehicles: vehiclesByUser.get(p.user_id) || [],
      session: sessionByUser.get(p.user_id),
    }));

    // Seřaď: online první, pak podle jména
    rows.sort((a, b) => {
      const aLive = isLive(a.session) ? 0 : 1;
      const bLive = isLive(b.session) ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return (a.full_name || "").localeCompare(b.full_name || "", "cs");
    });

    setCustomers(rows);
    setLoading(false);
  };

  const loadPermissions = async (userId: string) => {
    const { data } = await supabase.from("obd_permissions").select("*").eq("user_id", userId).maybeSingle();
    setPermissions({ ...DEFAULT_OBD_PERMISSIONS, ...((data as any) || {}) });
  };

  const loadCommands = async (userId: string) => {
    const { data } = await supabase
      .from("obd_remote_commands")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    setCommands((data as CommandRow[]) || []);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("admin-chdp-diag")
      .on("postgres_changes", { event: "*", schema: "public", table: "obd_live_sessions" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "obd_remote_commands" }, (payload) => {
        if (selectedUser && (payload.new as any)?.user_id === selectedUser) loadCommands(selectedUser);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUser) return;
    loadPermissions(selectedUser);
    loadCommands(selectedUser);
    // Auto-výběr prvního vozu
    const c = customers.find((x) => x.user_id === selectedUser);
    if (c && !c.vehicles.some((v) => v.id === selectedVehicle)) {
      setSelectedVehicle(c.vehicles[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser]);

  // Klient-side timeout pro pending/running příkazy starší než 30 s
  useEffect(() => {
    if (!selectedUser) return;
    const iv = window.setInterval(async () => {
      const stuck = commands.filter(
        (c) =>
          (c.status === "pending" || c.status === "running") &&
          Date.now() - new Date(c.created_at).getTime() > 30_000,
      );
      if (stuck.length === 0) return;
      await supabase
        .from("obd_remote_commands")
        .update({ status: "error", error: "timeout — zákazník neodpověděl do 30 s" } as any)
        .in("id", stuck.map((c) => c.id));
      loadCommands(selectedUser);
    }, 5000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, commands]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const hay = [
        c.full_name, c.email, c.phone,
        ...c.vehicles.flatMap((v) => [v.brand, v.model, v.vin, v.spz]),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [customers, search]);

  const active = customers.find((c) => c.user_id === selectedUser) || null;
  const activeVehicle = active?.vehicles.find((v) => v.id === selectedVehicle) || null;
  const session = active?.session;
  const live = isLive(session);

  const sendCmd = async (command_type: string, payload: Record<string, unknown> = {}) => {
    if (!selectedUser) return;
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("obd_remote_commands").insert({
      user_id: selectedUser,
      command_type,
      command_payload: { ...payload, vehicle_id: selectedVehicle } as any,
      status: "pending",
      created_by: authData.user?.id ?? null,
    });
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Příkaz zařazen", description: command_type });
    loadCommands(selectedUser);
  };

  const sendCustom = async () => {
    const c = customCmd.trim().toUpperCase();
    if (!c) return;
    setCustomCmd("");
    await sendCmd("custom_command", { command: c });
  };

  const statusClass = (s: string) =>
    s === "done" ? "bg-success/15 text-success border-success/30"
    : s === "error" ? "bg-destructive/15 text-destructive border-destructive/30"
    : s === "running" ? "bg-primary/15 text-primary border-primary/30"
    : "bg-muted text-muted-foreground border-border";

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      {/* ═══ LEVÝ SLOUPEC — VÝBĚR ZÁKAZNÍKA ═══ */}
      <Card className="lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] overflow-hidden flex flex-col">
        <CardContent className="p-3 space-y-2 flex flex-col min-h-0">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold flex-1">CHDP diag — zákazníci</h2>
            <Button size="icon" variant="ghost" onClick={loadAll} title="Obnovit">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hledat jméno, VIN, SPZ…"
              className="pl-7 h-8 text-xs"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {filtered.length} / {customers.length} · online: {customers.filter((c) => isLive(c.session)).length}
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-1">
            {loading && <p className="text-xs text-muted-foreground">Načítám…</p>}
            {!loading && filtered.length === 0 && <p className="text-xs text-muted-foreground">Nic nenalezeno.</p>}
            {filtered.map((c) => (
              <button
                key={c.user_id}
                onClick={() => setSelectedUser(c.user_id)}
                className={`w-full text-left rounded-md border p-2 transition ${
                  selectedUser === c.user_id
                    ? "border-primary bg-primary/10"
                    : "border-border/30 hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserIcon className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs font-medium truncate flex-1">{c.full_name || "—"}</span>
                  {isLive(c.session) ? (
                    <Wifi className="w-3 h-3 text-success" />
                  ) : c.session ? (
                    <WifiOff className="w-3 h-3 text-muted-foreground" />
                  ) : null}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{c.email || "—"}</p>
                <p className="text-[10px] text-muted-foreground">🚗 {c.vehicles.length} · DTC: {c.session?.dtcs?.length ?? 0}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ═══ PRAVÝ SLOUPEC — DETAIL ═══ */}
      <div className="space-y-3 min-w-0">
        {!active && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Vyberte zákazníka vlevo a začněte s CHDP diagnostikou.
            </CardContent>
          </Card>
        )}

        {active && (
          <>
            {/* Header — kdo, jaké vozidlo, stav */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-lg font-semibold">{active.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{active.email} · {active.phone || "bez telefonu"}</p>
                  </div>
                  {live ? (
                    <Badge className="bg-success/20 text-success border-success/40 gap-1"><Wifi className="w-3 h-3" /> ONLINE</Badge>
                  ) : session ? (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      <WifiOff className="w-3 h-3" /> Offline · {new Date(session.last_seen).toLocaleString("cs-CZ")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      <Radio className="w-3 h-3" /> Bez OBD relace
                    </Badge>
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium mb-1 flex items-center gap-1"><Car className="w-3 h-3" /> Vozidlo</p>
                  {active.vehicles.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Zákazník nemá evidované vozidlo.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {active.vehicles.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => setSelectedVehicle(v.id)}
                          className={`text-[11px] px-2 py-1 rounded border transition ${
                            selectedVehicle === v.id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/40 hover:border-primary/40"
                          }`}
                        >
                          {v.brand} {v.model} {v.year ? `(${v.year})` : ""} · {v.spz || v.vin?.slice(-6) || "—"}
                        </button>
                      ))}
                    </div>
                  )}
                  {activeVehicle?.vin && (
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono">VIN: {activeVehicle.vin}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Live hodnoty */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-primary" /> Živé hodnoty
                </h3>
                {!permissions.live_data ? (
                  <div className="rounded border p-3 text-xs text-muted-foreground flex gap-2">
                    <Lock className="w-4 h-4" /> Zákazník nemá povolen přenos živých dat.
                  </div>
                ) : !session ? (
                  <p className="text-xs text-muted-foreground">Bez dat — zákazník ještě neaktivoval OBD.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <LiveTile label="RPM" value={pickNum(session.payload, ["rpm", "010C"])} unit="ot/min" icon={Gauge} />
                    <LiveTile label="Rychlost" value={pickNum(session.payload, ["speed", "010D"])} unit="km/h" icon={Gauge} />
                    <LiveTile label="Teplota" value={pickNum(session.payload, ["coolant", "0105"])} unit="°C" icon={Thermometer} />
                    <LiveTile label="Plyn" value={pickNum(session.payload, ["throttle", "0111"])} unit="%" icon={Gauge} />
                  </div>
                )}
                {session?.payload && (
                  <details className="text-[10px] text-muted-foreground">
                    <summary className="cursor-pointer">Raw payload</summary>
                    <pre className="mt-1 p-2 bg-muted/30 rounded overflow-auto max-h-40">{JSON.stringify(session.payload, null, 2)}</pre>
                  </details>
                )}
              </CardContent>
            </Card>

            {/* DTC */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" /> Chybové kódy (DTC)
                </h3>
                {!permissions.dtc_read ? (
                  <div className="rounded border p-3 text-xs text-muted-foreground flex gap-2">
                    <Lock className="w-4 h-4" /> Čtení DTC vypnuto.
                  </div>
                ) : !session?.dtcs?.length ? (
                  <p className="text-xs text-muted-foreground">Žádné aktivní chybové kódy.</p>
                ) : (
                  <div className="space-y-1">
                    {session.dtcs.map((d: any, i: number) => {
                      const code = typeof d === "string" ? d : d.code;
                      const info = resolveDTCInfo(code);
                      const sev =
                        info.severity === "critical" || info.severity === "high"
                          ? "text-destructive border-destructive/40"
                          : info.severity === "medium"
                          ? "text-amber-500 border-amber-500/40"
                          : "text-muted-foreground";
                      return (
                        <div key={i} className={`rounded border p-2 text-[11px] flex items-start gap-2 ${sev}`}>
                          <Badge variant="outline" className="font-mono">{code}</Badge>
                          <span className="flex-1">{info.description}</span>
                          <span className="uppercase text-[9px] opacity-70">{info.severity}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* DPF panel */}
            <Card>
              <CardContent className="p-4">
                <DpfCard
                  admin
                  dpf={session?.payload?.dpf ?? null}
                  onRequestSnapshot={() => sendCmd("dpf_status")}
                  requestPending={commands.some(
                    (c) => (c.command_type === "dpf_status" || c.command_type === "dpf") && (c.status === "pending" || c.status === "running"),
                  )}
                  requestDisabledReason={
                    !live
                      ? "Zákazník není online"
                      : !permissions.dpf
                        ? "DPF není povoleno v oprávněních"
                        : undefined
                  }
                />
              </CardContent>
            </Card>

            {/* Vzdálené příkazy */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" /> Vzdálené příkazy
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => sendCmd("read_dtc")} disabled={!live}>
                    <ListChecks className="w-3.5 h-3.5 mr-1" /> Číst DTC
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => sendCmd("clear_dtc")} disabled={!live || !permissions.dtc_clear}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Mazat DTC
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => sendCmd("refresh_live")} disabled={!live}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh live
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => sendCmd("dpf_status")} disabled={!live || !permissions.dpf}>
                    DPF stav
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => sendCmd("dpf_regen")} disabled={!live || !permissions.dpf}>
                    DPF regen
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={customCmd}
                    onChange={(e) => setCustomCmd(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendCustom()}
                    placeholder="Vlastní AT/OBD příkaz (např. 03, 0902)"
                    className="font-mono text-xs h-8"
                    disabled={!live || !permissions.terminal}
                  />
                  <Button size="sm" onClick={sendCustom} disabled={!live || !customCmd.trim() || !permissions.terminal}>
                    <Send className="w-3.5 h-3.5 mr-1" /> Odeslat
                  </Button>
                </div>
                {!live && (
                  <p className="text-[10px] text-muted-foreground">
                    Zákazník musí mít otevřenou aplikaci a být online. Příkazy se doručí automaticky, jakmile se připojí.
                  </p>
                )}

                <div className="space-y-1 pt-1">
                  <p className="text-xs font-medium">Poslední příkazy ({commands.length})</p>
                  {commands.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Žádné.</p>
                  ) : (
                    commands.map((cmd) => (
                      <div key={cmd.id} className="rounded border border-border/30 p-2 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono truncate">{cmd.command_type}</span>
                          <Badge variant="outline" className={statusClass(cmd.status)}>{cmd.status}</Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{new Date(cmd.created_at).toLocaleString("cs-CZ")}</p>
                        {cmd.result && (
                          <pre className="bg-muted/30 rounded p-1.5 text-[10px] overflow-auto max-h-24">{JSON.stringify(cmd.result, null, 2)}</pre>
                        )}
                        {cmd.error && <p className="text-[10px] text-destructive">{cmd.error}</p>}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Oprávnění */}
            <AdminObdPermissions userId={active.user_id} userLabel={active.full_name || active.email || undefined} />
          </>
        )}
      </div>
    </div>
  );
};

function isLive(s?: SessionRow) {
  if (!s) return false;
  return s.is_active && Date.now() - new Date(s.last_seen).getTime() < LIVE_WINDOW_MS;
}

function pickNum(obj: any, keys: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return v;
    if (v && typeof v === "object" && typeof v.value === "number") return v.value;
  }
  return null;
}

function LiveTile({
  label, value, unit, icon: Icon,
}: { label: string; value: number | null; unit: string; icon: any }) {
  return (
    <div className="rounded-lg border border-border/40 p-2 bg-secondary/20">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">
        {value == null ? "—" : Math.round(value * 10) / 10}
        <span className="text-[10px] text-muted-foreground ml-1">{unit}</span>
      </div>
    </div>
  );
}

export default AdminChdpDiag;
