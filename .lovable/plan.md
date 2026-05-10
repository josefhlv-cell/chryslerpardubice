## Cíl
1. Opravit chybu `Unauthorized` v AI generátoru EPC (viz screenshot — "X Unauthorized" u každé kategorie).
2. Přidat admin nástroj **7zap OEM Scraper** s preview → sync workflow.
3. Sjednotit všechny scraping nástroje na vzor **Preview → Sync**.
4. Auto-pipeline: nový OEM → automaticky kategorizace + dotažení cen z vernostsevyplaci.cz.
5. Bonus nástroje pro katalog.

---

## A) Oprava `Unauthorized` v EPC generátoru

**Příčina:** `epc-generate-batch` (volaná z fronty / per kategorie) má auth check `Bearer` token, ale při volání z UI v batchi se nepředává správně user JWT, nebo edge function nenačte admin roli.

**Fix:**
- Sjednotit auth pattern přesně jako v `epc-generate/index.ts` (getClaims + check user_roles).
- V `AdminEpcManager.tsx` (volající UI) vždy posílat `supabase.functions.invoke()` (nikoliv raw fetch) — automaticky přidá Authorization header.
- Per-kategorie generování (loop) nahradit jediným voláním fronty + polling stavu z `epc_generation_queue` (zabrání 401 race + edge limit 60s).
- UI: u každé kategorie zobrazit `pending → running → done/failed` místo okamžitého "Unauthorized".

---

## B) Nový nástroj: **7zap OEM Bulk Scraper**

Cíl: stáhnout všechny OEM čísla daného modelu z `*.7zap.com` (Mopar/Chrysler/Dodge/RAM tree) jediným kliknutím, s preview před vložením.

**Edge function** `scrape-7zap-bulk`:
- Vstup: `{brand, model, year?, engine?}`
- Použije Firecrawl `crawl` endpoint na `https://{brand}.7zap.com/en/global/{model}-parts-catalog/` s depth 3.
- Extrahuje OEM + název + kategorii + diagram URL.
- Vrátí strukturovaný JSON (NEukládá hned!).

**Tabulka `scrape_preview_jobs`**:
- `id, source ('7zap'|'mopar'|'sag'|'ak'|'jm'), brand, model, status, raw_payload jsonb, parts_count, created_by, created_at`.
- Slouží jako mezisklad pro Preview → Sync.

**Admin UI komponenta `Admin7zapScraper.tsx`** v sekci `Katalog → Import → 7zap`:
1. Form: brand, model, year, engine.
2. Tlačítko **"Stáhnout náhled"** → uloží do `scrape_preview_jobs`, zobrazí tabulku všech nalezených OEM (počet, vzorek 50 řádků, kategorie).
3. Tlačítko **"Synchronizovat s katalogem"** → edge `apply-scrape-preview` (insertuje do `parts_new` s `catalog_source='7zap'`, `price_with_vat=0` → "Na objednávku").
4. Po insertu automaticky enqueue do nových triggerů (viz D).

---

## C) Sjednocený **Preview → Sync** pattern

Refaktor stávajících scraperů (Makro, SAG, AutoKelly) aby všechny prošly mezikrokem `scrape_preview_jobs`:
- `AdminMakroScraper`, `AdminSagSync`, `AdminAutoKellyScraper` → přidat fázi "Náhled" před skutečným insertem.
- Společná komponenta `ScrapePreviewTable.tsx` pro zobrazení (filtr značky, hledání OEM, sloupce: OEM, Název, Kategorie, Cena, Akce).
- Tlačítko **"Vyřadit"** per řádek + bulk **"Schválit a synchronizovat"**.

---

## D) Auto-pipeline po vložení nových OEM

**Postgres trigger `parts_new_after_insert`**:
1. Pokud `category IS NULL` → enqueue do `auto_categorize_queue` (zpracuje deterministický classifier `jm-classify-parts`).
2. Pokud `price_with_vat <= 0 AND catalog_source != 'jm'` → enqueue do `price_fetch_queue` (volá `price-sync` pro vernostsevyplaci.cz).
3. Pokud OEM neexistuje v `catalog_part_categories` → enqueue do `compat_match_queue` (`compat-matcher`).

**Edge function `auto-pipeline-worker`** (cron každé 2 min):
- Vezme batch 100 položek z každé fronty.
- Spustí příslušnou logiku (kategorizace / cena / kompatibilita).
- Loguje do `admin_audit_log`.

**UI:** v `AdminCatalogSettings` nová karta **"Auto-pipeline status"** se 3 frontami a posledními 20 zpracovanými.

---

## E) Bonus nástroje (přidám)

1. **OEM Bulk Validator** — zkontroluje všechny OEM v DB proti 7zap a označí mrtvé (`is_obsolete=true`).
2. **Duplicate OEM Cleaner** — najde duplicity podle normalizovaného OEM (alfanumerické), zobrazí preview a sloučí.
3. **Catalog Health Dashboard** — % dílů s cenou, % s kategorií, % s fotkou, top-10 nejstarších záznamů bez aktualizace.
4. **Smart Re-pricing Scheduler** — admin si vybere brand/model/kategorii a naplánuje hromadnou aktualizaci cen na pg_cron (např. "RAM 1500 každou neděli 3:00").
5. **Cross-source OEM Diff** — porovná OEM seznam mezi Mopar vs 7zap vs J+M, ukáže chybějící.

---

## F) Pořadí prací (paralelně v jednom PR)

1. DB migrace: `scrape_preview_jobs`, `auto_categorize_queue`, `price_fetch_queue`, `compat_match_queue`, trigger `parts_new_after_insert`, pg_cron job pro `auto-pipeline-worker`.
2. Oprava `epc-generate-batch` auth + UI status polling.
3. Edge `scrape-7zap-bulk` + `apply-scrape-preview` + `auto-pipeline-worker`.
4. UI: `Admin7zapScraper.tsx`, `ScrapePreviewTable.tsx`, refaktor Makro/SAG/AK na preview-first.
5. UI: `AdminCatalogHealth.tsx`, `AdminOemValidator.tsx`, `AdminDuplicateCleaner.tsx`, `AdminRepricingScheduler.tsx`, `AdminOemDiff.tsx`.
6. Zařadit do sidebar stromu: `Katalog → Import → [Náhled scrapů, 7zap, Makro, SAG, AK, CSV]`, `Katalog → Údržba → [Health, Validator, Duplicates, Repricing, Diff]`.

---

## Vyloučení / pozn.
- Nepřidávám aftermarket katalogové zdroje (per `mem://constraints/aftermarket-sources-disabled` — jen J+M zůstává jako aftermarket strom, 7zap je OEM).
- Ceny stále NIKDY z AI (per `mem://constraints/pricing-integrity`) — vernostsevyplaci.cz crawler je jediný zdroj.
- Backup proběhl v předchozím requestu, není potřeba znovu.
