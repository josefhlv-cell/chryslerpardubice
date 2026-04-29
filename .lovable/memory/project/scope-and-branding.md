---
name: Scope and Branding
description: Allowed catalog brands (Cadillac + Lincoln removed 2026-04)
type: constraint
---
Catalog brands: Chrysler, Dodge, RAM, Lancia ONLY.
Removed: Jeep, Hummer, Cadillac, Lincoln (no parts coverage in Mopar/J+M sources).
ALLOWED_BRANDS const lives in:
- src/api/catalogV2API.ts
- src/pages/AdminCompatibility.tsx
- src/pages/Catalog.tsx (BRAND_ORDER)
