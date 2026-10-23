ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_details jsonb;
COMMENT ON COLUMN public.orders.delivery_details IS 'Checkout recipient and shipping snapshot, independent of profile.';
CREATE OR REPLACE FUNCTION public.customer_service_decision(p_order_id uuid, p_approved boolean)
RETURNS public.service_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE current_order public.service_orders; updated_order public.service_orders;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT * INTO current_order FROM public.service_orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not available'; END IF;
 IF current_order.status <> 'waiting_approval' THEN RAISE EXCEPTION 'Order is no longer awaiting approval'; END IF;
 UPDATE public.service_orders SET customer_approved=p_approved, status=CASE WHEN p_approved THEN 'in_repair'::public.service_order_status ELSE 'received'::public.service_order_status END WHERE id=p_order_id RETURNING * INTO updated_order;
 INSERT INTO public.service_order_status_history(service_order_id,old_status,new_status,changed_by,note) VALUES(p_order_id,current_order.status::text,updated_order.status::text,auth.uid(),CASE WHEN p_approved THEN 'Zákazník schválil opravu' ELSE 'Zákazník neschválil opravu' END);
 RETURN updated_order;
END $$;
REVOKE ALL ON FUNCTION public.customer_service_decision(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_service_decision(uuid,boolean) TO authenticated,service_role;