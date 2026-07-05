/**
 * AdminStellantisOEM — panel pro Stellantis / FCA / Chrysler / Dodge / Jeep / RAM.
 *
 * Používá jediný vrstvený OBD API entry-point `obd2` (Delphi-OBD inspirovaná
 * architektura). Žádný druhý BLE engine, žádný přímý BLE write, žádné zápisy.
 * Všechny scany jdou přes `elmQueue.runExclusive()` — live polling se
 * automaticky pauzne po dobu scanu.
 */
import { useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, ShieldCheck, Terminal as TerminalIcon } from "lucide-react";
import {
  obd2,
  type DidResult,
  type DtcResult,
  type FullDtcScan,
  type StellantisBasicScan,
  type StellantisEngineLiveScan,
  type SessionResult,
  type ElmStatus,
} from "@/lib/obd/obd2";

type AnyResult =
  | { kind: "session"; data: SessionResult }
  | { kind: "did"; data: DidResult }
  | { kind: "dtc"; data: DtcResult }
  | { kind: "full-dtc"; data: FullDtcScan }
  | { kind: "basic"; data: StellantisBasicScan }
  | { kind: "engine-live"; data: StellantisEngineLiveScan }
  | { kind: "raw"; data: { command: string; raw: string; status: ElmStatus } }
  | { kind: "vin"; data: { status: ElmStatus; vin?: string; raw: string; cleaned: string } };

const STATUS_COLOR: Record<ElmStatus, string> = {
  ok: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  no_data: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  unsupported: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  security_denied: "bg-red-500/15 text-red-500 border-red-500/30",
  adapter_error: "bg-red-500/15 text-red-500 border-red-500/30",
  bus_error: "bg-red-500/15 text-red-500 border-red-500/30",
  timeout: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  invalid_response: "bg-red-500/15 text-red-500 border-red-500/30",
  response_pending: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  error: "bg-red-500/15 text-red-500 border-red-500/30",
};

function StatusBadge({ status }: { status: ElmStatus }) {
  return <Badge className={STATUS_COLOR[status] ?? ""}>{status}</Badge>;
}

