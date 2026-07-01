/**
 * AdminPushSettings — správa Web Push odběrů a native (FCM/APNs) tokenů adminu.
 * Web Push: registruje service worker, ukládá subscription do admin_push_subscriptions.
 * Native Push: čte device_tokens (kam ukládá src/lib/native/index.ts při startu aplikace)
 * a nabízí ruční re-registraci na Capacitor platformě.
 */
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Smartphone, Globe, Trash2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const AdminPushSettings = () => {
  const { user } = useAuth();
  const [webSubs, setWebSubs] = useState<any[]>([]);
  const [nativeTokens, setNativeTokens] = useState<any[]>([]);
  const [supported, setSupported] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window);
    setIsNative(Capacitor.isNativePlatform());
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    const [w, d] = await Promise.all([
      supabase.from("admin_push_subscriptions").select("*").eq("user_id", user.id),
      supabase.from("device_tokens").select("*").eq("user_id", user.id).in("platform", ["ios", "android"]),
    ]);
    setWebSubs(w.data || []);
    setNativeTokens(d.data || []);
  };

  const enableWebPush = async () => {
    if (!user || !supported) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast({ title: "Notifikace nepovoleny", variant: "destructive" });
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true });
      const json = sub.toJSON();
      const { error } = await supabase.from("admin_push_subscriptions").upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh || "",
        auth_key: json.keys?.auth || "",
        user_agent: navigator.userAgent.slice(0, 200),
      }, { onConflict: "endpoint" });
      if (error) throw error;
      toast({ title: "✅ Web Push aktivováno" });
      fetchData();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  const removeSub = async (id: string) => {
    const { error } = await supabase.from("admin_push_subscriptions").delete().eq("id", id);
    if (error) {
      toast({ title: "Nepodařilo se smazat", description: error.message, variant: "destructive" });
      return;
    }
    fetchData();
  };

  const removeNative = async (id: string) => {
    const { error } = await supabase.from("device_tokens").delete().eq("id", id);
    if (error) {
      toast({ title: "Nepodařilo se smazat", description: error.message, variant: "destructive" });
      return;
    }
    fetchData();
  };

  const registerNative = async () => {
    if (!isNative || !user) {
      toast({
        title: "Pouze v mobilní APK",
        description: "Native push funguje jen v Capacitor buildu pro iOS/Android.",
        variant: "destructive",
      });
      return;
    }
    setRegistering(true);
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { Device } = await import("@capacitor/device");

      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") {
        toast({ title: "Notifikace nepovoleny v systému", variant: "destructive" });
        return;
      }

      // register + wait for the first 'registration' event
      const token: string = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timeout při čekání na FCM/APNs token")), 15_000);
        PushNotifications.addListener("registration", (t) => {
          clearTimeout(timer);
          resolve(t.value);
        });
        PushNotifications.addListener("registrationError", (err) => {
          clearTimeout(timer);
          reject(new Error(err.error || "Registration error"));
        });
        PushNotifications.register().catch(reject);
      });

      const info = await Device.getInfo();
      const id = await Device.getId();
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
      toast({ title: "✅ Native push aktivováno", description: `Token uložen (${Capacitor.getPlatform()})` });
      fetchData();
    } catch (e: any) {
      toast({ title: "Chyba native push", description: e.message, variant: "destructive" });
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Bell className="w-5 h-5 text-primary" />
        Push notifikace pro adminy
      </h2>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <h3 className="font-medium">Web Push (prohlížeč / PWA)</h3>
            {supported ? (
              <Badge className="bg-success/15 text-success">Podporováno</Badge>
            ) : (
              <Badge variant="outline">Nedostupné</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Funguje na desktopu i mobilu po instalaci PWA. Dostaneš upozornění na nové objednávky a zakázky.
          </p>
          <Button onClick={enableWebPush} disabled={!supported}>
            <Bell className="w-4 h-4 mr-1" /> Aktivovat na tomto zařízení
          </Button>

          {webSubs.length > 0 && (
            <div className="space-y-1 pt-2">
              <p className="text-xs font-medium">Aktivní zařízení ({webSubs.length}):</p>
              {webSubs.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                  <span className="truncate flex-1">{s.user_agent || s.endpoint.slice(0, 60)}</span>
                  <Button size="icon" variant="ghost" onClick={() => removeSub(s.id)}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Smartphone className="w-4 h-4 text-primary" />
            <h3 className="font-medium">Native Push (FCM / APNs)</h3>
            {nativeTokens.length > 0 ? (
              <Badge className="bg-success/15 text-success">{nativeTokens.length} zařízení</Badge>
            ) : (
              <Badge variant="outline">{isNative ? "Nepřipojeno" : "Nedostupné (web)"}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Pro nativní APK / IPA: token se registruje automaticky po přihlášení. Pokud se nezaregistroval,
            klikni na tlačítko níže. Vyžaduje nastavené credentials na serveru (FCM service account, APNs klíč).
          </p>

          <Button onClick={registerNative} disabled={!isNative || registering}>
            {registering ? (
              <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> Registruji…</>
            ) : (
              <><Smartphone className="w-4 h-4 mr-1" /> Aktivovat native push</>
            )}
          </Button>

          {!isNative && (
            <p className="text-[11px] text-muted-foreground">
              Otevři aplikaci jako nainstalovanou APK/IPA (Capacitor build), ne v prohlížeči.
            </p>
          )}

          {nativeTokens.length > 0 && (
            <div className="space-y-1 pt-2">
              {nativeTokens.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30 gap-2">
                  <span className="truncate flex-1">
                    📱 {t.platform} · {t.model || "?"} · {(t.token || "").slice(0, 24)}…
                  </span>
                  <Button size="icon" variant="ghost" onClick={() => removeNative(t.id)}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPushSettings;
