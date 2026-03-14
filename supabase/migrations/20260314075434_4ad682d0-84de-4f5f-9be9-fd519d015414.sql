-- Allow authenticated users to insert notifications for themselves
CREATE POLICY "Users can create own notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);