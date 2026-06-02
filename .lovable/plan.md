# Plán: Audit katalogu + Admin User 360

Rozděleno do dvou nezávislých bloků. Provedu v jednom průchodu, bez dalších otázek.

---

## BLOK A — Katalog 1:1 s J+M (backend + data + UI)

### A1. Strom kategorií 1:1 s J+M
- Nová edge funkce `jm-tree-rebuild-from-nextis`:
  - Pro každý vůz v `nextis_vehicles` (83) s validním `external_id` (K-type) zavolá Nextis `categories?ktype=...`.
  - Uloží do `catalog_categories` hierarchii **gen_art_name → subkategorie** přesně jak vrací API (žádný plochý seznam, žádné mapování).
  - Duplicitní názvy rozlišuje pozicí (`Žárovka (světlomet)`, `Žárovka (směrovka)` – z `gen_art_position`/`assembly_group`).
  - Počty dílů (`part_count`) bere z `articles?ktype=&genericArticleId=`.
- Doplnění chybějících K-type přes existující `catalog-auto-maintenance` (ktypeLimit 83).
- Spuštěno jednorázově + pg_cron nightly 02:00.

### A2. OEM díly (kitoem_parts, ~68 901)
Migrace + edge `oem-enrichment-backfill` (batchovaně, 500/run, EdgeRuntime.waitUntil):
- **Fotka** chybí → `UPDATE kitoem_parts SET image_url = jm.image FROM jm_part_v2 jm WHERE normalize_oem(oem)=normalize_oem(jm.oem_number)`; fallback `parts_new.image_url`.
- **Popis** chybí → analogicky z `jm_part_v2.name`/`parts_new.description`.
- **Technické parametry** chybí → z `jm_part_v2.raw->'technical_params'` (s brand-sanity guardem už existujícím v jm-proxy).
- **Brand** chybí → z `catalog_vehicle_compatibility.brand`.
- **Název obsahuje J+M brand** (FEBI/TOPRAN/...) → strip regexem, `manufacturer = null`.
- **Duplicitní OEM** → merge dle `normalize_oem`, ponechat nejúplnější řádek.

### A3. J+M díly (jm_part_v2, ~3 673)
- Foto chybí → enrich z `api_cache.jm_part_detail` (klíč = oem+brand).
- Parametry chybí → znovu spustit `jm-tech-params-backfill-cron` (existuje).
- **Marže overrride** v `jm-proxy` final price calc:
  - `price_without_vat ≤ 4000` → +70 %
  - `price_without_vat > 4000` → +40 %
  - validace + audit log do `api_cache` typu `margin_audit`.

### A4. UI katalog (`src/pages/Catalog.tsx` + `CatalogListing.tsx`)
- Sort: ORIGINÁL s cenou → ORIGINÁL bez ceny ("Na dotaz") → NÁHRADA s marží.
- Strip J+M brandu v zobrazeném názvu OEM (klient-side safety net).
- Každá karta: image fallback `/placeholder.svg`; cena ≤ 0 → "Na dotaz" (amber badge).
- Detail dílu (`PartDetailDialog`): galerie (image + alternativy), tabulka tech. parametrů, OE čísla, popis, sekce alternativ (J+M).
- Lazy preload detailu na hover → cíl < 3s.

### A5. DB integrita
- Migrace: unikátní index `kitoem_parts(normalize_oem(oem))`, NOT NULL guard na `nextis_vehicles.external_id` (warning, nemažu).
- Doplnit `year_from/year_to/power_kw/fuel` z Nextis `vehicle?ktype=` (součást `jm-tree-rebuild-from-nextis`).
- Prewarm `api_cache.jm_parts_for_engine` pro všech 83 vozů přes existující `catalog-auto-maintenance`.

### A6. Finální report
Edge `catalog-audit-report` spočítá metriky před/po a uloží do `api_cache` typu `catalog_audit_report`. UI tlačítko v `/admin/catalog` „Spustit audit" + zobrazení reportu (tabulka metrik).

---

## BLOK B — Admin User 360

### B1. Seznam uživatelů `/admin/users`
- Tabulka: jméno, email, telefon, # objednávek, suma útraty (CZK), # vozidel, status, akce.
- Server-side stránkování (25/50/100), fulltext (jméno/email/telefon/IČO), filtry (status, account_type, role).
- Hromadné akce (už rozpracované) — ponechat.

### B2. Detail `/admin/users/:id` — záložky
1. **Profil** — osobní + firemní údaje, slevy, loyalty, role.
2. **Vozidla** — `user_vehicles` (VIN, SPZ, foto).
3. **Objednávky** — všechny `orders` (díly), proklik na detail.
4. **Servis** — `service_orders` + `service_bookings`.
5. **OBD** — poslední session, DTC.
6. **Notifikace** — `notifications` (sent/read).
7. **Historie** — viz B3.

### B3. Historie (kompletní timeline)
- View `user_activity_timeline` UNION:
  - registrace (profiles.created_at)
  - vozidla (user_vehicles)
  - objednávky (orders)
  - servis (service_orders, service_bookings)
  - OBD sessions
  - fault_reports
  - notifications
- Řazeno DESC, ikona + barva podle typu, každý řádek `Link` na detail.

### B4. Detail objednávky `/admin/orders/:id`
- Karta zákazníka (proklik na user 360), vozidlo (proklik), položky (název, OEM, množství, jedn. cena, sleva, DPH, mezisoučet), zdroj (`catalog_source` badge: SKLAD/J+M/CSV), stav + historie statusů, akce (změnit stav, dispatch J+M, stornovat, vytisknout fakturu).

### B5. Notifikace adminovi při nové objednávce
- Trigger `trg_notify_admins_new_order` + `trg_email_admins_new_order` **už existují** (viz db-functions). Ověřím, že jsou attached na `orders` AFTER INSERT; pokud ne, migrace doplní.
- Push notifikace přes existující `trg_send_push_on_notification` (řetězí se z `notifications` insertu) — funguje automaticky.

---

## Technické detaily

**Nové edge funkce:**
- `jm-tree-rebuild-from-nextis`
- `oem-enrichment-backfill`
- `catalog-audit-report`

**Nové DB objekty:**
- View `user_activity_timeline`
- Unikátní index na normalizovaném OEM
- Migrace pro attach triggers (idempotentní)

**Nové frontend soubory:**
- `src/pages/admin/AdminUsers.tsx` (refaktor existující)
- `src/pages/admin/AdminUserDetail.tsx` (refaktor `AdminUser360.tsx`)
- `src/pages/admin/AdminOrderDetail.tsx`
- `src/components/admin/UserTimeline.tsx`
- `src/components/catalog/PartDetailDialog.tsx` (rozšíření)

**Routing:**
- `/admin/users` (list), `/admin/users/:id` (detail), `/admin/orders/:id`

**Pořadí provedení:**
1. Migrace (index, view, trigger attach)
2. Edge funkce (deploy)
3. Backfilly (jednorázové spuštění)
4. Frontend (Admin Users 360 + Catalog UI)
5. Audit report endpoint + UI tlačítko
6. Verifikace buildem a kontrolní query na metriky

Po dokončení doručím tabulku metrik před/po a seznam zbylých warningů (např. vozy bez K-type, které Nextis nedohledá).
