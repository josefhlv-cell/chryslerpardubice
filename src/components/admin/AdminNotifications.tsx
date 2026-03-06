import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Send, Loader2, Search } from "lucide-react";

type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  company_name: string | null;
  account_type: string;
};

const AdminNotifications = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase.from("profiles").select("id, user_id, full_name, email, company_name, account_type").order("full_name");
      setProfiles((data as Profile[]) || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const toggle = (userId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filteredProfiles.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredProfiles.map(p => p.user_id)));
    }
  };

  const send = async () => {
    if (!title || !message || selected.size === 0) {
      toast({ title: "Vyplňte název, zprávu a vyberte zákazníky", variant: "destructive" });
      return;
    }
    setSending(true);
    const rows = Array.from(selected).map(user_id => ({ user_id, title, message }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Oznámení odesláno ${rows.length} zákazníkům` });
      setTitle("");
      setMessage("");
      setSelected(new Set());
    }
    setSending(false);
  };

  const filteredProfiles = profiles.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.company_name?.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Název oznámení</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Vaše objednávka byla potvrzena" />
        </div>
        <div>
          <label className="text-sm font-medium">Zpráva</label>
          <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Text oznámení..." rows={3} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Vyberte zákazníky ({selected.size})</label>
          <Button size="sm" variant="ghost" onClick={selectAll} className="text-xs">
            {selected.size === filteredProfiles.length ? "Zrušit vše" : "Vybrat vše"}
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Hledat zákazníka..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-1 border rounded-lg p-2 bg-card">
            {filteredProfiles.map(p => (
              <label key={p.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={selected.has(p.user_id)}
                  onCheckedChange={() => toggle(p.user_id)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.full_name || p.email || "–"}</p>
                  {p.company_name && <p className="text-[10px] text-muted-foreground">{p.company_name}</p>}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <Button className="w-full" onClick={send} disabled={sending || selected.size === 0 || !title || !message}>
        {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
        Odeslat oznámení
      </Button>
    </div>
  );
};

export default AdminNotifications;
