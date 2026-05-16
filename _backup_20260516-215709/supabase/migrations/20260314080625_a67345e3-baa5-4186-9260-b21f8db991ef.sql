
-- 1. Create employees table
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'mechanic',
  email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage employees" ON public.employees
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees can view themselves" ON public.employees
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view active employees" ON public.employees
  FOR SELECT USING (active = true);

-- 2. Add employee_id to mechanics table
ALTER TABLE public.mechanics ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

-- 3. Create work_reports table
CREATE TABLE public.work_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_id uuid REFERENCES public.mechanics(id),
  employee_id uuid REFERENCES public.employees(id),
  service_order_id uuid REFERENCES public.service_orders(id),
  task_id uuid REFERENCES public.mechanic_tasks(id),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  note text,
  photos text[] DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.work_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage work reports" ON public.work_reports
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees can manage own work reports" ON public.work_reports
  FOR ALL TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- 4. Add started_at to mechanic_tasks
ALTER TABLE public.mechanic_tasks ADD COLUMN IF NOT EXISTS started_at timestamp with time zone;

-- 5. Enable realtime for new tables only
ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_reports;
