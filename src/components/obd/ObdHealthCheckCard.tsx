import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, CheckCircle2, XCircle, AlertTriangle, Copy, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { runObdHealthCheck, type HealthReport, type HealthStep } from "@/lib/obd/obd-health-check";

const OK = "text-success"; const ERR = "text-destructive"; const WARN = "text-warning";

function StatusIcon({ s }: { s: HealthStep["status"] }) {
  if (s === "ok") return <CheckCircle2 className={`w-4 h-4 ${OK}`} />;
  if (s === "warn") return <AlertTriangle className={`w-4 h-4 ${WARN}`} />;
  if (s === "skip") return <AlertTriangle className={`w-4 h-4 text-muted-foreground`} />;
  return <XCircle className={`w-4 h-4 ${ERR}`} />;
}

function Row({ label, ok }: { label: string; ok: "ok" | "error" }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span>{label}</span>
      <Badge variant={ok === "ok" ? "default" : "destructive"}>{ok === "ok" ? "OK" : "CHYBA"}</Badge>
    </div>
  );
}

export default function ObdHealthCheckCard() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const r = await runObdHealthCheck();
      setReport(r);
      setOpen(true);
    } catch (e) {
      toast({ title: "Health check selhal", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const copyJson = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast({ title: "Report zkopírován jako JSON" });
    } catch {
      toast({ title: "Nepodařilo se zkopírovat", variant: "destructive" });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-primary" /> OBD Health Check
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Sekvenčně otestuje BLE → ELM → ECU → live data → DTC 03/07/0A → VIN. Nezapisuje do vozidla.
          </p>
          <Button size="sm" onClick={run} disabled={running}>
            {running ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Testuji…</> : "Spustit"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-4 h-4" /> OBD Health Check — report
            </DialogTitle>
          </DialogHeader>
          {report && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 p-3 rounded-md bg-muted/30">
                <Row label="Bluetooth" ok={report.bluetooth} />
                <Row label="ELM" ok={report.elm} />
                <Row label="ECU (0100)" ok={report.ecu} />
                <Row label="Live data" ok={report.live} />
                <Row label="DTC služby" ok={report.dtc} />
                <Row label="VIN" ok={report.vin} />
              </div>
              <div className="text-xs">
                <strong>Doporučení:</strong> {report.recommendation}
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {report.steps.map((s) => (
                  <div key={s.id} className="flex items-start gap-2 text-xs border-b border-border/40 pb-1">
                    <StatusIcon s={s.status} />
                    <div className="flex-1">
                      <div className="font-medium">{s.label}</div>
                      {s.detail && <div className="text-muted-foreground">{s.detail}</div>}
                      {s.raw && <pre className="mt-1 text-[10px] bg-muted/40 p-1 rounded overflow-x-auto">{s.raw.slice(0, 200)}</pre>}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{s.durationMs}ms</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={copyJson}>
                  <Copy className="w-3 h-3 mr-1" /> Kopírovat JSON
                </Button>
                <Button size="sm" onClick={() => setOpen(false)}>Zavřít</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
