-- 1. Zpřísnit realtime policy: jen vlastní topic
DROP POLICY IF EXISTS "Authenticated users can subscribe" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can send" ON realtime.messages;

CREATE POLICY "Users subscribe own topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'user:' || auth.uid()::text || ':%'
  OR realtime.topic() LIKE 'public:%'
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users send own topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'user:' || auth.uid()::text || ':%'
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2. Trigger pro automatické odeslání push notifikace po INSERT do notifications
CREATE OR REPLACE FUNCTION public.trg_send_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire-and-forget call do send-push edge funkce
  PERFORM net.http_post(
    url := 'https://nzmeiluvpmchipyssdms.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bWVpbHV2cG1jaGlweXNzZG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODM5MDksImV4cCI6MjA4ODE1OTkwOX0.1jnb06nPP9H91B7UYZK593JyeoMNyQCysp3VKUmcPa4'
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Pokud send-push selže, notifikace v DB nesmí být zablokována
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notifications_send_push ON public.notifications;
CREATE TRIGGER notifications_send_push
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.trg_send_push_on_notification();