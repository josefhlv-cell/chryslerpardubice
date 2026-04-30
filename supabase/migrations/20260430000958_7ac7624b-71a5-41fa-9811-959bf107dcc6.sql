DO $$
DECLARE r record;
BEGIN
  FOR r IN 
    SELECT vehicle_brand, vehicle_model FROM public.catalog_categories
    WHERE node_type='model' GROUP BY 1,2 HAVING COUNT(*) > 1
  LOOP
    DECLARE keep uuid; dup_ids uuid[];
    BEGIN
      SELECT id INTO keep FROM public.catalog_categories
        WHERE node_type='model' AND vehicle_brand=r.vehicle_brand AND vehicle_model=r.vehicle_model
        ORDER BY created_at LIMIT 1;
      SELECT array_agg(id) INTO dup_ids FROM public.catalog_categories
        WHERE node_type='model' AND vehicle_brand=r.vehicle_brand AND vehicle_model=r.vehicle_model AND id != keep;
      
      UPDATE public.catalog_categories child SET parent_id = keep
      WHERE parent_id = ANY(dup_ids)
        AND NOT EXISTS (SELECT 1 FROM public.catalog_categories sib WHERE sib.parent_id=keep AND sib.slug=child.slug);
      
      DELETE FROM public.catalog_categories WHERE parent_id = ANY(dup_ids);
      DELETE FROM public.catalog_categories WHERE id = ANY(dup_ids);
    END;
  END LOOP;
END$$;