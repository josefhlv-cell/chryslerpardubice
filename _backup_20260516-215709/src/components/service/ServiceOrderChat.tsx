import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Loader2 } from "lucide-react";

interface Message {
  id: string;
  service_order_id: string;
  sender_id: string;
  message: string;
  is_from_service: boolean;
  created_at: string;
}

interface Props {
  orderId: string;
  isAdmin: boolean;
}

const ServiceOrderChat = ({ orderId, isAdmin }: Props) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("service_order_messages")
      .select("*")
      .eq("service_order_id", orderId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as Message[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    fetchMessages();
    const channel = supabase
      .channel(`chat-${orderId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "service_order_messages",
        filter: `service_order_id=eq.${orderId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !user) return;
    setSending(true);
    await supabase.from("service_order_messages").insert({
      service_order_id: orderId,
      sender_id: user.id,
      message: newMsg.trim(),
      is_from_service: isAdmin,
    } as any);
    setNewMsg("");
    setSending(false);
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <MessageCircle className="w-4 h-4 mr-2" /> Chat se servisem
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Chat</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Zavřít</Button>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-2 bg-muted/30 rounded-lg p-3">
          {loading && <Loader2 className="w-4 h-4 animate-spin mx-auto" />}
          {!loading && messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Zatím žádné zprávy</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender_id === user?.id ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${
                m.sender_id === user?.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
              }`}>
                {m.is_from_service && m.sender_id !== user?.id && (
                  <p className="text-[10px] font-semibold mb-0.5 opacity-70">Servis</p>
                )}
                <p>{m.message}</p>
                <p className="text-[10px] opacity-50 mt-1">
                  {new Date(m.created_at).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Napište zprávu..."
            value={newMsg}
            onChange={e => setNewMsg(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            className="text-sm"
          />
          <Button size="icon" onClick={sendMessage} disabled={sending || !newMsg.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ServiceOrderChat;
