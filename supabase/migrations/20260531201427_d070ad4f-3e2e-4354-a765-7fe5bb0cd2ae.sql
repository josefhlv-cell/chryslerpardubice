-- Audit cleanup: invalidate poisoned J+M part-detail cache and dedupe jm_part_v2

-- 1) Drop ALL jm_part_detail cache; next request re-enriches with brand guard.
DELETE FROM public.api_cache WHERE cache_type = 'jm_part_detail';

-- 2) Dedupe jm_part_v2 — keep newest row per (oem_number, manufacturer).
DELETE FROM public.jm_part_v2 a
USING public.jm_part_v2 b
WHERE a.ctid < b.ctid
  AND a.oem_number IS NOT DISTINCT FROM b.oem_number
  AND COALESCE(lower(a.manufacturer),'') = COALESCE(lower(b.manufacturer),'');

-- 3) Sanitize raw J+M payloads where a brake/chassis part carries sensor-style
--    technical parameters or VAG-only OE numbers (J+M source corruption).
UPDATE public.jm_part_v2
SET raw = raw
  - 'technical_parameters'
  - 'oe_numbers'
WHERE lower(coalesce(raw->>'category','')) ~ '(brzd|třmen|kotouč|destič|tlumič|odpruž|řízení|spojka|filtr)'
  AND (
    (raw->'technical_parameters')::text ~* '(snímač|sensor|zástrčk|hadičk plnicí|fluorokarbon|polybutylen|pólová)'
    OR (
      jsonb_typeof(raw->'oe_numbers') = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(raw->'oe_numbers') t
        WHERE t.value ~* '(CHRYSLER|DODGE|JEEP|RAM|MOPAR|CADILLAC|HUMMER|TESLA|LANCIA)'
      )
    )
  );