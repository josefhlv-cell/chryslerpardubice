
-- Allow mechanics to view their own tasks
CREATE POLICY "Mechanics can view own tasks"
ON public.mechanic_tasks
FOR SELECT
TO authenticated
USING (
  mechanic_id IN (
    SELECT m.id FROM public.mechanics m
    JOIN public.employees e ON m.employee_id = e.id
    WHERE e.user_id = auth.uid() AND e.active = true AND m.active = true
  )
);

-- Allow mechanics to update their own tasks (start/complete)
CREATE POLICY "Mechanics can update own tasks"
ON public.mechanic_tasks
FOR UPDATE
TO authenticated
USING (
  mechanic_id IN (
    SELECT m.id FROM public.mechanics m
    JOIN public.employees e ON m.employee_id = e.id
    WHERE e.user_id = auth.uid() AND e.active = true AND m.active = true
  )
);

-- Allow mechanics to view service orders assigned to them
CREATE POLICY "Mechanics can view assigned orders"
ON public.service_orders
FOR SELECT
TO authenticated
USING (
  mechanic_id IN (
    SELECT m.id FROM public.mechanics m
    JOIN public.employees e ON m.employee_id = e.id
    WHERE e.user_id = auth.uid() AND e.active = true AND m.active = true
  )
);

-- Allow mechanics to view vehicles from their assigned orders
CREATE POLICY "Mechanics can view assigned vehicles"
ON public.user_vehicles
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT so.vehicle_id FROM public.service_orders so
    WHERE so.mechanic_id IN (
      SELECT m.id FROM public.mechanics m
      JOIN public.employees e ON m.employee_id = e.id
      WHERE e.user_id = auth.uid() AND e.active = true AND m.active = true
    )
    AND so.vehicle_id IS NOT NULL
  )
);

-- Allow mechanics to insert work reports
CREATE POLICY "Mechanics can insert work reports"
ON public.work_reports
FOR INSERT
TO authenticated
WITH CHECK (
  mechanic_id IN (
    SELECT m.id FROM public.mechanics m
    JOIN public.employees e ON m.employee_id = e.id
    WHERE e.user_id = auth.uid() AND e.active = true AND m.active = true
  )
);

-- Allow mechanics to insert service order photos
CREATE POLICY "Mechanics can insert order photos"
ON public.service_order_photos
FOR INSERT
TO authenticated
WITH CHECK (
  service_order_id IN (
    SELECT so.id FROM public.service_orders so
    WHERE so.mechanic_id IN (
      SELECT m.id FROM public.mechanics m
      JOIN public.employees e ON m.employee_id = e.id
      WHERE e.user_id = auth.uid() AND e.active = true AND m.active = true
    )
  )
);