const AdminStellantisOEM = () => {
  const [running, setRunning] = useState<string | null>(null);
  const [history, setHistory] = useState<AnyResult[]>([]);
  const [rawCommand, setRawCommand] = useState("");
  const [rawUds, setRawUds] = useState("");

  const push = useCallback((r: AnyResult) => {
    setHistory((h) => [r, ...h].slice(0, 40));
  }, []);

  const run = useCallback(
    async (label: string, fn: () => Promise<AnyResult>) => {
      setRunning(label);
      try {
        push(await fn());
      } catch (e: any) {
        push({
          kind: "raw",
          data: { command: label, raw: String(e?.message || e), status: "error" },
        });
      } finally {
        setRunning(null);
      }
    },
    [push],
  );

  /* ------------- akce ------------- */

  const btn = (id: string, label: string, fn: () => Promise<AnyResult>) => (
    <Button
      key={id}
      size="sm"
      variant="outline"
      disabled={running !== null}
      onClick={() => run(id, fn)}
      className="justify-start"
    >
      {running === id ? (
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
      ) : (
        <Play className="w-3 h-3 mr-1" />
      )}
      {label}
    </Button>
  );

  const didAction = (label: string, did: string, cmd: string): AnyResult["kind"] extends any ? any : never =>
    ({
      kind: "did" as const,
      // wrapper — pravou funkci vytvoříme níže
    }) as any;

  const readDidBtn = (label: string, did: string) => {
    const def = obd2.stellantis
      .basicDids()
      .concat(obd2.stellantis.engineLiveDids())
      .find((d) => d.did.toUpperCase() === did.toUpperCase());
    if (!def) return null;
    return btn(`did-${did}`, label, async () => ({
      kind: "did",
      data: await obd2.stellantis.readDid(def),
    }));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">
              Stellantis / FCA / Chrysler / Dodge / Jeep / RAM — read-only OEM
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Vrstvená OBD architektura podle Delphi-OBD. Všechny scany jdou přes jednu
            ELM command queue, live polling se automaticky pozastavuje. Žádné zápisy do vozidla.
          </p>
        </CardContent>
      </Card>

      {/* Init + session */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Init &amp; session</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {btn("init-debug", "ELM init debug (ATH1)", async () => {
              await obd2.applyProfile("debug", true);
              return { kind: "raw", data: { command: "profile debug", raw: "ATH1 + ATL1 profil aktivní", status: "ok" } };
            })}
            {btn("init-simple", "ELM init simple (ATH0)", async () => {
              await obd2.applyProfile("simple", true);
              return { kind: "raw", data: { command: "profile simple", raw: "ATH0 profil aktivní", status: "ok" } };
            })}
            {btn("session", "Extended session 10 03", async () => ({
              kind: "session",
              data: await obd2.stellantis.startExtendedSession(),
            }))}
            {btn("detect", "Detect OEM (dle posledního VIN)", async () => {
              const vin = await obd2.readVinMode09();
              if (vin.status !== "ok" || !vin.vin) {
                return { kind: "vin", data: vin };
              }
              const profile = obd2.detectOemProfileByVin(vin.vin);
              return {
                kind: "raw",
                data: {
                  command: "detect",
                  raw: `VIN=${vin.vin} → ${profile ? profile.displayName : "profil nenalezen"}`,
                  status: "ok",
                },
              };
            })}
          </div>
        </CardContent>
      </Card>

      {/* DTC */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">DTC (03 / 07 / 0A)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {btn("dtc-03", "Raw DTC 03", async () => ({ kind: "dtc", data: await obd2.readStoredDtcs() }))}
            {btn("dtc-07", "Raw DTC 07", async () => ({ kind: "dtc", data: await obd2.readPendingDtcs() }))}
            {btn("dtc-0a", "Raw DTC 0A", async () => ({ kind: "dtc", data: await obd2.readPermanentDtcs() }))}
            {btn("dtc-full", "Full DTC scan", async () => ({
              kind: "full-dtc",
              data: await obd2.runFullDtcScan(),
            }))}
          </div>
        </CardContent>
      </Card>

      {/* Basic DIDs */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Stellantis basic DID (read-only)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {readDidBtn("VIN F190", "F190")}
            {readDidBtn("Workshop F198", "F198")}
            {readDidBtn("Programming date F199", "F199")}
            {readDidBtn("Calibration F1A8", "F1A8")}
            {readDidBtn("Spare part F187", "F187")}
            {readDidBtn("ECU part F188", "F188")}
            {readDidBtn("Mileage 1A02", "1A02")}
            {readDidBtn("Fuel level 1B01", "1B01")}
            {readDidBtn("Engine runtime 1B02", "1B02")}
            {readDidBtn("Battery 1B03", "1B03")}
            {btn("scan-basic", "Stellantis basic scan", async () => ({
              kind: "basic",
              data: await obd2.stellantis.scanBasicInfo(),
            }))}
          </div>
        </CardContent>
      </Card>

      {/* Engine live DIDs */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Stellantis engine live DID (read-only)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {readDidBtn("Coolant 1B04", "1B04")}
            {readDidBtn("Oil temp 4005", "4005")}
            {readDidBtn("Oil pressure 4007", "4007")}
            {readDidBtn("MAF 4009", "4009")}
            {readDidBtn("Boost 400B", "400B")}
            {readDidBtn("EGR pos 4019", "4019")}
            {readDidBtn("Battery 4026", "4026")}
            {readDidBtn("DPF soot 4048", "4048")}
            {readDidBtn("DPF dist regen 404A", "404A")}
            {readDidBtn("DPF active regen 404B", "404B")}
            {btn("scan-engine", "Stellantis engine live scan", async () => ({
              kind: "engine-live",
              data: await obd2.stellantis.scanEngineLive(),
            }))}
          </div>
        </CardContent>
      </Card>

      {/* Raw */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Raw / UDS</p>
          <div className="flex gap-2">
            <Input
              placeholder="Raw ELM příkaz (např. 22F190)"
              value={rawCommand}
              onChange={(e) => setRawCommand(e.target.value)}
              className="text-xs font-mono"
            />
            <Button
              size="sm"
              disabled={running !== null || !rawCommand.trim()}
              onClick={() =>
                run("raw", async () => {
                  const r = await obd2.queue.send(rawCommand.trim(), { timeoutMs: 5000 });
                  return { kind: "raw", data: { command: r.command, raw: r.raw, status: r.status } };
                })
              }
            >
              <TerminalIcon className="w-3 h-3 mr-1" />
              Odeslat
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Raw UDS (např. 22 F1 90)"
              value={rawUds}
              onChange={(e) => setRawUds(e.target.value)}
              className="text-xs font-mono"
            />
            <Button
              size="sm"
              disabled={running !== null || !rawUds.trim()}
              onClick={() =>
                run("raw-uds", async () => {
                  const r = await obd2.queue.send(rawUds.trim(), { timeoutMs: 5000 });
                  return { kind: "raw", data: { command: r.command, raw: r.raw, status: r.status } };
                })
              }
            >
              <TerminalIcon className="w-3 h-3 mr-1" />
              UDS
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Historie */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Výsledky</p>
          <ScrollArea className="h-[400px] pr-2">
            <div className="space-y-2">
              {history.length === 0 && (
                <p className="text-xs text-muted-foreground">Žádné scany zatím.</p>
              )}
              {history.map((h, i) => (
                <ResultCard key={i} r={h} />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

function ResultCard({ r }: { r: AnyResult }) {
  return (
    <div className="border border-border rounded-md p-2 bg-muted/20 text-[11px] font-mono space-y-1">
      {r.kind === "raw" && (
        <>
          <div className="flex justify-between">
            <span className="font-semibold">{r.data.command}</span>
            <StatusBadge status={r.data.status} />
          </div>
          <pre className="whitespace-pre-wrap break-all text-muted-foreground">{r.data.raw || "—"}</pre>
        </>
      )}
      {r.kind === "vin" && (
        <>
          <div className="flex justify-between">
            <span className="font-semibold">Mode 09 VIN</span>
            <StatusBadge status={r.data.status} />
          </div>
          <div>VIN: {r.data.vin || "—"}</div>
          <pre className="whitespace-pre-wrap break-all text-muted-foreground">{r.data.cleaned}</pre>
        </>
      )}
      {r.kind === "session" && (
        <>
          <div className="flex justify-between">
            <span className="font-semibold">Session {r.data.command}</span>
            <StatusBadge status={r.data.status} />
          </div>
          <pre className="whitespace-pre-wrap break-all text-muted-foreground">{r.data.cleaned}</pre>
        </>
      )}
      {r.kind === "did" && <DidRow r={r.data} />}
      {r.kind === "dtc" && <DtcRow r={r.data} />}
      {r.kind === "full-dtc" && (
        <>
          <div className="font-semibold">Full DTC scan</div>
          <div className="text-muted-foreground">{r.data.summary.note}</div>
          <div>
            Stored {r.data.summary.storedCount} · Pending {r.data.summary.pendingCount} · Permanent{" "}
            {r.data.summary.permanentCount}
          </div>
          <DtcRow r={r.data.stored} />
          <DtcRow r={r.data.pending} />
          <DtcRow r={r.data.permanent} />
        </>
      )}
      {r.kind === "basic" && (
        <>
          <div className="font-semibold">Stellantis basic scan</div>
          <div className="text-muted-foreground">
            {r.data.displayName} · session {r.data.session.status}
          </div>
          {r.data.dids.map((d) => (
            <DidRow key={d.did} r={d} />
          ))}
        </>
      )}
      {r.kind === "engine-live" && (
        <>
          <div className="font-semibold">Stellantis engine live scan</div>
          {r.data.dids.map((d) => (
            <DidRow key={d.did} r={d} />
          ))}
        </>
      )}
    </div>
  );
}

function DidRow({ r }: { r: DidResult }) {
  return (
    <div className="border-t border-border/50 pt-1 mt-1">
      <div className="flex justify-between">
        <span className="font-semibold">
          {r.command} → {r.positiveMarker || "—"}
        </span>
        <StatusBadge status={r.status} />
      </div>
      <div>payload: {r.payload || "—"}</div>
      {r.decoded !== undefined && <div>decoded: {r.decoded}</div>}
      {r.warnings.length > 0 && (
        <div className="text-amber-400">⚠ {r.warnings.join(" · ")}</div>
      )}
    </div>
  );
}

function DtcRow({ r }: { r: DtcResult }) {
  return (
    <div className="border-t border-border/50 pt-1 mt-1">
      <div className="flex justify-between">
        <span className="font-semibold">
          Service {r.service} ({r.label})
        </span>
        <StatusBadge status={r.status} />
      </div>
      {r.codes.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-1">
          {r.codes.map((c) => (
            <Badge key={c.code} variant="outline" className="font-mono">
              {c.code}
            </Badge>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground">žádné kódy</div>
      )}
      {r.warnings.length > 0 && (
        <div className="text-amber-400">⚠ {r.warnings.join(" · ")}</div>
      )}
    </div>
  );
}

export default AdminStellantisOEM;
