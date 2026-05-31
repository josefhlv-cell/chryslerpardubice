-- Vyčištění falešných "Mopar OEM" záznamů v kitoem_parts.
-- Pokud oem_number = jm_part_code, jde o J+M aftermarket kód (QP0322C, REMSA, NRF...),
-- který se chybně zobrazoval jako "ORIGINÁL ⭐ MOPAR / OEM".

DELETE FROM public.kitoem_parts
WHERE oem_number = jm_part_code;

-- Zabráníme dalšímu znečištění CHECK constraintem.
ALTER TABLE public.kitoem_parts
  ADD CONSTRAINT kitoem_parts_oem_not_jm_code
  CHECK (jm_part_code IS NULL OR oem_number <> jm_part_code);