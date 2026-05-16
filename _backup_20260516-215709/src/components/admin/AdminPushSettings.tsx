/**
 * AdminPushSettings — správa Web Push odběrů a FCM tokenů adminu.
 * Web Push: registruje service worker, ukládá subscription do admin_push_subscriptions.
 * FCM: jen scaffold pro Capacitor (vyžaduje Firebase setup → google-services.json).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Smartphone, Globe, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const AdminPushSettings = () => {
  const { user } = useAuth();
  const [webSubs, setWebSubs] = useState<any[]>([]);
  const [fcmTokens, setFcmTokens] = useState<any[]>([]);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window);
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    const [w, f] = await Promise.all([
      supabase.from("admin_push_subscriptions").select("*").eq("user_id", user.id),
      supabase.from("admin_fcm_tokens").select("*").eq("user_id", user.id),
    ]);
    setWebSubs(w.data || []);
    setFcmTokens(f.data || []);
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
    await supabase.from("admin_push_subscriptions").delete().eq("id", id);
    fetchData();
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
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" />
            <h3 className="font-medium">Native Push (FCM, Android)</h3>
            {fcmTokens.length > 0 ? (
              <Badge className="bg-success/15 text-success">{fcmTokens.length} zařízení</Badge>
            ) : (
              <Badge variant="outline">Nepřipojeno</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Pro mobilní APK: vyžaduje Firebase projekt a nahrání <code>google-services.json</code>.
            Po setupu se token registruje automaticky při přihlášení.
          </p>
          {fcmTokens.length > 0 && (
            <div className="space-y-1">
              {fcmTokens.map((t) => (
                <div key={t.id} className="text-xs p-2 rounded bg-muted/30 truncate">
                  📱 {t.platform} · {t.token.slice(0, 30)}…
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
