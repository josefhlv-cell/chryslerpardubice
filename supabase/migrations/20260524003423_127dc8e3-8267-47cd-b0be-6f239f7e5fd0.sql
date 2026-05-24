
CREATE TABLE IF NOT EXISTS public.kitoem_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_number text NOT NULL,
  name text,
  description text,
  image_urls text[],
  category text,
  brand text,
  model text,
  engine text,
  k_type integer,
  year_from integer,
  year_to integer,
  jm_part_code text,
  jm_manufacturer text,
  technical_params jsonb,
  position text,
  oe_brand text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitoem_parts_oem_ktype_uniq UNIQUE (oem_number, k_type)
);

CREATE INDEX IF NOT EXISTS idx_kitoem_parts_oem ON public.kitoem_parts (oem_number);
CREATE INDEX IF NOT EXISTS idx_kitoem_parts_ktype ON public.kitoem_parts (k_type);
CREATE INDEX IF NOT EXISTS idx_kitoem_parts_brand_model ON public.kitoem_parts (brand, model);
CREATE INDEX IF NOT EXISTS idx_kitoem_parts_category ON public.kitoem_parts (category);

ALTER TABLE public.kitoem_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kitoem_parts_public_read"
  ON public.kitoem_parts FOR SELECT
  USING (true);

CREATE POLICY "kitoem_parts_admin_all"
  ON public.kitoem_parts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_kitoem_parts_updated
  BEFORE UPDATE ON public.kitoem_parts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Populator: rozbalí všechna oe_numbers ze všech jm_part_v2 do kitoem_parts
CREATE OR REPLACE FUNCTION public.populate_kitoem_from_jm()
RETURNS TABLE(jm_scanned bigint, oem_inserted bigint, categories_covered bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _scanned bigint := 0;
  _inserted bigint := 0;
  _cats bigint := 0;
BEGIN
  SELECT count(*) INTO _scanned FROM public.jm_part_v2;

  WITH src AS (
    SELECT
      p.id            AS jm_id,
      p.raw           AS raw,
      p.oem_number    AS jm_oem,
      p.name          AS jm_name,
      p.manufacturer  AS jm_brand,
      p.image_url     AS jm_image,
      t.brand, t.model, t.engine, t.k_type, t.gen_art_name
    FROM public.jm_part_v2 p
    JOIN public.jm_category_tree_v2 t ON t.id = p.node_id
  ),
  -- expand oe_numbers (JSON array of strings like "CHRYSLER: 05174311AC")
  oes AS (
    SELECT
      s.*,
      trim(both ' ' from
        CASE
          WHEN position(':' in oe_raw) > 0
            THEN substring(oe_raw from position(':' in oe_raw) + 1)
          ELSE oe_raw
        END
      ) AS oem_clean,
      trim(both ' ' from
        CASE
          WHEN position(':' in oe_raw) > 0
            THEN substring(oe_raw from 1 for position(':' in oe_raw) - 1)
          ELSE NULL
        END
      ) AS oe_brand
    FROM src s
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements_text(COALESCE(s.raw->'oe_numbers', '[]'::jsonb)) AS oe_raw
      UNION ALL
      SELECT s.jm_oem
      UNION ALL
      SELECT s.raw->>'related_oem_number' WHERE s.raw->>'related_oem_number' IS NOT NULL
    ) oe(oe_raw)
    WHERE oe_raw IS NOT NULL AND length(trim(oe_raw)) > 0
  ),
  yrs AS (
    SELECT brand, model, engine,
           min(year_from) AS yf,
           max(year_to)   AS yt
    FROM public.nextis_vehicles
    GROUP BY brand, model, engine
  ),
  ranked AS (
    SELECT
      o.*,
      y.yf, y.yt,
      ROW_NUMBER() OVER (
        PARTITION BY upper(regexp_replace(o.oem_clean, '[\s\-\._/]', '', 'g')), o.k_type
        ORDER BY
          (CASE WHEN o.raw->>'image' <> '' THEN 0 ELSE 1 END),
          (CASE WHEN COALESCE(o.raw->>'description','') <> '' THEN 0 ELSE 1 END),
          o.jm_id
      ) AS rn
    FROM oes o
    LEFT JOIN yrs y
      ON lower(y.brand) = lower(o.brand)
     AND lower(y.model) = lower(o.model)
     AND lower(COALESCE(y.engine,'')) = lower(COALESCE(o.engine,''))
  ),
  ins AS (
    INSERT INTO public.kitoem_parts (
      oem_number, name, description, image_urls, category,
      brand, model, engine, k_type, year_from, year_to,
      jm_part_code, jm_manufacturer, technical_params, position, oe_brand
    )
    SELECT
      upper(regexp_replace(r.oem_clean, '[\s\-\._/]', '', 'g')) AS oem_number,
      COALESCE(NULLIF(r.raw->>'name',''), r.jm_name) AS name,
      NULLIF(r.raw->>'description','') AS description,
      CASE
        WHEN jsonb_typeof(r.raw->'image_urls') = 'array'
             AND jsonb_array_length(r.raw->'image_urls') > 0
          THEN ARRAY(SELECT jsonb_array_elements_text(r.raw->'image_urls'))
        WHEN COALESCE(r.jm_image,'') <> ''
          THEN ARRAY[r.jm_image]
        ELSE NULL
      END AS image_urls,
      COALESCE(NULLIF(r.gen_art_name,''), NULLIF(r.raw->>'category','')) AS category,
      r.brand, r.model, r.engine, r.k_type,
      r.yf, r.yt,
      r.jm_oem AS jm_part_code,
      r.jm_brand AS jm_manufacturer,
      CASE WHEN jsonb_typeof(r.raw->'technical_parameters') = 'object'
           THEN r.raw->'technical_parameters' ELSE NULL END AS technical_params,
      CASE
        WHEN COALESCE(r.raw->>'name','') ILIKE '%přední%' OR r.jm_name ILIKE '%přední%' THEN 'přední'
        WHEN COALESCE(r.raw->>'name','') ILIKE '%zadní%'  OR r.jm_name ILIKE '%zadní%'  THEN 'zadní'
        ELSE NULL
      END AS position,
      NULLIF(r.oe_brand,'') AS oe_brand
    FROM ranked r
    WHERE r.rn = 1
    ON CONFLICT (oem_number, k_type) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _inserted FROM ins;

  SELECT count(DISTINCT category) INTO _cats FROM public.kitoem_parts WHERE category IS NOT NULL;

  jm_scanned := _scanned;
  oem_inserted := _inserted;
  categories_covered := _cats;
  RETURN NEXT;
END
$$;
