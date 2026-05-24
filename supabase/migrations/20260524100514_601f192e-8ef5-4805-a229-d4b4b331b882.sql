
-- Stop kitoem price sync cron (and parts_new price sync cron) before bulk merge
DO $$ BEGIN PERFORM cron.unschedule('kitoem-price-sync-auto'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('price-sync-auto'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Backup tables (timestamped snapshot)
DROP TABLE IF EXISTS public.kitoem_parts_backup;
CREATE TABLE public.kitoem_parts_backup AS TABLE public.kitoem_parts;

DROP TABLE IF EXISTS public.parts_new_backup;
CREATE TABLE public.parts_new_backup AS TABLE public.parts_new;

-- Lock backups (admin-only)
ALTER TABLE public.kitoem_parts_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts_new_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read kitoem backup" ON public.kitoem_parts_backup
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin read parts_new backup" ON public.parts_new_backup
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
