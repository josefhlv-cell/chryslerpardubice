

## Plan: EPC Diagrams Table and Auto-Generation

### Current State
- **Catalog scraping** (`epc-generate` + `scrape-7zap`): Fully implemented with AI normalization, duplicate prevention, and auto-expansion on VIN search.
- **Data storage**: Categories go into `epc_categories`, parts into `parts_new` + `epc_part_links`, compatibility into `part_vehicle_compatibility`, procedures into `service_procedures`.
- **Diagram generation**: `epc-diagram` edge function generates SVGs with `data-oem`/`data-name` attributes, but stores them in `epc_categories.diagram_svg` column, not a dedicated table.
- **Caching**: localStorage cache with TTLs (VIN 7d, OEM 30d, diagrams permanent) + DB fallback already in place.

### What Needs to Change

**1. Create `epc_diagrams` table** (migration)
```sql
CREATE TABLE public.epc_diagrams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  engine text,
  category text NOT NULL,
  subcategory text,
  svg_content text NOT NULL,
  parts_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand, model, category, subcategory)
);
ALTER TABLE public.epc_diagrams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view diagrams" ON public.epc_diagrams FOR SELECT USING (true);
CREATE POLICY "Admins can manage diagrams" ON public.epc_diagrams FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE INDEX idx_epc_diagrams_lookup ON public.epc_diagrams(brand, model, category);
```

**2. Update `epc-diagram` edge function**
- After generating SVG, save to `epc_diagrams` table (upsert on unique constraint) instead of updating `epc_categories.diagram_svg`.

**3. Update `epc-generate` edge function**
- After inserting categories and parts, trigger diagram generation for each category by calling the `epc-diagram` function internally (or inline the generation logic). Generate one diagram per main category with its parts list.

**4. Update `getEPCDiagram` in `partsAPI.ts`**
- Change DB cache lookup from `epc_categories.diagram_svg` to `epc_diagrams` table.
- On cache miss + AI generation, save result to `epc_diagrams`.

**5. Update `EPCBrowser.tsx`**
- Auto-load diagram when subcategory is selected (check `epc_diagrams` first).
- Show "generating diagram" state during auto-generation.

### Files to Edit
- New migration SQL (create `epc_diagrams` table)
- `supabase/functions/epc-diagram/index.ts` (save to `epc_diagrams`)
- `supabase/functions/epc-generate/index.ts` (auto-generate diagrams after catalog creation)
- `src/api/partsAPI.ts` (update `getEPCDiagram` to use `epc_diagrams` table)
- `src/components/catalog/EPCBrowser.tsx` (auto-load diagrams on subcategory select)

