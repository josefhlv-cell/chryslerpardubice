/**
 * AdminObdPermissions — admin karta pro nastavování OBD oprávnění zákazníka.
 * Zobrazuje přehledné přepínače pro každou funkci a ukládá je do `obd_permissions`.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Shield, Save, RotateCcw } from "lucide-react";
import { DEFAULT_OBD_PERMISSIONS, FULL_OBD_PERMISSIONS, ObdPermissions } from "@/hooks/obd/use-obd-permissions";

const FIELDS: { key: keyof ObdPermissions; label: string; hint?: string }[] = [
  { key: "live_data", label: "Živá data", hint: "Otáčky, teplota, rychlost, plyn" },
  { key: "dtc_read", label: "Čtení DTC" },
  { key: "dtc_clear", label: "Mazání DTC", hint: "POZOR – ovlivňuje diagnostiku" },
  { key: "dpf", label: "DPF diagnostika", hint: "Stav filtru, regenerace, tlak" },
  { key: "can_bus", label: "CAN analyzátor" },
  { key: "uds", label: "UDS diagnostika" },
  { key: "coding", label: "Kódování řídicích jednotek" },
  { key: "terminal", label: "Terminál (AT/OBD příkazy)" },
  { key: "logging", label: "Záznam / logování" },
  { key: "reverse_engineering", label: "Reverse Engineering" },
  { key: "discovery", label: "Skenování / Discovery" },
  { key: "ai_diagnostics", label: "AI diagnostika" },
  { key: "dev_mode", label: "Developer režim" },
  { key: "flash", label: "Flash / Security" },
];

type Props = {
  userId: string;
  userLabel?: string;
};

const AdminObdPermissions = ({ userId, userLabel }: Props) => {
  const [perms, setPerms] = useState<ObdPermissions>(DEFAULT_OBD_PERMISSIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("obd_permissions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!cancelled) {
        if (error) console.error("[AdminObdPermissions] load", error);
        if (data) {
          setPerms({
            live_data: data.live_data,
            dtc_read: data.dtc_read,
            dtc_clear: data.dtc_clear,
            can_bus: data.can_bus,
            uds: data.uds,
            coding: data.coding,
            terminal: data.terminal,
            logging: data.logging,
            reverse_engineering: data.reverse_engineering,
            discovery: data.discovery,
            ai_diagnostics: data.ai_diagnostics,
            dev_mode: data.dev_mode,
            flash: data.flash,
          });
        } else {
          setPerms(DEFAULT_OBD_PERMISSIONS);
        }
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [userId]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("obd_permissions")
      .upsert({ user_id: userId, ...perms } as any, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Oprávnění uložena", description: userLabel || userId });
    }
  };

  const grantAll = () => setPerms(FULL_OBD_PERMISSIONS);
  const reset = () => setPerms(DEFAULT_OBD_PERMISSIONS);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">OBD oprávnění zákazníka</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={reset} disabled={loading || saving}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Výchozí
            </Button>
            <Button size="sm" variant="outline" onClick={grantAll} disabled={loading || saving}>
              Vše ✓
            </Button>
            <Button size="sm" onClick={save} disabled={loading || saving}>
              <Save className="w-3.5 h-3.5 mr-1" /> Uložit
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-xs text-muted-foreground">Načítám…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {FIELDS.map(({ key, label, hint }) => (
              <div
                key={key}
                className="flex items-center justify-between p-2 rounded-md border border-border/30 bg-secondary/20"
              >
                <div className="min-w-0">
                  <Label className="text-xs font-medium">{label}</Label>
                  {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
                </div>
                <Switch
                  checked={!!perms[key]}
                  onCheckedChange={(v) => setPerms((p) => ({ ...p, [key]: v }))}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminObdPermissions;
