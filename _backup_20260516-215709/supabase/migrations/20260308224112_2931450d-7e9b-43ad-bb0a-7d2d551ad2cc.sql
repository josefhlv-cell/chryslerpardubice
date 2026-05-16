
-- Enable pg_cron and pg_net extensions for automated scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule price-sync every 2 minutes
SELECT cron.schedule(
  'price-sync-auto',
  '*/2 * * * *',
  $$
  SELECT extensions.http_post(
    url := 'https://nzmeiluvpmchipyssdms.supabase.co/functions/v1/price-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bWVpbHV2cG1jaGlweXNzZG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODM5MDksImV4cCI6MjA4ODE1OTkwOX0.1jnb06nPP9H91B7UYZK593JyeoMNyQCysp3VKUmcPa4'
    ),
    body := '{"batchSize": 10, "mode": "auto"}'::jsonb
  );
  $$
);
