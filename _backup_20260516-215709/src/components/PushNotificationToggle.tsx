import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const PushNotificationToggle = () => {
  const { user } = useAuth();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSupported("Notification" in window && "serviceWorker" in navigator);
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!supported || !user) return;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === "granted") {
        // Update profile to enable notifications
        await supabase
          .from("profiles")
          .update({ notifications_enabled: true })
          .eq("user_id", user.id);
        toast({ title: "Push notifikace zapnuty 🔔" });
        // Show test notification
        new Notification("Chrysler & Dodge Pardubice", {
          body: "Notifikace jsou nyní aktivní!",
          icon: "/icons/icon-192.png",
        });
      } else {
        toast({ title: "Notifikace zamítnuty", description: "Povolte je v nastavení prohlížeče.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Chyba", description: "Nepodařilo se aktivovat notifikace.", variant: "destructive" });
    }
    setLoading(false);
  };

  const disableNotifications = async () => {
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ notifications_enabled: false })
      .eq("user_id", user.id);
    toast({ title: "Push notifikace vypnuty" });
  };

  if (!supported) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          Push notifikace nejsou v tomto prohlížeči podporovány.
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
            <p className="text-sm font-medium">Push notifikace</p>
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
          <Button variant="outline" size="sm" className="w-full" onClick={disableNotifications}>
            Vypnout notifikace
          </Button>
        ) : permission !== "denied" ? (
          <Button size="sm" className="w-full" onClick={requestPermission} disabled={loading}>
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
