/**
 * AdminSupportChat — seznam konverzací + panel zpráv + kill-switch live chatu.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, MessageCircle, PowerOff, Power } from "lucide-react";

interface Conv {
  id: string;
  user_id: string;
  last_message_at: string;
  last_message_preview: string | null;
  unread_admin_count: number;
  closed: boolean;
  customer_name?: string;
  customer_email?: string;
}
interface Msg {
  id: string;
  conversation_id: string;
  sender_id: string;
  is_from_admin: boolean;
  message: string;
  created_at: string;
}

export default function AdminSupportChat() {
  const { user } = useAuth();
  const { flags, toggleFlag, refetch } = useFeatureFlags();
  const chatEnabled = flags["live_chat_enabled"] ?? true;

  const [convs, setConvs] = useState<Conv[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConvs = async () => {
    const { data } = await supabase
      .from("support_conversations" as any)
      .select("*")
      .order("last_message_at", { ascending: false });
    const list = ((data as any) || []) as Conv[];
    // Enrich with profile info
    const ids = list.map((c) => c.user_id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", ids);
      const map = new Map((profs || []).map((p: any) => [p.user_id, p]));
      list.forEach((c) => {
        const p: any = map.get(c.user_id);
        c.customer_name = p?.full_name;
        c.customer_email = p?.email;
      });
    }
    setConvs(list);
    setLoading(false);
  };

  useEffect(() => { loadConvs(); }, []);

  // Realtime updates for conversation list
  useEffect(() => {
    const ch = supabase
      .channel("admin-support-conv-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, () => loadConvs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Deep link ?conv=
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const conv = sp.get("conv");
    if (conv) setSelectedId(conv);
  }, []);

  // Load messages
  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      const { data } = await supabase
        .from("support_messages" as any)
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });
      setMsgs(((data as any) || []) as Msg[]);
      // reset unread
      await supabase.from("support_conversations" as any)
        .update({ unread_admin_count: 0 } as any)
        .eq("id", selectedId);
      await supabase.from("support_messages" as any)
        .update({ read_at: new Date().toISOString() } as any)
        .eq("conversation_id", selectedId)
        .eq("is_from_admin", false)
        .is("read_at", null);
    })();

    const ch = supabase
      .channel(`admin-support-msgs-${selectedId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "support_messages",
        filter: `conversation_id=eq.${selectedId}`,
      }, (payload) => setMsgs((prev) => [...prev, payload.new as Msg]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const sendMsg = async () => {
    const t = text.trim();
    if (!t || !selectedId || !user) return;
    setSending(true);
    setText("");
    const { error } = await supabase.from("support_messages" as any).insert({
      conversation_id: selectedId,
      sender_id: user.id,
      is_from_admin: true,
      message: t,
    } as any);
    setSending(false);
    if (error) setText(t);
  };

  const selectedConv = convs.find((c) => c.id === selectedId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" /> Live chat
        </h2>
        <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
          {chatEnabled ? <Power className="w-4 h-4 text-success" /> : <PowerOff className="w-4 h-4 text-destructive" />}
          <span className="text-xs">Chat pro zákazníky</span>
          <Switch
            checked={chatEnabled}
            onCheckedChange={async (v) => { await toggleFlag("live_chat_enabled", v); await refetch(); }}
          />
        </div>
      </div>

      {!chatEnabled && (
        <div className="text-xs bg-destructive/10 border border-destructive/30 rounded-lg p-2 text-destructive">
          Live chat je pro zákazníky vypnutý — widget se jim vůbec nezobrazí.
        </div>
      )}

      <div className="grid md:grid-cols-[280px_1fr] gap-3 min-h-[500px]">
        {/* Seznam konverzací */}
        <Card className="p-2 max-h-[600px] overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
          ) : convs.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4 text-center">Žádné konverzace</p>
          ) : (
            <div className="space-y-1">
              {convs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-2 rounded-lg transition ${
                    selectedId === c.id ? "bg-primary/15 border border-primary/40" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold truncate">
                      {c.customer_name || c.customer_email || "Zákazník"}
                    </p>
                    {c.unread_admin_count > 0 && (
                      <Badge className="bg-destructive text-destructive-foreground h-5 min-w-5 text-[10px]">
                        {c.unread_admin_count}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {c.last_message_preview || "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(c.last_message_at).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Panel zpráv */}
        <Card className="flex flex-col">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              Vyberte konverzaci ze seznamu.
            </div>
          ) : (
            <>
              <div className="p-3 border-b">
                <p className="text-sm font-semibold">{selectedConv.customer_name || "Zákazník"}</p>
                <p className="text-[10px] text-muted-foreground">{selectedConv.customer_email}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20 max-h-[500px]">
                {msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.is_from_admin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${
                      m.is_from_admin ? "bg-primary text-primary-foreground" : "bg-card border border-border"
                    }`}>
                      <p className="whitespace-pre-wrap">{m.message}</p>
                      <p className="text-[10px] opacity-50 mt-1">
                        {new Date(m.created_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="p-2 border-t flex gap-2">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMsg())}
                  placeholder="Odpověď zákazníkovi..."
                  disabled={sending}
                />
                <Button size="icon" onClick={sendMsg} disabled={sending || !text.trim()}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
