---
name: OEM Compatibility Mapping
description: Bridge linking parts_new ↔ nextis_vehicles via catalog_vehicle_compatibility, with auto-matcher and is_oem priority sort
type: feature
---
## Architecture
- **nextis_vehicles** — kanonická tabulka Nextis vozidel (brand/model/engine/year_from/year_to + external_id).
- **catalog_vehicle_compatibility** rozšířena o:
  - `nextis_vehicle_id` (FK na nextis_vehicles)
  - `is_oem` (boolean — Mopar/OEM priorita)
  - `match_method` (exact / supersession / crossref / fuzzy / manual / bulk / fuzzy-approved)
  - `match_confidence` (0–100)
- **compatibility_match_queue** — fuzzy matche pod 95 % skóre čekají na admin schválení.

## Auto-Matcher (Edge function `compat-matcher`)
Strategie ranking: exact OEM → supersession (`part_supersessions`) → crossref (`part_crossref`) → fuzzy normalized (Levenshtein, prahy: 85 do queue, 95 auto-link).
Akce: `match-part` (jeden díl) | `match-all` (batch s `limit`).
Helper: `normalize_oem(text)`.

## Listing logic (`catalogV2API.listParts`)
- `nextisVehicleId` → JOIN přes compatibility, vrací jen napárované díly.
- `unmappedOnly: true` → díly bez vazby (pro „Bez specifikace vozu" sekci).
- Třídění: rank (Mopar=1) ASC v rámci stránky.

## Admin UI
- `/admin/compatibility` — Auto-Matcher, Bulk Attach (RPC `bulk_attach_part_to_vehicles`), Match Queue, Statistiky.
- `<PartCompatibilityManager>` — picker v detailu dílu (`AdminPriceManagement` / parts editor).

## Frontend Tree
- `CatalogTree` má sekci "Speciální → Bez specifikace vozu" pro nemapované OEM díly.
