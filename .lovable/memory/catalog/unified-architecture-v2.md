---
name: Unified Catalog v2 (Mopar + J+M)
description: 5-úrovňový drill-down na /catalog (Brand → Model → Engine → Category → Parts). OEM (Mopar/EPC) z parts_new + LIVE overlay J+M přes jm-proxy edge function. SAG/AutoKelly skryté.
type: feature
---

# Unified Catalog v2

- Zdroj OEM/Mopar: `parts_new` (catalog_source ∈ mopar, epc-ai, 7zap, epc-link, ai-epc) — řazeno OEM-first (rank 1), badge **ORIGINÁL**.
- Zdroj alternativ: **LIVE J+M / Nextis** přes `jm-proxy` edge function (action `searchByVehicle`). Vrací se přes `fetchJmForVehicle()` v `src/api/catalogV2API.ts`, normalizuje se na `CatalogPart` s `catalog_source='jm'`, rank 5 a badge **NÁHRADA**. Synthetic id `jm:OEM`.
- Mergování: `mergeWithJm(base, jm)` v `catalogV2API.ts` deduplikuje podle normalizovaného OEM (alfanumerické porovnání) a zachová Mopar nahoře.
- UI: `Catalog.tsx` volá J+M jen na `page === 0`, ukazuje „+ N z J+M Autodíly" a malý loader „Hledám živou nabídku J+M…“.
- Objednávky: J+M položky se ukládají s `part_id = NULL` (nejsou v parts_new); standardní `orders` insert s `oem_number`, `part_name`, `catalog_source='jm'`.
- SAG, AutoKelly, Starline jsou explicitně mimo v2 katalog.
