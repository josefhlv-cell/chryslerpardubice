/**
 * Admin component for toggling push notifications per customer.
 * Shows in admin profile management.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Bell, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  notifications_enabled: boolean;
}

const AdminNotificationToggle = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchProfiles = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, user_id, email, full_name, company_name, notifications_enabled")
      .order("created_at", { ascending: false });
    if (data) setProfiles(data as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchProfiles(); }, []);

  const toggle = async (userId: string, current: boolean) => {
    await supabase
      .from("profiles")
      .update({ notifications_enabled: !current } as any)
      .eq("user_id", userId);
    setProfiles(prev => prev.map(p => p.user_id === userId ? { ...p, notifications_enabled: !current } : p));
    toast({ title: !current ? "Notifikace zapnuty" : "Notifikace vypnuty" });
  };

  const filtered = profiles.filter(p => {
    const q = search.toLowerCase();
    return !q || (p.email?.toLowerCase().includes(q) || p.full_name?.toLowerCase().includes(q) || p.company_name?.toLowerCase().includes(q));
  });

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Push notifikace zákazníků</h3>
      </div>
      <Input
        placeholder="Hledat zákazníka..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="text-sm"
      />
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filtered.map(p => (
          <Card key={p.id} className="hover:border-primary/20 transition-colors">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.full_name || p.email || "—"}</p>
                {p.company_name && <p className="text-[10px] text-muted-foreground">{p.company_name}</p>}
                <p className="text-[10px] text-muted-foreground">{p.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {p.notifications_enabled && <Badge variant="secondary" className="text-[10px]">Aktivní</Badge>}
                <Switch
                  checked={p.notifications_enabled}
                  onCheckedChange={() => toggle(p.user_id, p.notifications_enabled)}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminNotificationToggle;
