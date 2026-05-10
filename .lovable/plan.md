## Cíl

Funkční katalog pro všech 5 značek, jeden centrální flow: motor → všechny díly → strom kategorií → OEM první, J+M druhé.

## Co se mění

### 1. `supabase/functions/jm-proxy/index.ts` — nová akce `partsForEngine`

Jediný účel: vrátit **všechny J+M díly pro danou motorizaci v jednom volání**, obohacené o OEM párování.

Vstup: `{ brand, model, engine, nextisVehicleId? }`
Výstup: `{ items: UnifiedPart[], totalRawHits, oemSeedsUsed }`

Logika:
1. Načti z `parts_new` všechny Mopar/7zap OEM kódy pro daný brand+model (fuzzy engine match přes existující `queryLocalOemCodes`).
2. Pro každý OEM zavolej `items-finding-by-code` s `searchTarget=CodeOE` (paralelně, batch po 8, max 80 OEM).
3. Sloučit, deduplikovat (přes `dedupeUnifiedParts`).
4. Obohatit přes `enrichItemsWithRelatedOem` → každý J+M má `related_oem_number`.
5. Pro každý item určit `genArtID` post-hoc z **rozšířeného slovníku** klíčových slov v `productName`/`productDescription` (rozšířit `PRODUCT_CATEGORY_TREE` v jm-proxy o `genArtID` pro každý leaf — TecDoc 80+ ID: `brake-pads=402, brake-discs=82, brake-calipers=472, brake-hoses=95, brake-fluid=1789, abs-sensor=1226, oil-filter=22, air-filter=26, cabin-filter=350, fuel-filter=23, spark-plugs=18, ignition-coil=174, glow-plugs=19, timing-belt=213, timing-chain=8929, water-pump=50, thermostat=195, radiator=31, ac-compressor=300, ac-condenser=233, alternator=71, starter=72, battery=590, shock-absorbers=51, springs=419, control-arms=423, ball-joints=432, tie-rods=433, bushings=459, wheel-bearings=110, cv-joints=204, drive-shafts=204, exhaust-muffler=64, lambda-sensor=180, dpf=2840, catalyst=104, fuel-pump=20, injector=29, transmission-oil=2769, engine-oil=1749, coolant=1707, brake-fluid-dot=1789, wiper-blades=42, headlights=84, taillights=85, mirrors=305, door-handles=2245`).
6. Vrátit položky s polem `tecdoc_section: { id: number, name: string }`.

Cache: 1h v `api_cache` per `(brand|model|engine)`.

### 2. `src/services/catalogService.ts` — nový soubor

```typescript
export type CategoryGroup = {
  id: string;            // tecdoc_section.id as string, or 'other'
  label: string;         // tecdoc_section.name
  count: number;
  partsByOem: Map<string, { oem: CatalogPart[]; jm: CatalogPart[] }>;
};

export async function fetchAllPartsForEngine(opts: {
  brand: string; model: string; engine: string; nextisVehicleId?: string;
}): Promise<{ groups: CategoryGroup[]; totalParts: number }> {
  // 1. invoke jm-proxy { action: 'partsForEngine', payload: opts }
  // 2. extract unique tecdoc_section → groups
  // 3. for each group, batch-fetch OEM rows from parts_new where oem_number IN (jm.oe_numbers ∪ jm.related_oem_number)
  // 4. groupů: partsByOem keyed by OEM number, with [oem first, then jm replacements]
}
```

OEM marže: žádná (cena přímo z `parts_new.price_with_vat`).
J+M marže: už aplikovaná v jm-proxy `normalizeCatalogItem` (70 %/40 %, beze změny).

### 3. `src/pages/Catalog.tsx` — zjednodušení

Po výběru motoru:
- 1× volání `fetchAllPartsForEngine` (place loading state na celý strom).
- Smazat: `fetchJmCategoryTree`, `listPartsForVehicle`, `fetchJmByCodes`, `mergeWithJm` jakožto sekvenční chain.
- Strom = `groups` z výsledku, klik filtruje `partsByOem` daného groupu.
- Počty v navigaci = `group.count`.
- V kartách: nejprve OEM řádky (badge ORIGINÁL, cena z parts_new), pod nimi J+M (badge NÁHRADA, cena s marží).

### 4. `src/api/catalogV2API.ts` — vyčistit

Smazat (mrtvý kód): `fetchLocalCategoryTree`, `fetchJmCategoryTree`, `isJmTreeFlagEnabled`, `mergeWithJm`, `listPartsForVehicle`, `fetchJmByCodes`. Zachovat: `fetchBrands`, `fetchModelsForBrand`, `fetchEnginesForModel`, `fetchNextisVehicles`, `globalOemSearch`, `searchCatalog`, `normalizeRow` (přesunout do `catalogService`).

### 5. Motorizace v MotorizationDetails

Beze změny — už čte z `nextis_vehicles` přesně co user chce (kW, palivo, ccm, kód, roky).

## Co se NEdělá

- ❌ Nic v `catalog_categories` (nepoužívá se).
- ❌ Žádný scraping, cookies, Firecrawl.
- ❌ Žádné nové DB tabulky (existující `jq_*` zůstanou nedotčeny — ten experiment se nepoužívá).
- ❌ Žádné AI pro kategorizaci ani překlady jmen J+M (jména přicházejí z Nextis česky).

## Test (Chrysler 300C 5.7 HEMI)

1. Vyber motorizaci → roky/kW/palivo viditelné z `nextis_vehicles`.
2. Po načtení: očekávám 8–15 kategorií se 2–30+ díly každá.
3. Klik na "Brzdy" → vidím Mopar OEM destičky/kotouče první, pod nimi J+M Frenkit/Brembo s marží.
4. Klik na "Filtry" → olejové, vzduchové, kabinové.
5. Při 0 výsledcích: kategorie skryté (nezobrazují se prázdné).

## Rizika / co může selhat

- Nextis OEM-fallback je pomalý (až 80 paralelních volání). Cache 1h zmírní opakování, ale **první načtení nového motoru = 5–15 s**. Přidám overlay loading.
- Klíčová slova pro genArtID nejsou 100 %. Díly bez matche → kategorie "Ostatní" (nezatajovat).
- Pokud `parts_new` neobsahuje žádné Mopar OEM pro daný motor → nemáme seed → 0 J+M dílů. Tomu předejdeme tím, že fallback rozšíří hledání na brand+model bez engine match (`queryLocalOemCodes` už to umí jako 2. fáze).
