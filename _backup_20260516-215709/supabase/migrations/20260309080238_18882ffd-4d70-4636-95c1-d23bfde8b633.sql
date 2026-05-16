
CREATE OR REPLACE FUNCTION public.manage_price_sync_cron(p_action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_action = 'pause' THEN
    PERFORM cron.unschedule('price-sync-auto');
    RETURN true;
  ELSIF p_action = 'resume' THEN
    PERFORM cron.schedule(
      'price-sync-auto',
      '* * * * *',
      $cron$
      SELECT extensions.http_post(
        url:='https://nzmeiluvpmchipyssdms.supabase.co/functions/v1/price-sync',
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bWVpbHV2cG1jaGlweXNzZG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODM5MDksImV4cCI6MjA4ODE1OTkwOX0.1jnb06nPP9H91B7UYZK593JyeoMNyQCysp3VKUmcPa4'
        ),
        body:='{"batchSize": 25, "mode": "auto"}'::jsonb
      );
      $cron$
    );
    RETURN true;
  ELSE
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;
END;
$$;
