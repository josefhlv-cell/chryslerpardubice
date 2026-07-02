ALTER TABLE public.obd_permissions ADD COLUMN IF NOT EXISTS dpf boolean NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';