## Cíl

Stabilizovat a zrychlit `partsForEngine` flow s TecDoc Engine ID (K-type), zavést mapování K-type na konkrétní vehicle konfigurace, přidat diagnostiku, K-type lookup z Nextisu a uklidit admin/katalog menu.

## 1. DB: nová tabulka `vehicle_engine_mappings`

```sql
CREATE TABLE public.vehicle_engine_mappings (
  id uuid PK,
  brand text NOT NULL,
  model text NOT NULL,
  engine text NOT NULL,           -- normalizovaný název (5.7L V8 HEMI)
  year_from int,
  year_to int,
  power_kw int,
  fuel text,
  vin_pattern text,               -- volitelný regex pro variantu (např. ^2C3.*H.*$)
  k_type bigint NOT NULL,         -- TecDoc Engine ID
  k_type_label text,              -- popis vrácený Nextisem
  source text DEFAULT 'manual',   -- manual | nextis_lookup
  verified_at timestamptz,
  notes text,
  created_at, updated_at
);
-- index brand+model+engine, unique (brand, model, engine, COALESCE(vin_pattern,''), k_type)
```

RLS: admin manage, public select.
`nextis_vehicles.external_id` zůstává jako fallback (legacy).

## 2. Edge function `jm-proxy` — optimalizace TECDOC scanu

Resolver K-type pro request:
1. Pokud má vozidlo VIN → najdi nejlepší match v `vehicle_engine_mappings` (vin_pattern → konfigurace).
2. Fallback: match jen brand+model+engine (+ rok).
3. Fallback: `nextis_vehicles.external_id`.
4. Jinak OEM-seed flow (legacy).

Batched paralelní volání `items-finding-by-vehicle` pro `TECDOC_SECTIONS`:
- **Concurrency limit 6** (semaphore) místo `Promise.all` všeho najednou.
- **Per-call timeout 8s** (`AbortController`).
- **Retry s exponenciálním backoffem** (3 pokusy: 250ms / 750ms / 2s, jen pro 5xx/timeout).
- **Global budget 45s** — přerušit zbytek a vrátit částečný výsledek.
- **Progres** zapisovat do `api_cache` (`jm_scan_progress::cacheKey`) — UI může polling.

Přidat do response:
```ts
{ items, categories, debug: {
  flow: 'engineId' | 'oemFallback',
  k_type: 12345,
  sectionsScanned, sectionsHit, totalRawHits,
  durationMs, timedOutSections, retriedSections
}}
```

## 3. Edge function `nextis-ktype-lookup` (nová)

Endpoint `POST /nextis-ktype-lookup`:
- Vstup: `{ brand, model, engine?, yearFrom?, yearTo?, powerKw? }`
- Volá Nextis `vehicles-by-brand-model` (a/nebo `vehicles-search`), filtruje podle motoru/výkonu/let.
- Vrátí seznam kandidátů: `[{ k_type, label, engine, power_kw, fuel, year_from, year_to, score }]`.
- 7d cache v `api_cache`.

Validace endpoint: `POST /nextis-ktype-validate` — zavolá `sections-by-vehicle` s K-type, vrátí `{ valid, sectionsAvailable }`.

## 4. Admin UI `AdminCompatibility.tsx` — Engine ID tab přepsat

- Místo „K-type per nextis_vehicle" → CRUD nad `vehicle_engine_mappings`.
- Form: brand → model (autocomplete z `nextis_vehicles`) → engine → roky/výkon → VIN pattern (volitelně).
- Tlačítko **„Najít K-type"** → volá `nextis-ktype-lookup`, ukáže kandidáty s confidence skóre, admin klikne „Použít".
- Tlačítko **„Ověřit"** → `nextis-ktype-validate`, ukáže kolik TECDOC sekcí je dostupných.
- Seznam existujících mappingů s filtrem brand/model.
- Tlačítko clear cache pro `jm_parts_for_engine` + `jm_scan_progress`.

## 5. Catalog UI — debug badge pro adminy

V `src/pages/Catalog.tsx`:
- Pokud `useAuth().isAdmin` a v response je `debug` → pod hlavičkou zobrazit malý badge:
  > 🔧 K-type 12345 · 47/52 sekcí · 312 surových hitů · 4.2s
- Při běžícím scanu (progres v `api_cache`) zobrazit lineární progress bar.

## 6. Testy

`supabase/functions/jm-proxy/index.test.ts`:
- **Mock test (CI)**: stub `fetch` pro Nextis endpointy, ověř že:
  - engineId flow rozparalelní volání s limitem ≤6,
  - response má `debug.sectionsScanned > 0`, `flow === 'engineId'`,
  - retry funguje při 503,
  - timeout přeruší a označí sekci v `timedOutSections`.
- **Live test za flagem `LIVE_NEXTIS_TEST=1`**: zavolá deployed `jm-proxy` pro Chrysler 300C 5.7 HEMI s K-type, ověří že vrátí ≥10 unikátních kategorií.

## 7. Cleanup admin katalogu

Skrýt ze sidebaru / `src/components/admin/AdminSidebar.tsx`:
- Makro nástroje (`/admin/makro*`)
- SAG nástroje (`/admin/sag*`)
- AutoKelly nástroje (`/admin/autokelly*`)
- AI-aftermarket (`/admin/ai-aftermarket`)
- Starý EPC generation queue (`/admin/epc-queue`)

Routy ponechat (data v DB), ale schované za feature flag `legacy_aftermarket_admin` (default off). Sekce sidebaru sjednotit do nové „**Katalog (J+M)**":
- Kategorie a kompatibilita (`/admin/compatibility`)
- Engine ID mapování (`/admin/compatibility?tab=ktype`)
- J+M sync (`/admin/jm-sync`)
- Diagnostika katalogu (`/admin/catalog-diagnostics`)
- Cache & progres (nový mini panel)

## 8. Memory update

Aktualizovat `mem://catalog/oem-compatibility-mapping` a přidat `mem://catalog/engine-id-mapping` s pravidly K-type lookupu a vehicle_engine_mappings schématem.

---

### Soubory dotčené

- **Migrace**: `vehicle_engine_mappings` + RLS + indexy + feature flag
- **Edge fn**: `supabase/functions/jm-proxy/index.ts` (optimalizace + debug + resolver)
- **Edge fn (nová)**: `supabase/functions/nextis-ktype-lookup/index.ts`
- **Test**: `supabase/functions/jm-proxy/index.test.ts`
- **Admin UI**: `src/pages/AdminCompatibility.tsx`, `src/components/admin/AdminSidebar.tsx`
- **Catalog UI**: `src/pages/Catalog.tsx` (debug badge + progres)
- **Service**: `src/services/catalogService.ts` (přenos `debug` pole)
- **Memory**: `mem://catalog/engine-id-mapping`, update indexu

### Co NEdělám
- Neměním OEM/Mopar/EPC flow.
- Nemažu data z `nextis_vehicles.external_id` — zůstává jako fallback.
- Aftermarket routy (Makro/SAG/AK) zůstávají v kódu, jen schované.
