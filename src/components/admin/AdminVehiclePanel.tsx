/**
 * AdminVehiclePanel — technická diagnostická centrála pro admina.
 * Zobrazuje:
 *  - Rozpoznané vozidlo (z obd_live_sessions.payload.vehicleProfile)
 *  - PID cache vozidla (z tabulky obd_pid_cache podle VIN)
 *  - PID Discovery ovládání (read-only – přes obd_remote_commands)
 *  - Funkce dostupné pro vozidlo (resolveVehicleCapabilities)
 *  - Adaptér (payload.adapter, pokud existuje)
 *  - AI návrh (disabled, backend zatím není)
 *
 * Nevykonává žádné destruktivní příkazy sám.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Cpu, Database, Search, Zap, Wrench, ShieldAlert, Sparkles, RotateCcw, Download, Play,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  PID_PROFILES, resolveProfileFromBrand,
  type VehiclePidProfile,
} from "@/lib/obd/pid-profile-registry";
import {
  resolveVehicleCapabilities,
  type ObdCapability,
} from "@/lib/obd/vehicle-capability-resolver";

const UNKNOWN = "Neznámé";
const UNSUPPORTED = "Nepodporováno";

interface Props {
  userId: string;
  vin: string | null;
  sessionPayload: any;
  isLive: boolean;
  onSendCommand: (type: string, payload?: Record<string, unknown>) => Promise<void>;
}

interface PidCacheRow {
  id: string;
  key: string;
  header: string | null;
  command: string | null;
  response_prefix: string | null;
  decoder_id: string | null;
  unit: string | null;
  last_raw_response: string | null;
  last_valid_value: number | null;
  confidence: string | null;
  source: string | null;
  updated_at: string;
  vin: string | null;
}

export function AdminVehiclePanel({ userId, vin, sessionPayload, isLive, onSendCommand }: Props) {
  const vp = sessionPayload?.vehicleProfile || null;

  const profile: VehiclePidProfile = useMemo(() => {
    const pid = vp?.profileId as string | undefined;
    if (pid && PID_PROFILES[pid as keyof typeof PID_PROFILES]) {
      return PID_PROFILES[pid as keyof typeof PID_PROFILES];
    }
    return resolveProfileFromBrand(vp?.brand, vp?.protocolGroup);
  }, [vp]);

  const capabilities = useMemo(() => resolveVehicleCapabilities(profile), [profile]);
  const grouped = useMemo(() => groupCapabilities(capabilities), [capabilities]);

  const [pidCache, setPidCache] = useState<PidCacheRow[]>([]);
  const [loadingCache, setLoadingCache] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmCap, setConfirmCap] = useState<ObdCapability | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const loadCache = useCallback(async () => {
    if (!vin || !userId) { setPidCache([]); return; }
    setLoadingCache(true);
    const { data, error } = await supabase
      .from("obd_pid_cache" as any)
      .select("*")
      .eq("user_id", userId)
      .eq("vin", vin)
      .order("updated_at", { ascending: false });
    if (error) console.warn("[AdminVehiclePanel] pid cache load error", error);
    setPidCache(((data as any) || []) as PidCacheRow[]);
    setLoadingCache(false);
  }, [vin, userId]);

  useEffect(() => { loadCache(); }, [loadCache]);

  const doResetCache = async () => {
    if (!vin || !userId) return;
    const { error } = await supabase
      .from("obd_pid_cache" as any)
      .delete()
      .eq("user_id", userId)
      .eq("vin", vin);
    if (error) {
      toast({ title: "Reset selhal", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "PID cache vymazána", description: `VIN ${vin}` });
      await loadCache();
    }
    setResetOpen(false);
  };

  const runCapability = async (cap: ObdCapability) => {
    // Skutečně napojené bezpečné funkce
    const map: Record<string, { type: string; payload?: Record<string, unknown> } | null> = {
      read_vin: { type: "read_vin" },
      read_dtc: { type: "read_dtc" },
      read_live: { type: "refresh_live" },
      read_voltage: { type: "custom_at", payload: { command: "ATRV" } },
      pid_discovery: { type: "custom_at", payload: { command: "0100" } },
      trans_oil_temp: { type: "custom_at", payload: { command: "2130" } },
      dpf_data: { type: "dpf_status" },
      export_log: { type: "__local_export__" },
      clear_dtc: { type: "clear_dtc" },
    };
    const target = map[cap.id];
    if (!target) {
      toast({
        title: "Funkce vyžaduje lepší diagnostiku",
        description: `${cap.label} — v aktuálním OBD adaptéru není bezpečně implementována.`,
      });
      return;
    }
    if (target.type === "__local_export__") {
      exportRawLog(pidCache, vin, profile);
      return;
    }
    if (!isLive) {
      toast({ title: "Zákazník není online", variant: "destructive" });
      return;
    }
    try {
      await onSendCommand(target.type, target.payload);
      toast({ title: "Příkaz odeslán", description: cap.label });
    } catch (e) {
      toast({
        title: "Odeslání selhalo",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleCapabilityClick = (cap: ObdCapability) => {
    if (cap.riskLevel === "blocked") {
      toast({ title: "Funkce je blokována", description: cap.description });
      return;
    }
    if (cap.riskLevel === "medium" || cap.riskLevel === "high") {
      setConfirmCap(cap);
      setConfirmText("");
      return;
    }
    runCapability(cap);
  };

  const transOilCache = pidCache.find((p) => p.key === "transmissionOilTemp");
  const adapter = sessionPayload?.adapter || sessionPayload?.adapterCapabilities || null;

  return (
    <>
      {/* Rozpoznané vozidlo */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" /> Rozpoznané vozidlo
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <Field k="VIN" v={vp?.vin || vin} mono />
            <Field k="WMI" v={(vp?.vin || vin || "").slice(0, 3) || null} mono />
            <Field k="Značka" v={vp?.brand} />
            <Field k="Model" v={null} />
            <Field k="Rok" v={vp?.year ? String(vp.year) : null} />
            <Field k="Motor" v={null} />
            <Field k="Převodovka" v={profile.id === "chrysler_62te" ? "62TE" : null} />
            <Field k="Palivo" v={null} />
            <Field k="Platforma" v={null} />
            <Field k="Protocol group" v={vp?.protocolGroup} />
            <Field k="Profil" v={profile.label} />
            <Field k="Confidence" v={vp?.confidence} />
            <Field k="Source" v={vp?.source} />
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {profile.allowChryslerCustomPids ? (
              <Badge className="bg-primary/15 text-primary border-0 text-[10px]">
                Chrysler custom PIDy: povoleno
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Chrysler custom PIDy: zakázáno
              </Badge>
            )}
            {profile.id === "vag_can" && (
              <Badge variant="outline" className="text-[10px]">VAG pravidla aktivní</Badge>
            )}
            {profile.id === "unknown" && (
              <Badge variant="outline" className="text-[10px]">Unknown / generic profil</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Adaptér */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" /> Adaptér
          </h3>
          {adapter ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <Field k="Název" v={adapter.name} />
              <Field k="ELM verze" v={adapter.elmVersion || adapter.version} />
              <Field k="Protokol" v={adapter.protocol} />
              <Field k="Napětí" v={adapter.voltage} />
              <Field k="Headers" v={boolText(adapter.supportsHeaders)} />
              <Field k="Mode 22" v={boolText(adapter.supportsMode22)} />
              <Field k="Multi-frame" v={boolText(adapter.supportsMultiFrame)} />
              <Field k="CAN moduly" v={boolText(adapter.supportsCanModules)} />
              <Field k="Reliability" v={adapter.reliability} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Rozšířené vlastnosti adaptéru {UNKNOWN}. Tento adaptér je vhodný pro základní OBD-II data.
              Některé servisní funkce a moduly nemusí být dostupné.
            </p>
          )}
        </CardContent>
      </Card>

      {/* PID cache */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" /> PID cache vozidla
            </h3>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={loadCache} disabled={loadingCache || !vin}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Obnovit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setResetOpen(true)}
                disabled={!vin || pidCache.length === 0}
              >
                Resetovat pro VIN
              </Button>
            </div>
          </div>
          {!vin ? (
            <p className="text-xs text-muted-foreground">VIN vozidla není známý — cache není dostupná.</p>
          ) : pidCache.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {loadingCache ? "Načítám…" : "Žádné uložené PIDy pro toto vozidlo."}
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="text-[10px] text-muted-foreground">
                  <tr className="text-left">
                    <th className="pr-2 py-1">Klíč</th>
                    <th className="pr-2 py-1">Header</th>
                    <th className="pr-2 py-1">Command</th>
                    <th className="pr-2 py-1">Prefix</th>
                    <th className="pr-2 py-1">Decoder</th>
                    <th className="pr-2 py-1">Poslední hodnota</th>
                    <th className="pr-2 py-1">Zdroj</th>
                    <th className="pr-2 py-1">Aktualizace</th>
                  </tr>
                </thead>
                <tbody>
                  {pidCache.map((r) => (
                    <tr key={r.id} className="border-t border-border/20 align-top">
                      <td className="pr-2 py-1 font-mono">{r.key}</td>
                      <td className="pr-2 py-1 font-mono">{r.header || "—"}</td>
                      <td className="pr-2 py-1 font-mono">{r.command || "—"}</td>
                      <td className="pr-2 py-1 font-mono">{r.response_prefix || "—"}</td>
                      <td className="pr-2 py-1 font-mono">{r.decoder_id || "—"}</td>
                      <td className="pr-2 py-1">
                        {r.last_valid_value != null
                          ? `${r.last_valid_value}${r.unit ? " " + r.unit : ""}`
                          : "—"}
                      </td>
                      <td className="pr-2 py-1">{r.source || "—"}</td>
                      <td className="pr-2 py-1 text-muted-foreground">
                        {new Date(r.updated_at).toLocaleString("cs-CZ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PID Discovery */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" /> PID Discovery
          </h3>
          <div className="text-xs space-y-1">
            <div>Profil: <span className="font-medium">{profile.label}</span></div>
            <div>
              Aktivní custom PID (teplota převodovky):{" "}
              {transOilCache?.command ? (
                <span className="font-mono">{transOilCache.header || "—"} {transOilCache.command}</span>
              ) : (
                <span className="text-muted-foreground italic">{UNKNOWN}</span>
              )}
            </div>
            <div>
              Poslední známá hodnota převodovky:{" "}
              {transOilCache?.last_valid_value != null
                ? `${transOilCache.last_valid_value} ${transOilCache.unit || "°C"}`
                : <span className="text-muted-foreground italic">{UNKNOWN}</span>}
            </div>
            {profile.id === "vag_can" && (
              <div className="text-muted-foreground">
                VAG profil — Chrysler discovery {UNSUPPORTED}.
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSendCommand("custom_at", { command: "0100" })}
              disabled={!isLive}
            >
              <Play className="w-3.5 h-3.5 mr-1" /> Spustit PID discovery
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSendCommand("custom_at", { command: "2130" })}
              disabled={!isLive || !profile.allowChryslerCustomPids}
            >
              <Play className="w-3.5 h-3.5 mr-1" /> Discovery teploty převodovky
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportRawLog(pidCache, vin, profile)}
              disabled={pidCache.length === 0}
            >
              <Download className="w-3.5 h-3.5 mr-1" /> Exportovat raw PID log
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Funkce dostupné pro vozidlo */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary" /> Funkce dostupné pro vozidlo
          </h3>

          <CapabilityGroup
            title="Bezpečné čtení"
            icon={<Sparkles className="w-3.5 h-3.5 text-success" />}
            items={grouped.safe}
            onRun={handleCapabilityClick}
          />
          <CapabilityGroup
            title="Rozšířená diagnostika"
            icon={<Search className="w-3.5 h-3.5 text-primary" />}
            items={grouped.extended}
            onRun={handleCapabilityClick}
          />
          <CapabilityGroup
            title="Servisní funkce"
            icon={<Wrench className="w-3.5 h-3.5 text-amber-500" />}
            items={grouped.service}
            onRun={handleCapabilityClick}
          />
          <CapabilityGroup
            title="Nepodporované / blokované"
            icon={<ShieldAlert className="w-3.5 h-3.5 text-destructive" />}
            items={grouped.blocked}
            onRun={handleCapabilityClick}
          />
        </CardContent>
      </Card>

      {/* AI backend */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> AI návrh PID / funkcí
          </h3>
          <Button size="sm" variant="outline" disabled>
            AI návrh PID / funkcí
          </Button>
          <p className="text-[10px] text-muted-foreground">
            AI backend zatím není nakonfigurován.
          </p>
        </CardContent>
      </Card>

      {/* Reset cache dialog */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetovat PID cache pro toto vozidlo?</AlertDialogTitle>
            <AlertDialogDescription>
              Smažou se všechny záznamy PID cache pro VIN <span className="font-mono">{vin}</span> u tohoto zákazníka.
              Ostatní vozidla nebudou dotčena.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction onClick={doResetCache}>Smazat</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation dialog for medium/high risk */}
      <AlertDialog open={!!confirmCap} onOpenChange={(o) => !o && setConfirmCap(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Potvrzení servisní funkce</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5 text-xs">
                <div><strong>Název funkce:</strong> {confirmCap?.label}</div>
                <div><strong>Popis:</strong> {confirmCap?.description}</div>
                <div><strong>Riziko:</strong> {confirmCap?.riskLevel}</div>
                <div><strong>Kategorie:</strong> {confirmCap?.category}</div>
                <div><strong>Profil vozidla:</strong> {profile.label}</div>
                <div><strong>Co může selhat:</strong> Modul nemusí přijmout příkaz, možný negative response 7F, přerušení komunikace.</div>
                <div className="pt-2">Pro pokračování napište <strong>ROZUMÍM</strong>:</div>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="mt-1"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText.trim().toUpperCase() !== "ROZUMÍM"}
              onClick={() => {
                if (confirmCap) runCapability(confirmCap);
                setConfirmCap(null);
              }}
            >
              Spustit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  const val = v && String(v).length > 0 ? String(v) : UNKNOWN;
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted-foreground">{k}</span>
      <span className={`${mono ? "font-mono" : ""} ${val === UNKNOWN ? "italic text-muted-foreground" : ""}`}>
        {val}
      </span>
    </div>
  );
}

function boolText(v: unknown): string | null {
  if (v === true) return "Ano";
  if (v === false) return "Ne";
  return null;
}

function groupCapabilities(caps: ObdCapability[]) {
  const safe: ObdCapability[] = [];
  const extended: ObdCapability[] = [];
  const service: ObdCapability[] = [];
  const blocked: ObdCapability[] = [];
  for (const c of caps) {
    if (c.riskLevel === "blocked" || c.availability === "unsupported") blocked.push(c);
    else if (c.category === "service" || c.riskLevel === "medium" || c.riskLevel === "high") service.push(c);
    else if (c.availability === "maybe" || c.availability === "requires_better_adapter") extended.push(c);
    else safe.push(c);
  }
  return { safe, extended, service, blocked };
}

function CapabilityGroup({
  title, icon, items, onRun,
}: {
  title: string;
  icon: React.ReactNode;
  items: ObdCapability[];
  onRun: (c: ObdCapability) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold flex items-center gap-1.5">{icon} {title}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map((c) => (
          <div key={c.id} className="rounded border border-border/30 p-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium">{c.label}</div>
              <Badge variant="outline" className={`text-[9px] ${riskClass(c.riskLevel)}`}>
                {c.riskLevel}
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground">{c.description}</div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] text-muted-foreground">{availabilityLabel(c.availability)}</span>
              <Button
                size="sm"
                variant={c.riskLevel === "blocked" ? "ghost" : "outline"}
                className="h-6 text-[10px] px-2"
                disabled={c.riskLevel === "blocked"}
                onClick={() => onRun(c)}
              >
                {c.riskLevel === "safe" ? "Spustit" : c.riskLevel === "blocked" ? "Blokováno" : "Detail / Otestovat"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function riskClass(r: string): string {
  if (r === "safe") return "text-success border-success/40";
  if (r === "low") return "text-primary border-primary/40";
  if (r === "medium") return "text-amber-500 border-amber-500/40";
  if (r === "high") return "text-destructive border-destructive/40";
  return "text-muted-foreground";
}

function availabilityLabel(a: string): string {
  switch (a) {
    case "available": return "dostupné";
    case "maybe": return "možná dostupné";
    case "requires_confirmation": return "vyžaduje potvrzení";
    case "requires_better_adapter": return "vyžaduje lepší adaptér";
    case "unsupported": return UNSUPPORTED;
    default: return UNKNOWN;
  }
}

function exportRawLog(rows: PidCacheRow[], vin: string | null, profile: VehiclePidProfile) {
  const payload = {
    exportedAt: new Date().toISOString(),
    vin,
    profile: { id: profile.id, label: profile.label },
    entries: rows,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `obd-raw-log-${vin || "unknown"}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default AdminVehiclePanel;
