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
  const [unread, setUnread] = useState(0);
  const channelRef = useRef<any>(null);


  // Load or create conversation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setLoading(false); return; }
      setLoading(true);
      const { data: existing } = await supabase
        .from("support_conversations" as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      let convId: string | null = (existing as any)?.id ?? null;
      if (!convId) {
        const { data: created } = await supabase
          .from("support_conversations" as any)
          .insert({ user_id: user.id } as any)
          .select("id")
          .single();
        convId = (created as any)?.id ?? null;
      }
      if (cancelled) return;
      setConversationId(convId);

      if (convId) {
        const { data: msgs } = await supabase
          .from("support_messages" as any)
          .select("*")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true });
        if (!cancelled) {
          const list = ((msgs as any) || []) as SupportMessage[];
          setMessages(list);
          setUnread(list.filter((m) => m.is_from_admin && !m.read_at).length);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

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
    setUnread(0);
    await supabase
      .from("support_messages" as any)
      .update({ read_at: new Date().toISOString() } as any)
      .eq("conversation_id", conversationId)
      .eq("is_from_admin", true)
      .is("read_at", null);
    await supabase
      .from("support_conversations" as any)
      .update({ unread_customer_count: 0 } as any)
      .eq("id", conversationId);
  }, [conversationId]);

  const send = useCallback(async (text: string, isFromAdmin = false) => {
    if (!user || !conversationId || !text.trim()) return;
    setSending(true);
    const { error } = await supabase.from("support_messages" as any).insert({
      conversation_id: conversationId,
      sender_id: user.id,
      is_from_admin: isFromAdmin,
      message: text.trim(),
    } as any);
    setSending(false);
    if (error) throw error;
  }, [user, conversationId]);

  return { conversationId, messages, loading, sending, send, unread, markRead };

}
