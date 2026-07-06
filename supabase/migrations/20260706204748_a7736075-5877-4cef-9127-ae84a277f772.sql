
-- Add archived_at to all archivable tables
ALTER TABLE public.orders                     ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.service_orders             ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.service_bookings           ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.tow_requests               ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.vehicle_buyback_requests   ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.vehicle_import_requests    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.used_part_requests         ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.new_part_orders            ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.vehicle_inquiries          ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.fault_reports              ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.support_conversations      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.jm_orders                  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Partial indexes to keep default (non-archived) queries fast
CREATE INDEX IF NOT EXISTS idx_orders_not_archived                   ON public.orders(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_service_orders_not_archived           ON public.service_orders(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_service_bookings_not_archived         ON public.service_bookings(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tow_requests_not_archived             ON public.tow_requests(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_buyback_requests_not_archived ON public.vehicle_buyback_requests(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_import_requests_not_archived  ON public.vehicle_import_requests(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_used_part_requests_not_archived       ON public.used_part_requests(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_new_part_orders_not_archived          ON public.new_part_orders(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_inquiries_not_archived        ON public.vehicle_inquiries(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fault_reports_not_archived            ON public.fault_reports(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_conversations_not_archived    ON public.support_conversations(last_message_at DESC NULLS LAST) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jm_orders_not_archived                ON public.jm_orders(created_at DESC) WHERE archived_at IS NULL;

-- Admin can hard-delete archived rows (partial policies applied to every archivable table)
-- All these tables already have admin UPDATE via has_role, so archive/restore works. We add DELETE for admin only.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'orders','service_orders','service_bookings','tow_requests',
    'vehicle_buyback_requests','vehicle_import_requests',
    'used_part_requests','new_part_orders','vehicle_inquiries',
    'fault_reports','support_conversations','jm_orders'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop then create so re-runs don't error
    EXECUTE format('DROP POLICY IF EXISTS "Admin can delete archived %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Admin can delete archived %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role) AND archived_at IS NOT NULL)',
      t
    );
    -- Ensure admin can UPDATE (set/clear archived_at)
    EXECUTE format('DROP POLICY IF EXISTS "Admin can archive %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "Admin can archive %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))',
      t
    );
  END LOOP;
END $$;
