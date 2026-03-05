
CREATE OR REPLACE FUNCTION public.calculate_discounted_price(
  _price_without_vat numeric,
  _discount_percent numeric,
  _vat_rate numeric DEFAULT 21
)
RETURNS TABLE(discounted_price numeric, price_with_vat numeric)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT
    ROUND(_price_without_vat * (1 - _discount_percent / 100), 2) AS discounted_price,
    ROUND(_price_without_vat * (1 - _discount_percent / 100) * (1 + _vat_rate / 100), 2) AS price_with_vat
$$;
