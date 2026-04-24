---
name: Unified Catalog v2 (Mopar + J+M)
description: 5-úrovňový drill-down na /catalog (Brand → Model → Engine → Category → Parts). OEM (Mopar/EPC) z parts_new + LIVE overlay J+M přes jm-proxy edge function. SAG/AutoKelly skryté. Denní auto-sync J+M hierarchie přes pg_cron.
type: feature
---

# Unified Catalog v2

- Zdroj OEM/Mopar: `parts_new` (catalog_source ∈ mopar, epc-ai, 7zap, epc-link, ai-epc) — řazeno OEM-first (rank 1), badge **ORIGINÁL**.
- Zdroj alternativ: **LIVE J+M / Nextis** přes `jm-proxy` edge function (action `searchByVehicle`). Vrací se přes `fetchJmForVehicle()` v `src/api/catalogV2API.ts`, normalizuje se na `CatalogPart` s `catalog_source='jm'`, rank 5 a badge **NÁHRADA**. Synthetic id `jm:OEM`.
- Mergování: `mergeWithJm(base, jm)` v `catalogV2API.ts` deduplikuje podle normalizovaného OEM (alfanumerické porovnání) a zachová Mopar nahoře.
- UI: `Catalog.tsx` volá J+M jen na `page === 0`, ukazuje „+ N z J+M Autodíly" a malý loader „Hledám živou nabídku J+M…".
- Objednávky: J+M položky se ukládají s `part_id = NULL` (nejsou v parts_new); standardní `orders` insert s `oem_number`, `part_name`, `catalog_source='jm'`.
- SAG, AutoKelly, Starline jsou explicitně mimo v2 katalog.

## J+M sync hierarchie (Nextis → catalog_categories)
- Edge action `syncCategories` v `jm-proxy` plní `nextis_vehicles` + `catalog_categories(source='jm')` brandem→modelem→motorem (whitelist: chrysler/dodge/ram/cadillac/lancia).
- **Auth model:** `syncCategories` se autorizuje anon/service Bearer klíčem (server-to-server, žádný user JWT). Všechny ostatní actions vyžadují přihlášeného uživatele (claims.sub).
- **Manuální spuštění:** Admin → Nastavení katalogů → karta „J+M Autodíly (Nextis) – synchronizace katalogu" (komponenta `AdminCatalogSettings.tsx`, volá `jmAdapter.syncCategories()`).
- **Automatický cron:** `pg_cron` job `jm-sync-daily` (každý den 03:00) volá edge funkci `jm-proxy` s `{"action":"syncCategories"}` a anon Bearer key.
