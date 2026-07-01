-- Vyčištění transakčních dat před ostrým startem.
-- Ponecháváme: profiles, user_roles, my_vehicles/vehicles, feature_flags, catalog data.
TRUNCATE TABLE
  public.service_order_messages,
  public.service_order_parts,
  public.service_order_photos,
  public.service_order_status_history,
  public.service_orders,
  public.service_bookings,
  public.service_book_shares,
  public.jm_orders,
  public.new_part_orders,
  public.orders,
  public.vehicle_inquiries,
  public.fault_reports,
  public.tow_requests,
  public.notifications
RESTART IDENTITY CASCADE;