/**
 * Delphi Developer Mode UI Gate.
 *
 * Renderuje kompaktní kartu v hlavičce Delphi diagnostiky:
 *  - stav (EXPERIMENTÁLNÍ REŽIM aktivní / neaktivní)
 *  - unlock dialog s klíčem 1607 (session-only)
 *  - dialog druhého potvrzení pro spuštění candidate/blocked funkce
 *    s výpisem TX/RX, session, request, důvod nenaověření a rizikem.
 *
 * Používá se pouze v admin sekci — běžný uživatel tuto komponentu nevidí.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, KeyRound, Lock, ShieldCheck, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  isDeveloperModeActive, lockDeveloperMode, subscribeDeveloperMode,
  tryUnlockDeveloperMode, type DevRiskLevel,
} from "@/lib/delphi/developer-mode";
import { toast } from "@/hooks/use-toast";

export function DeveloperModeBadge() {
  const [active, setActive] = useState(isDeveloperModeActive());
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");

  useEffect(() => subscribeDeveloperMode(setActive), []);

  return (
    <>
      {active ? (
        <div className="flex items-center gap-2">
          <Badge className="border-red-500 bg-red-950 text-red-100">
            <AlertTriangle className="mr-1 h-3.5 w-3.5" /> EXPERIMENTÁLNÍ REŽIM
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-red-400 bg-red-900/40 text-red-100 hover:bg-red-900"
            onClick={() => { lockDeveloperMode(); toast({ title: "Developer Mode uzamčen" }); }}
          >
            <Lock className="mr-1 h-3.5 w-3.5" /> Zamknout
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-slate-500 bg-slate-900 text-slate-200 hover:bg-slate-800"
          onClick={() => setOpen(true)}
        >
          <KeyRound className="mr-1 h-3.5 w-3.5" /> Developer Mode
        </Button>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setKey(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="h-4 w-4" /> Odemknout Developer Mode
            </DialogTitle>
            <DialogDescription>
              Odemyká candidate a blocked funkce pro tuto relaci. Po refreshi
              stránky bude Developer Mode znovu zamčený.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dev-key">Developer klíč</Label>
            <Input
              id="dev-key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") attempt(); }}
            />
            <p className="text-xs text-muted-foreground">
              Neověřené funkce mohou změnit konfiguraci vozidla, smazat adaptace
              nebo způsobit nouzový režim ECU.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button onClick={attempt}>Odemknout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  function attempt() {
    if (tryUnlockDeveloperMode(key)) {
      toast({ title: "Developer Mode odemčen", description: "Platí pouze pro aktuální relaci." });
      setOpen(false);
      setKey("");
    } else {
      toast({ title: "Neplatný klíč", variant: "destructive" });
      setKey("");
    }
  }
}

/* ------------------------------------------------------------------ */

export interface DevConfirmDetails {
  functionName: string;
  functionKind: string;
  ecu?: string | null;
  protocol?: string | null;
  request?: string | null;
  session?: string | null;
  hardware?: string | null;
  tx?: string | null;
  rx?: string | null;
  requirements?: string[];
  limitations?: string[];
  reasonUnverified?: string;
  consequences?: string[];
  risk: DevRiskLevel;
}

interface DevConfirmProps {
  open: boolean;
  details: DevConfirmDetails | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const RISK_STYLE: Record<DevRiskLevel, string> = {
  LOW: "border-emerald-400 bg-emerald-950 text-emerald-100",
  MEDIUM: "border-amber-400 bg-amber-950 text-amber-100",
  HIGH: "border-orange-500 bg-orange-950 text-orange-100",
  CRITICAL: "border-red-500 bg-red-950 text-red-100",
};

export function DeveloperConfirmDialog({ open, details, onCancel, onConfirm }: DevConfirmProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => { if (!open) setAcknowledged(false); }, [open]);

  if (!details) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" /> Neověřená diagnostická funkce
          </DialogTitle>
          <DialogDescription>
            Spouštíš funkci, která nebyla ověřena pro tuto konkrétní SW variantu ECU.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
          <Badge className={RISK_STYLE[details.risk]}>Riziko: {details.risk}</Badge>

          <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
            <dt className="col-span-1 text-muted-foreground">Funkce</dt>
            <dd className="col-span-2 break-words">{details.functionName}</dd>
            <dt className="col-span-1 text-muted-foreground">Typ</dt>
            <dd className="col-span-2">{details.functionKind}</dd>
            {details.ecu && (<><dt className="col-span-1 text-muted-foreground">ECU</dt><dd className="col-span-2">{details.ecu}</dd></>)}
            {details.protocol && (<><dt className="col-span-1 text-muted-foreground">Protokol</dt><dd className="col-span-2">{details.protocol}</dd></>)}
            {details.session && (<><dt className="col-span-1 text-muted-foreground">Session</dt><dd className="col-span-2 font-mono">{details.session}</dd></>)}
            {details.tx && (<><dt className="col-span-1 text-muted-foreground">TX</dt><dd className="col-span-2 font-mono">{details.tx}</dd></>)}
            {details.rx && (<><dt className="col-span-1 text-muted-foreground">RX</dt><dd className="col-span-2 font-mono">{details.rx}</dd></>)}
            {details.request && (<><dt className="col-span-1 text-muted-foreground">Request</dt><dd className="col-span-2 font-mono break-all">{details.request}</dd></>)}
            {details.hardware && (<><dt className="col-span-1 text-muted-foreground">Hardware</dt><dd className="col-span-2">{details.hardware}</dd></>)}
          </dl>

          {details.reasonUnverified && (
            <div className="rounded border border-amber-500 bg-amber-950/40 p-2 text-xs text-amber-100">
              <strong>Proč není ověřeno:</strong> {details.reasonUnverified}
            </div>
          )}

          {details.requirements?.length ? (
            <div className="text-xs">
              <strong className="text-muted-foreground">Požadavky:</strong>
              <ul className="ml-4 list-disc">{details.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          ) : null}
          {details.limitations?.length ? (
            <div className="text-xs">
              <strong className="text-muted-foreground">Omezení:</strong>
              <ul className="ml-4 list-disc">{details.limitations.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          ) : null}

          <div className="rounded border border-red-500 bg-red-950/40 p-2 text-xs text-red-100">
            <strong>Tato operace může:</strong>
            <ul className="ml-4 list-disc">
              <li>změnit konfiguraci vozidla,</li>
              <li>smazat adaptace,</li>
              <li>resetovat naučené hodnoty,</li>
              <li>vyžadovat následnou kalibraci,</li>
              <li>aktivovat servisní režim,</li>
              <li>způsobit nouzový režim ECU,</li>
              <li>způsobit nefunkčnost některých systémů,</li>
              <li>vyžadovat profesionální diagnostiku nebo obnovu konfigurace vozidla.</li>
            </ul>
            {details.consequences?.length ? (
              <>
                <div className="mt-2"><strong>Známé/pravděpodobné následky:</strong></div>
                <ul className="ml-4 list-disc">{details.consequences.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </>
            ) : null}
          </div>

          <label className="flex items-center gap-2 pt-1">
            <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} />
            <span className="text-xs">Rozumím rizikům a chci pokračovat.</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Zrušit</Button>
          <Button
            className="bg-red-600 hover:bg-red-700"
            disabled={!acknowledged}
            onClick={onConfirm}
          >
            <ShieldCheck className="mr-1 h-4 w-4" /> Spustit i přes riziko
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
