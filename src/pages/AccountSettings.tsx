/**
 * AccountSettings — centrum nastavení zákaznického účtu.
 * Sekce: Soukromí (OBD sdílení), Notifikace, Servisní historie, Účet.
 *
 * Doplněno:
 * - evidence verze souhlasu OBD diagnostiky,
 * - fallback, pokud DB ještě nemá sloupec accepted_version,
 * - jasnější text, co přesně servis uvidí,
 * - stav posledního udělení souhlasu.
 */
import { useEffect, useState, type ReactNode } from "react";
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
  Info,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

const OBD_CONSENT_VERSION = "obd-live-v1.0";

const formatDate = (value?: string | null) => {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return null;
  }
};

const AccountSettings = () => {
  const navigate = useNavigate();
  const { user, profile, isLoading, refreshProfile, resetPassword } = useAuth();
  const { isEnabled } = useFeatureFlags();

  const db = supabase as any;
  const profileAny = profile as any;

  const [obdConsent, setObdConsent] = useState(false);
  const [obdGrantedAt, setObdGrantedAt] = useState<string | null>(null);
  const [obdConsentVersion, setObdConsentVersion] = useState<string | null>(null);
  const [obdSaving, setObdSaving] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [loadingConsent, setLoadingConsent] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoadingConsent(false);
      return;
    }

    const loadConsent = async () => {
      setLoadingConsent(true);

      try {
        let { data, error } = await db
          .from("obd_live_consents")
          .select("granted, granted_at, accepted_version")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error && String(error.message || "").includes("accepted_version")) {
          const fallback = await db
            .from("obd_live_consents")
            .select("granted, granted_at")
            .eq("user_id", user.id)
            .maybeSingle();

          data = fallback.data;
          error = fallback.error;
        }

        if (error) {
          console.warn("OBD consent load error:", error);
        }

        setObdConsent(!!data?.granted);
        setObdGrantedAt(data?.granted_at || null);
        setObdConsentVersion(data?.accepted_version || null);
      } catch (e) {
        console.warn("OBD consent load exception:", e);
      } finally {
        setLoadingConsent(false);
      }
    };

    loadConsent();
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
          <Button variant="hero" onClick={() => navigate("/auth")}>
            Přihlásit se
          </Button>
        </div>
      </div>
    );
  }

  const email = profileAny?.email || user.email || "";
  const grantedAtLabel = formatDate(obdGrantedAt);

  const handleObdToggle = async (next: boolean) => {
    setObdSaving(true);

    const now = new Date().toISOString();

    const payloadWithVersion = {
      user_id: user.id,
      granted: next,
      granted_at: next ? now : obdGrantedAt,
      revoked_at: !next ? now : null,
      accepted_version: next ? OBD_CONSENT_VERSION : obdConsentVersion,
    };

    const payloadFallback = {
      user_id: user.id,
      granted: next,
      granted_at: next ? now : obdGrantedAt,
      revoked_at: !next ? now : null,
    };

    try {
      let { error } = await db.from("obd_live_consents").upsert(payloadWithVersion, {
        onConflict: "user_id",
      });

      if (error && String(error.message || "").includes("accepted_version")) {
        const retry = await db.from("obd_live_consents").upsert(payloadFallback, {
          onConflict: "user_id",
        });

        error = retry.error;
      }

      if (error) throw error;

      setObdConsent(next);

      if (next) {
        setObdGrantedAt(now);
        setObdConsentVersion(OBD_CONSENT_VERSION);
      }

      toast.success(
        next
          ? "Sdílení OBD diagnostiky aktivováno"
          : "Sdílení OBD diagnostiky vypnuto"
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
      const { error } = await db
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
    if (!email) {
      toast.error("Účet nemá nastavený e-mail.");
      return;
    }

    try {
      await resetPassword(email);
      toast.success("Odkaz pro reset hesla byl odeslán na " + email);
    } catch (e: any) {
      toast.error("Nepodařilo se odeslat: " + (e?.message || "chyba"));
    }
  };

  const handleDeleteAccount = async () => {
    const ok = window.confirm(
      "Opravdu chcete požádat o smazání účtu? Pošleme žádost správci, který ji vyřídí do 30 dnů."
    );

    if (!ok) return;

    try {
      const { error } = await db.from("notifications").insert({
        user_id: user.id,
        title: "Žádost o smazání účtu",
        message: `Uživatel ${email || user.id} žádá o smazání účtu (GDPR).`,
      });

      if (error) throw error;

      toast.success("Žádost odeslána. Ozveme se na " + (email || "Váš e-mail") + ".");
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
    children: ReactNode;
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
              desc="Povolit Chrysler Pardubice vidět živou OBD relaci pouze během aktivního připojení. Servis uvidí technická diagnostická data jako chyby, napětí, teploty, otáčky, rychlost, stav motoru a další hodnoty potřebné pro diagnostiku. Bez souhlasu admin neuvidí žádnou živou OBD relaci."
            >
              <div className="flex flex-col items-end gap-1">
                <Switch
                  checked={obdConsent}
                  disabled={obdSaving || loadingConsent}
                  onCheckedChange={handleObdToggle}
                />

                {obdConsent ? (
                  <Badge className="bg-success/15 text-success border-success/30 gap-1 text-[10px]">
                    <ShieldCheck className="w-3 h-3" />
                    Aktivní
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1 text-[10px]">
                    <ShieldX className="w-3 h-3" />
                    Vypnuto
                  </Badge>
                )}
              </div>
            </Row>

            <div className="px-4 pb-4 -mt-1">
              <div className="rounded-xl border border-border/20 bg-secondary/30 p-3 flex gap-2">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Souhlas můžete kdykoliv vypnout. Vypnutí zastaví zobrazení nových živých
                    OBD relací v adminu.
                  </p>

                  {obdConsent && grantedAtLabel && (
                    <p className="text-[10px] text-muted-foreground">
                      Souhlas udělen: {grantedAtLabel}
                      {obdConsentVersion ? ` · verze ${obdConsentVersion}` : ""}
                    </p>
                  )}

                  {!obdConsent && (
                    <p className="text-[10px] text-muted-foreground">
                      Aktuálně vypnuto — servis neuvidí živou diagnostiku.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Row
              icon={ClipboardList}
              title="Sdílet servisní historii"
              desc="Umožnit servisu vést kompletní digitální servisní knihu k Vašim vozům."
            >
              <Switch
                checked={!!profileAny?.service_history_enabled}
                disabled={historySaving}
                onCheckedChange={handleHistoryToggle}
              />
            </Row>
          </div>
        </motion.section>

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
            <Row icon={Mail} title="E-mail" desc={email || "—"}>
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