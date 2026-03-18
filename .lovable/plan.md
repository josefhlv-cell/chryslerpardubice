
Cíl: bezpodmínečně opravit, aby Shop i EPC skutečně nabízely SAG alternativy vedle originálu, a ověřit to 4× po sobě.

Co jsem už konkrétně našel:
1. V `src/api/partsAPI.ts` je chyba v merge logice.
   - Edge funkce může vrátit SAG výsledek.
   - Klient pak ale dělá „refresh z DB“ jen podle čistého OEM.
   - SAG záznamy se v DB ukládají jako `SAG-<OEM>`, takže se při refresi znovu nenačtou.
   - Navíc když se něco z DB načte, funkce vrátí jen DB data a tím SAG výsledek zahodí.
   - To přesně vysvětluje stav „zobrazí se jen originál“.

2. V backendu `supabase/functions/catalog-search/index.ts` je SAG scraping nespolehlivý.
   - Logy ukazují `SCRAPE_TIMEOUT`.
   - Logy ukazují i `Still on login page, authentication failed`.
   - Tj. problém není jen v UI, ale i v samotném získání SAG dat.

3. V cache je už i vadný SAG záznam.
   - V databázi je aktuálně jen 1 SAG položka.
   - Má nesmyslný název a nulovou cenu.
   - To znamená, že se do cache ukládá i špatně parsovaný obsah ze SAG stránky.

Plán implementace:
1. Opravit klientský merge výsledků v `src/api/partsAPI.ts`
   - po `catalog-search` nevracet jen „fresh DB rows“
   - načítat z DB jak čisté OEM, tak `SAG-${OEM}`
   - sloučit DB + edge výsledky do jedné sady
   - deduplikovat podle `catalog_source + OEM + name/manufacturer`
   - zachovat SAG jako samostatné řádky, ne jako přepsaný originál

2. Opravit EPC enrichment v `enrichEPCPrices`
   - filtrovat rozbité SAG alternativy
   - nebrat nulové/nesmyslné záznamy jako validní alternativu
   - zpřesnit deduplikaci alternativ
   - zajistit, že originál i SAG alternativa mohou přijít zároveň

3. Zpevnit `searchSAG()` v `supabase/functions/catalog-search/index.ts`
   - přidat robustnější retry flow
   - přesněji rozlišit `login_failed`, `timeout`, `no_results`, `parse_failed`
   - validovat, že parser našel skutečný blok výsledku pro hledané OEM
   - neukládat navigační text, login stránku ani jiné falešné matchy
   - neukládat SAG výsledek do cache, pokud není důvěryhodný

4. Vyčistit poškozenou SAG cache
   - odstranit stávající vadné `sag` řádky s nulovou cenou / chybným názvem
   - znovu naplnit cache až po opravě parseru

5. Ověření 4× za sebou
   - backend: 4 po sobě jdoucí dotazy na `catalog-search`
   - Shop: 4 vyhledání po sobě, ověřit současné zobrazení `Zdroj 1` + `Zdroj 2`
   - EPC: 4 ověření v seznamu dílů, že alternativa je pod originálem jako samostatný řádek
   - pokud 4. test selže, vrátit se zpět na logy a dál opravovat, neuzavírat to jako hotové

Soubory, které upravím:
- `src/api/partsAPI.ts`
- `supabase/functions/catalog-search/index.ts`
- případně drobně `src/components/catalog/EPCBrowser.tsx`, pokud bude nutné zpřesnit vykreslení/fallback

Technicky důležité:
- Není to primárně problém badge nebo filtru.
- Hlavní závada je kombinace:
  1) ztráta SAG výsledků při klientském merge,
  2) nespolehlivý SAG scraping,
  3) uložení vadných SAG dat do cache.
- Není potřeba měnit schéma databáze; jde o logiku a data cleanup.
