
-- Support chat: jedna konverzace na zákazníka, zprávy s realtime
CREATE TABLE public.support_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview TEXT,
  unread_admin_count INTEGER NOT NULL DEFAULT 0,
  unread_customer_count INTEGER NOT NULL DEFAULT 0,
  closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  is_from_admin BOOLEAN NOT NULL DEFAULT false,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_messages_conv ON public.support_messages(conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_messages TO authenticated;
GRANT ALL ON public.support_conversations TO service_role;
GRANT ALL ON public.support_messages TO service_role;

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Konverzace: majitel + admin
CREATE POLICY "own or admin read conv" ON public.support_conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own insert conv" ON public.support_conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "own or admin update conv" ON public.support_conversations FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete conv" ON public.support_conversations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Zprávy: kdo vidí konverzaci
CREATE POLICY "read msgs" ON public.support_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_conversations c WHERE c.id = conversation_id
    AND (c.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "insert own msg" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.support_conversations c WHERE c.id = conversation_id
      AND (c.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "update read msgs" ON public.support_messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_conversations c WHERE c.id = conversation_id
    AND (c.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE TRIGGER trg_support_conv_updated BEFORE UPDATE ON public.support_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Po nové zprávě: update konverzace + notifikace pro protistranu
CREATE OR REPLACE FUNCTION public.trg_support_message_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _customer_id UUID;
  _admin_id UUID;
  _sender_name TEXT;
BEGIN
  SELECT user_id INTO _customer_id FROM public.support_conversations WHERE id = NEW.conversation_id;

  UPDATE public.support_conversations
    SET last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.message, 120),
        unread_admin_count = CASE WHEN NEW.is_from_admin THEN unread_admin_count ELSE unread_admin_count + 1 END,
        unread_customer_count = CASE WHEN NEW.is_from_admin THEN unread_customer_count + 1 ELSE unread_customer_count END,
        closed = false
    WHERE id = NEW.conversation_id;

  IF NEW.is_from_admin THEN
    -- notifikace zákazníkovi
    INSERT INTO public.notifications (user_id, title, message, link, event_type, dedupe_key)
    VALUES (_customer_id, '💬 Nová zpráva od servisu', LEFT(NEW.message, 200), '/support-chat', 'support_message_customer',
            'support-msg:' || NEW.id::text)
    ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  ELSE
    -- notifikace všem adminům (jedna, dedupe podle zprávy)
    SELECT COALESCE(NULLIF(full_name,''), email) INTO _sender_name FROM public.profiles WHERE user_id = _customer_id;
    FOR _admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      INSERT INTO public.notifications (user_id, title, message, link, event_type, dedupe_key)
      VALUES (_admin_id, '💬 Nová zpráva v chatu',
              COALESCE(_sender_name,'Zákazník') || ': ' || LEFT(NEW.message, 160),
              '/admin?tab=support-chat&conv=' || NEW.conversation_id::text,
              'support_message_admin',
              'support-msg-a:' || NEW.id::text || ':' || _admin_id::text)
      ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_support_msg_ai AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_support_message_after_insert();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;

-- Kill-switch feature flag
INSERT INTO public.feature_flags (feature_key, enabled, description)
VALUES ('live_chat_enabled', true, 'Zapíná live chat pro zákazníky (globální kill-switch)')
ON CONFLICT (feature_key) DO NOTHING;
