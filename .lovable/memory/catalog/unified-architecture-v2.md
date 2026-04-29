---
name: Unified Catalog v2 (Mopar + J+M)
description: 5-úrovňový drill-down na /catalog. Strom s scopovaným fetchLocalCategoryTree (brand→model→engine→categories). diagnose-part volá db-backup přes service-role fetch. jm-classify-parts mapuje deterministicky podle klíčových slov a ceny <=0 vždy zobrazí "Na objednávku".
type: feature
---

# Unified Catalog v2

- Zdroj OEM/Mopar: `parts_new` (catalog_source ∈ mopar, epc-ai, 7zap, epc-link, ai-epc) — řazeno OEM-first (rank 1), badge **ORIGINÁL**.
- Zdroj alternativ: **LIVE J+M** přes `jm-proxy` edge function (action `searchByVehicle`). `fetchJmForVehicle()` v `src/api/catalogV2API.ts`.
- Mergování: `mergeWithJm(base, jm)` deduplikuje podle normalizovaného OEM (alfanumerické porovnání) a zachová Mopar nahoře.
- UI: `Catalog.tsx` volá J+M jen na `page === 0`. Brand whitelist Chrysler/Dodge/RAM/Cadillac/Lancia.
- Objednávky: J+M položky se ukládají s `part_id = NULL` (nejsou v parts_new); `orders.catalog_source='jm'`.

## Kanonické kategorie (J+M strom)
20 globálních kategorií v `catalog_categories(node_type='global')`: Brzdový systém, Chlazení, Elektroinstalace, Filtry, Interiér, Karoserie, Klimatizace, Motor, Odpružení, Osvětlení, Palivový systém, Převodovka, Řízení, Údržba, Výfuk, Náplně a kapaliny, Pneumatiky a disky, Příslušenství a nářadí, Náprava, Ostatní.
- `parts_new.category` se sjednocuje na 19 kanonických hodnot (Brzdy→Brzdové zařízení, Výfukový systém→Výfuk, Tlumiče a pružiny→Odpružení, Náplně a maziva→Kapaliny a oleje, Rozvody→Motor, Zapalování→Elektroinstalace, Spojka→Převodovka).
- Mapování dílů na strom v `catalog_part_categories` (1 primární řádek na díl) — řízeno deterministickými keyword pravidly v `jm-classify-parts` + SQL fallback.

## J+M sync hierarchie
- `jm-tree-build` deterministická šablona DEFAULT_TREE (brand→model(+years)→engine→category→subcategory), CHUNK_SIZE=12 vozidel, self-invoke přes EdgeRuntime.waitUntil.
- `jm-classify-parts` přemapuje všechny díly podle klíčových slov v názvu+kategorii (DELETE+INSERT v dávkách 1000), bez AI, bez network volání.
- Manuální spuštění: Admin → Synchronizace katalogu → AdminCatalogSettings.tsx.

## Diagnostika
- `catalog-diagnostic` priority validation + deep scan + návrhy oprav (mark_on_order, normalize_categories, translate_names, fill_missing_names, assign_categories_by_name, dedupe_oem, rebuild_compatibility).
- `diagnose-part` per-part analýza + apply. **Backup je povinný** — volá `db-backup` přes přímý `fetch` se SERVICE_ROLE Bearer headerem (NE přes `supabase.functions.invoke`, který by posílal user JWT). Při selhání zálohy vrací HTTP 200 s `{success:false, fallback:true}` aby frontend nezůstal v 500 loop.
- `db-backup` přijímá tři varianty auth: cron (anon key), interní (service role) a admin user JWT.

## Frontend
- `fetchLocalCategoryTree()` v `catalogV2API.ts` filtruje `catalog_categories` na konkrétní brand→model→engine a vrací jen kategorie pro daný motor. Pokud strom neexistuje, fallback na vyšší úroveň (model/brand/global). Počty u kategorií se počítají z `parts_new_public` podle canonical mappingu.
- `listPartsForVehicle()` používá `parts_new_public` view (skrývá VIN/marže), strategie: catalog_part_categories (s flag) → compat join → text match → category-only fallback. Ceny se nepředávají AI ani neupravují, pouze čte se `price_with_vat`/`price_without_vat`.
