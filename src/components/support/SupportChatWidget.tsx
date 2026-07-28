/**
 * Plovoucí widget live chatu pro zákazníka.
 * Ikona je vždy vidět vpravo dole (poloprůhledná), skrývá se jen pro adminy
 * nebo když je feature flag live chatu vypnutý.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useSupportChat } from "@/hooks/use-support-chat";

export default function SupportChatWidget() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { flags, loading: flagsLoading } = useFeatureFlags();
  const enabled = flags["live_chat_enabled"] ?? true;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, loading, sending, send, unread, markRead } = useSupportChat();

  useEffect(() => { if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);
  useEffect(() => { if (open && unread > 0) markRead(); }, [open, unread, markRead]);

  if (isAdmin || flagsLoading || !enabled) return null;

  const handleSend = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    try { await send(t, false); } catch { setText(t); }
  };

  const openChat = () => {
    if (!user) { navigate("/auth"); return; }
    setOpen(true);
  };

  return (
    <>
      {!open && (
        <button
          onClick={openChat}
          className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary/40 hover:bg-primary/80 text-primary-foreground backdrop-blur-md border border-primary/50 shadow-lg flex items-center justify-center transition-all hover:scale-105 opacity-80 hover:opacity-100"
          aria-label="Otevřít chat se servisem"
        >
          <MessageCircle className="w-6 h-6" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
      {open && (
        <Card className="fixed bottom-20 right-4 z-40 w-[92vw] max-w-sm h-[70vh] max-h-[500px] flex flex-col shadow-xl border-primary/30 bg-card/95 backdrop-blur-md">

          <div className="flex items-center justify-between p-3 border-b bg-primary/10">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">Chat se servisem</p>
                <p className="text-[10px] text-muted-foreground">Odpovíme co nejdříve</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
            {loading && <Loader2 className="w-4 h-4 animate-spin mx-auto mt-4" />}
            {!loading && messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                Napište nám dotaz, tým Chrysler Pardubice odpoví hned, jak to půjde.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.is_from_admin ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${
                  m.is_from_admin
                    ? "bg-card border border-border"
                    : "bg-primary text-primary-foreground"
                }`}>
                  {m.is_from_admin && <p className="text-[10px] font-semibold mb-0.5 opacity-70">Servis</p>}
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
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="Napište zprávu..."
              className="text-sm"
              disabled={sending}
            />
            <Button size="icon" onClick={handleSend} disabled={sending || !text.trim()}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
