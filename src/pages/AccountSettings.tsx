/**
 * AccountSettings — centrum nastavení zákaznického účtu.
 * Sekce: Soukromí (OBD sdílení), Notifikace, Servisní historie, Účet.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Bell,
  ClipboardList,
  Shield,
  ShieldCheck,
  ShieldX,
  Trash2,
  Mail,
  Lock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

const AccountSettings = () => {
  const navigate = useNavigate();
  const { user, profile, isLoading, signOut, refreshProfile, resetPassword } = useAuth();
  const { isEnabled } = useFeatureFlags();

  const [obdConsent, setObdConsent] = useState(false);
  const [obdSaving, setObdSaving] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [loadingConsent, setLoadingConsent] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("obd_live_consents")
        .select("granted")
        .eq("user_id", user.id)
        .maybeSingle();
      setObdConsent(!!data?.granted);
      setLoadingConsent(false);
    })();
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Nastavení" />
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen pb-20">
        <PageHeader title="Nastavení" />
        <div className="p-4 max-w-lg mx-auto text-center py-12 space-y-4">
          <p className="text-sm text-muted-foreground">Pro nastavení účtu se přihlaste.</p>
          <Button variant="hero" onClick={() => navigate("/auth")}>Přihlásit se</Button>
        </div>
      </div>
    );
  }

  const handleObdToggle = async (next: boolean) => {
    setObdSaving(true);
    try {
      const { error } = await supabase
        .from("obd_live_consents")
        .upsert(
          {
            user_id: user.id,
            granted: next,
            granted_at: next ? new Date().toISOString() : null,
            revoked_at: !next ? new Date().toISOString() : null,
          },
          { onConflict: "user_id" },
        );
      if (error) throw error;
      setObdConsent(next);
      toast.success(
        next
          ? "Sdílení OBD diagnostiky aktivováno"
          : "Sdílení OBD diagnostiky vypnuto",
      );
    } catch (e: any) {
      toast.error("Nepodařilo se uložit nastavení: " + (e?.message || "chyba"));
    } finally {
      setObdSaving(false);
    }
  };

  const handleHistoryToggle = async (next: boolean) => {
    setHistorySaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ service_history_enabled: next })
        .eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success(next ? "Servisní historie zapnuta" : "Servisní historie vypnuta");
    } catch (e: any) {
      toast.error("Nepodařilo se uložit: " + (e?.message || "chyba"));
    } finally {
      setHistorySaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!profile.email) {
      toast.error("Účet nemá nastavený e-mail.");
      return;
    }
    try {
      await resetPassword(profile.email);
      toast.success("Odkaz pro reset hesla byl odeslán na " + profile.email);
    } catch (e: any) {
      toast.error("Nepodařilo se odeslat: " + (e?.message || "chyba"));
    }
  };

  const handleDeleteAccount = async () => {
    const ok = window.confirm(
      "Opravdu chcete požádat o smazání účtu? Pošleme žádost správci, který ji vyřídí do 30 dnů.",
    );
    if (!ok) return;
    try {
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Žádost o smazání účtu",
        message: `Uživatel ${profile.email || user.id} žádá o smazání účtu (GDPR).`,
      });
      toast.success("Žádost odeslána. Ozveme se na " + (profile.email || "Váš e-mail") + ".");
    } catch (e: any) {
      toast.error("Nepodařilo se odeslat: " + (e?.message || "chyba"));
    }
  };

  const Row = ({
    icon: Icon,
    title,
    desc,
    children,
  }: {
    icon: any;
    title: string;
    desc?: string;
    children: React.ReactNode;
  }) => (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <Icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Nastavení účtu" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Soukromí a sdílení dat */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="luxury-card overflow-hidden"
        >
          <header className="px-4 pt-4 pb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-display font-semibold">Soukromí a sdílení dat</h2>
          </header>
          <div className="divide-y divide-border/20">
            <Row
              icon={Activity}
              title="Vzdálená OBD diagnostika"
              desc="Povolit servisu sledovat živá data z OBD adaptéru pro rychlejší diagnostiku závad. Bez souhlasu vidí servis jen Vaše vlastní záznamy."
            >
              <div className="flex flex-col items-end gap-1">
                <Switch
                  checked={obdConsent}
                  disabled={obdSaving || loadingConsent}
                  onCheckedChange={handleObdToggle}
                />
                {obdConsent ? (
                  <Badge className="bg-success/15 text-success border-success/30 gap-1 text-[10px]">
                    <ShieldCheck className="w-3 h-3" /> Aktivní
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1 text-[10px]">
                    <ShieldX className="w-3 h-3" /> Vypnuto
                  </Badge>
                )}
              </div>
            </Row>
            <Row
              icon={ClipboardList}
              title="Sdílet servisní historii"
              desc="Umožnit servisu vést kompletní digitální servisní knihu k Vašim vozům."
            >
              <Switch
                checked={!!profile.service_history_enabled}
                disabled={historySaving}
                onCheckedChange={handleHistoryToggle}
              />
            </Row>
          </div>
        </motion.section>

        {/* Notifikace */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="luxury-card overflow-hidden"
        >
          <header className="px-4 pt-4 pb-2 flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-display font-semibold">Notifikace</h2>
          </header>
          <div className="p-4">
            {isEnabled("push_notifications") ? (
              <PushNotificationToggle />
            ) : (
              <p className="text-xs text-muted-foreground">
                Push notifikace jsou momentálně vypnuté v systémových nastaveních.
              </p>
            )}
          </div>
        </motion.section>

        {/* Účet */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="luxury-card overflow-hidden"
        >
          <header className="px-4 pt-4 pb-2 flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-display font-semibold">Účet a bezpečnost</h2>
          </header>
          <div className="divide-y divide-border/20">
            <Row icon={Mail} title="E-mail" desc={profile.email || "—"}>
              <span className="text-[10px] text-muted-foreground">nelze měnit</span>
            </Row>
            <button
              onClick={handlePasswordReset}
              className="w-full text-left hover:bg-primary/5 transition-colors"
            >
              <Row
                icon={Lock}
                title="Změnit heslo"
                desc="Odešleme Vám odkaz pro nastavení nového hesla."
              >
                <span className="text-xs text-primary">Odeslat</span>
              </Row>
            </button>
            <button
              onClick={handleDeleteAccount}
              className="w-full text-left hover:bg-destructive/5 transition-colors"
            >
              <Row
                icon={Trash2}
                title="Smazat účet"
                desc="Pošle žádost správci, vyřídíme do 30 dnů (GDPR)."
              >
                <span className="text-xs text-destructive">Požádat</span>
              </Row>
            </button>
          </div>
        </motion.section>

        <p className="text-[10px] text-muted-foreground text-center pt-2">
          Změny soukromí se projeví okamžitě.
        </p>
      </div>
    </div>
  );
};

export default AccountSettings;
