/**
 * Plovoucí widget live chatu pro zákazníka. Skryje se, když je feature flag vypnutý
 * nebo uživatel není přihlášený.
 */
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useSupportChat } from "@/hooks/use-support-chat";

export default function SupportChatWidget() {
  const { user, isAdmin } = useAuth();
  const { flags, loading: flagsLoading } = useFeatureFlags();
  const enabled = flags["live_chat_enabled"] ?? true;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, loading, sending, send } = useSupportChat();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  if (!user || isAdmin || flagsLoading || !enabled) return null;

  const handleSend = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    try { await send(t, false); } catch { setText(t); }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition"
          aria-label="Otevřít chat se servisem"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
      {open && (
        <Card className="fixed bottom-20 right-4 z-40 w-[92vw] max-w-sm h-[70vh] max-h-[500px] flex flex-col shadow-xl border-primary/30">
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
