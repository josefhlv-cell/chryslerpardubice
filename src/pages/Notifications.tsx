import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Bell, Check, Loader2, Wrench, ShoppingCart, AlertTriangle, Info } from "lucide-react";

type Notification = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

const getNotificationIcon = (title: string) => {
  if (title.includes("servis") || title.includes("🔧")) return { icon: Wrench, color: "text-primary", bg: "bg-primary/10" };
  if (title.includes("objednávk") || title.includes("📦")) return { icon: ShoppingCart, color: "text-warning", bg: "bg-warning/10" };
  if (title.includes("⚠") || title.includes("urgentní")) return { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" };
  return { icon: Info, color: "text-muted-foreground", bg: "bg-secondary" };
};

const Notifications = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setNotifications((data as Notification[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("user-notifications")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen pb-20 bg-background">
        <PageHeader title="Oznámení" showBack />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-background">
      <PageHeader
        title="Oznámení"
        showBack
        rightElement={
          unreadCount > 0 ? (
            <Button variant="ghost" size="sm" className="text-xs text-primary h-8" onClick={markAllRead}>
              <Check className="w-3.5 h-3.5 mr-1" /> Přečíst vše
            </Button>
          ) : undefined
        }
      />
      <div className="p-4 space-y-2.5 max-w-lg mx-auto">
        {notifications.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">Žádná oznámení</p>
          </div>
        )}

        {notifications.map((n, i) => {
          const { icon: NIcon, color, bg } = getNotificationIcon(n.title);
          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
            >
              <button
                onClick={() => !n.is_read && markRead(n.id)}
                className={`w-full text-left glass-card p-4 flex items-start gap-3.5 transition-all ${
                  !n.is_read ? "border-primary/30 bg-primary/[0.03]" : "opacity-60"
                }`}
              >
                <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <NIcon className={`w-4 h-4 ${color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display font-semibold text-sm">{n.title}</p>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                    {new Date(n.created_at).toLocaleString("cs-CZ")}
                  </p>
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default Notifications;
