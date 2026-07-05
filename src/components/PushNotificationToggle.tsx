import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Loader2, Smartphone, Globe, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Zákaznický toggle push notifikací.
 * - Native (iOS/Android APK): registruje FCM/APNs token do `device_tokens`.
 * - Web/PWA: klasické Notification API + profiles.notifications_enabled.
 */
const PushNotificationToggle = () => {
  const { user } = useAuth();
  const isNative = Capacitor.isNativePlatform();
  const [webSupported, setWebSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [tokens, setTokens] = useState<Array<{ id: string; platform: string; model: string | null; token: string }>>([]);

  useEffect(() => {
    setWebSupported(typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator);
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("device_tokens")
        .select("id, platform, model, token")
        .eq("user_id", user.id);
      setTokens((data as any) || []);
    })();
  }, [user, registering]);

  const requestWebPermission = async () => {
    if (!webSupported || !user) return;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === "granted") {
        await supabase.from("profiles").update({ notifications_enabled: true }).eq("user_id", user.id);
        toast({ title: "Push notifikace zapnuty 🔔" });
        new Notification("Chrysler & Dodge Pardubice", {
          body: "Notifikace jsou nyní aktivní!",
          icon: "/icons/icon-192.png",
        });
      } else {
        toast({ title: "Notifikace zamítnuty", description: "Povolte je v nastavení prohlížeče.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Chyba", description: "Nepodařilo se aktivovat notifikace.", variant: "destructive" });
    }
    setLoading(false);
  };

  const disableWeb = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ notifications_enabled: false }).eq("user_id", user.id);
    toast({ title: "Push notifikace vypnuty" });
  };

  const registerNative = async () => {
    if (!isNative || !user) return;
    setRegistering(true);
    let regListener: any = null;
    let errListener: any = null;
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { Device } = await import("@capacitor/device");

      // 1) systémové oprávnění
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== "granted") {
        toast({
          title: "Notifikace nepovoleny",
          description: "Zapněte je v Nastavení telefonu → Chrysler Pardubice → Oznámení.",
          variant: "destructive",
        });
        setRegistering(false);
        return;
      }

      const info = await Device.getInfo();
      const id = await Device.getId();

      // 2) KRITICKÉ: posluchače musí být opravdu aktivní PŘED voláním register().
      //    Předtím se registrovaly asynchronně přes .then() – token mohl přijít
      //    dřív než handler existoval → timeout 30 s a chyba "Push token nepřišel".
      let resolveToken!: (t: string) => void;
      let rejectToken!: (e: Error) => void;
      const tokenPromise = new Promise<string>((res, rej) => {
        resolveToken = res;
        rejectToken = rej;
      });

      regListener = await PushNotifications.addListener("registration", (t) => {
        resolveToken(t.value);
      });
      errListener = await PushNotifications.addListener("registrationError", (err) => {
        rejectToken(new Error(err?.error || "APNs/FCM registrace selhala"));
      });

      // 3) teď teprve register()
      await PushNotifications.register();

      const token = await Promise.race([
        tokenPromise,
        new Promise<string>((_, rej) =>
          setTimeout(
            () =>
              rej(
                new Error(
                  Capacitor.getPlatform() === "ios"
                    ? "APNs neodpověděl (60 s). Zkontrolujte, že máte internet a že Push Notifications capability je v Xcode zapnutá."
                    : "FCM neodpověděl (60 s). Zkontrolujte internetové připojení a google-services.json.",
                ),
              ),
            60_000,
          ),
        ),
      ]);

      const { error } = await supabase.from("device_tokens").upsert(
        {
          user_id: user.id,
          token,
          platform: Capacitor.getPlatform(),
          device_id: id.identifier,
          model: info.model,
          os_version: info.osVersion,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "token" },
      );
      if (error) throw error;
      await supabase.from("profiles").update({ notifications_enabled: true }).eq("user_id", user.id);
      toast({ title: "✅ Push notifikace aktivovány", description: `Zařízení: ${info.model || Capacitor.getPlatform()}` });
    } catch (e: any) {
      toast({
        title: "Chyba při aktivaci",
        description: e?.message || "Neznámá chyba. Restartujte aplikaci a zkuste znovu.",
        variant: "destructive",
      });
    } finally {
      try { await regListener?.remove?.(); } catch { /* noop */ }
      try { await errListener?.remove?.(); } catch { /* noop */ }
      setRegistering(false);
    }
  };

  const removeToken = async (id: string) => {
    await supabase.from("device_tokens").delete().eq("id", id);
    setTokens((prev) => prev.filter((t) => t.id !== id));
    toast({ title: "Zařízení odebráno" });
  };

  const testPush = async () => {
    if (!user) return;
    const { error } = await supabase.from("notifications").insert({
      user_id: user.id,
      title: "🔔 Test push notifikace",
      message: "Pokud tohle vidíš v systémovém oznámení, push funguje.",
      link: "/notifications",
      event_type: "push_self_test",
      dedupe_key: "push-selftest:" + Date.now(),
    });
    if (error) toast({ title: "Test selhal", description: error.message, variant: "destructive" });
    else toast({ title: "Test odeslán", description: "Zvonek + push by měly dorazit během vteřin." });
  };


  // ────── NATIVE (APK / iOS build) ──────
  if (isNative) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" />
            <h3 className="font-medium text-sm">Push notifikace (mobilní aplikace)</h3>
            {tokens.length > 0 ? (
              <Badge className="bg-success/15 text-success">Aktivní</Badge>
            ) : (
              <Badge variant="outline">Neaktivní</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Dostávejte upozornění na stav objednávek, servisních zakázek, žádostí o odtah i zpráv od nás — i když je aplikace zavřená.
          </p>
          <Button size="sm" className="w-full" onClick={registerNative} disabled={registering}>
            {registering ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
            {tokens.length > 0 ? "Aktualizovat toto zařízení" : "Zapnout notifikace"}
          </Button>
          {tokens.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-xs font-medium">Vaše zařízení ({tokens.length}):</p>
              {tokens.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                  <span className="truncate flex-1">📱 {t.platform} · {t.model || t.token.slice(0, 20)}…</span>
                  <Button size="icon" variant="ghost" onClick={() => removeToken(t.id)}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ────── WEB / PWA ──────
  if (!webSupported) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">Web push</span>
            <Badge variant="outline">Nedostupné</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Tento prohlížeč nepodporuje web push. Pro plnohodnotné notifikace nainstalujte naši mobilní aplikaci (iOS / Android).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          {permission === "granted" ? (
            <Bell className="w-5 h-5 text-success" />
          ) : (
            <BellOff className="w-5 h-5 text-muted-foreground" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium">Push notifikace (web / PWA)</p>
            <p className="text-xs text-muted-foreground">
              {permission === "granted"
                ? "Notifikace jsou aktivní"
                : permission === "denied"
                ? "Notifikace jsou zablokované v prohlížeči"
                : "Dostávejte upozornění na změny zakázek a objednávek"}
            </p>
          </div>
        </div>
        {permission === "granted" ? (
          <Button variant="outline" size="sm" className="w-full" onClick={disableWeb}>
            Vypnout notifikace
          </Button>
        ) : permission !== "denied" ? (
          <Button size="sm" className="w-full" onClick={requestWebPermission} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
            Zapnout notifikace
          </Button>
        ) : (
          <p className="text-xs text-destructive">Povolte notifikace v nastavení prohlížeče.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default PushNotificationToggle;
