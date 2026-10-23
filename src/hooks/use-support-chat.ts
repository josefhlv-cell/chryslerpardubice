/**
 * useSupportChat — načte/založí konverzaci aktuálního uživatele, zprávy a realtime.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SupportMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  is_from_admin: boolean;
  message: string;
  read_at: string | null;
  created_at: string;
}

export function useSupportChat() {
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [unread, setUnread] = useState(0);
  const channelRef = useRef<any>(null);


  // Load or create conversation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setConversationId(null); setMessages([]); setUnread(0); setLoading(false); return; }
      setLoading(true);
      setError(null);
      setConversationId(null);
      setMessages([]);
      setUnread(0);
      try {
      const { data: existing, error: existingError } = await supabase
        .from("support_conversations" as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) throw existingError;
      let convId: string | null = (existing as any)?.id ?? null;
      if (!convId) {
        const { data: created, error: createError } = await supabase
          .from("support_conversations" as any)
          .insert({ user_id: user.id } as any)
          .select("id")
          .single();
        if (createError) throw createError;
        convId = (created as any)?.id ?? null;
      }
      if (cancelled) return;
      if (!convId) throw new Error("Konverzace není dostupná");

      if (convId) {
        const { data: msgs, error: messagesError } = await supabase
          .from("support_messages" as any)
          .select("*")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true });
        if (messagesError) throw messagesError;
        if (!cancelled) {
          setConversationId(convId);
          const list = ((msgs as any) || []) as SupportMessage[];
          setMessages(list);
          setUnread(list.filter((m) => m.is_from_admin && !m.read_at).length);
        }
      }
      } catch { if (!cancelled) setError("Chat se nepodařilo načíst."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user, retry]);

  // Realtime
  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`support-chat-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const msg = payload.new as SupportMessage;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        if (msg.is_from_admin && !msg.read_at) setUnread((n) => n + 1);
      })
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [conversationId]);

  const markRead = useCallback(async () => {
    if (!conversationId) return;
    try {
    const { error: messageError } = await supabase
      .from("support_messages" as any)
      .update({ read_at: new Date().toISOString() } as any)
      .eq("conversation_id", conversationId)
      .eq("is_from_admin", true)
      .is("read_at", null);
    if (messageError) throw messageError;
    const { error: conversationError } = await supabase
      .from("support_conversations" as any)
      .update({ unread_customer_count: 0 } as any)
      .eq("id", conversationId);
    if (conversationError) throw conversationError;
    setUnread(0);
    } catch { setError("Přečtení zpráv se nepodařilo uložit."); }
  }, [conversationId]);

  const send = useCallback(async (text: string, isFromAdmin = false) => {
    if (!user || !conversationId || loading || sending) throw new Error("Chat zatím není připraven");
    if (!text.trim()) return;
    setSending(true);
    try {
    const { data, error } = await supabase.from("support_messages" as any).insert({
      conversation_id: conversationId,
      sender_id: user.id,
      is_from_admin: isFromAdmin,
      message: text.trim(),
    } as any).select("*").single();
    if (error || !data) throw error ?? new Error("Zpráva nebyla uložena");
    const saved = data as unknown as SupportMessage;
    setMessages(prev => prev.some(m => m.id === saved.id) ? prev : [...prev, saved]);
    } finally { setSending(false); }
  }, [user, conversationId, loading, sending]);

  return { conversationId, messages, loading, sending, send, unread, markRead, error, retry: () => setRetry(n => n + 1) };

}
