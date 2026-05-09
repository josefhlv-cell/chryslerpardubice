## Záloha
✅ Hotovo: `daily/backup-2026-05-09_20-17-39.json` (36 tabulek, 21 846 řádků, 12 MB).

## Co postavím v jednom velkém PR

### A) Redesign Adminu — sidebar navigace se stromem
Nahradí současné horizontální taby. Levý sloupec (na mobilu sbalitelný drawer), strom v hloubkách:

```text
Admin
├─ 📊 Přehled (dashboard, daily report, KPI)
├─ 📦 Katalog
│   ├─ Přehled
│   ├─ Import (CSV / AI / EPC)
│   ├─ Opravy & Diagnostika
│   │   ├─ Foto enrichment
│   │   ├─ Data fixer
│   │   ├─ Quality export
│   │   └─ Command center
│   ├─ Ceny
│   │   ├─ Statistiky
│   │   ├─ Bulk sync (běhy)
│   │   ├─ Spustit sync
│   │   └─ Manuální správa
│   ├─ EPC nákresy
│   └─ Nastavení
├─ 🛠️ Servis
│   ├─ Rezervace
│   ├─ Zakázky
│   ├─ Plánovač (mechanik × zvedák)
│   ├─ Šablony úkonů
│   └─ TSB databáze (NOVÉ)
├─ 🚗 Vozy
│   ├─ Nabídka
│   ├─ Výkup / Dovoz
│   └─ Hlášení závad
├─ 👥 Zákazníci & Role
│   ├─ Profily
│   ├─ Zaměstnanci
│   └─ Schvalování firem
├─ 🔬 Diagnostika (NOVÉ)
│   ├─ Vzdálené OBD live
│   ├─ DTC knihovna (CZ)
│   └─ Diag protokoly (PDF)
├─ 📱 Mobil & Nástroje (NOVÉ)
│   ├─ VIN/QR scanner
│   ├─ Push & notifikace
│   └─ Offline cache (mechanik)
└─ ⚙️ Systém
    ├─ Feature flags
    ├─ Zálohy
    ├─ Audit log
    └─ Cron / Sync stav
```

Implementace: nový `src/components/admin/AdminLayout.tsx` se Shadcn `Sidebar`, perzistence rozbalení v `localStorage`, aktivní cesta z URL hash (`/admin#diagnostics/dtc`).

### B) Funkce — 8 nových modulů

**1. Vzdálená diagnostika (live OBD)**
- Migrace: `obd_live_sessions` (user_id, vehicle_id, started_at, ended_at, last_seen, payload jsonb), `obd_live_consents` (user_id, granted, granted_at, revoked_at).
- Profil: nový switch „Povolit servisu vzdálenou diagnostiku".
- Realtime: zákazník při běžící OBD relaci publikuje PIDs do Supabase channel `obd:{user_id}`. Admin v `AdminRemoteDiag` poslouchá.
- RLS: zápis jen `auth.uid() = user_id`, čtení admin + vlastník. Bez consentu admin SELECT zablokovaný (kontrola v policy přes `obd_live_consents.granted = true`).

**2. DTC knihovna (CZ)**
- Migrace: `dtc_codes` (code, system, severity, title_cs, description_cs, causes_cs, solution_cs, affected_models text[], source).
- Seed: ~150 nejčastějších Chrysler/Dodge/RAM kódů (P0xxx, U0xxx, B0xxx) přes seed SQL.
- UI admin: CRUD tabulka + import CSV. Public read pro `/garage` a AI Mechanika (Tonda už dnes řeší DTC — propojím).

**3. Diagnostické protokoly PDF**
- Edge function `diag-protocol-pdf`: bere `service_order_id` nebo `obd_session_id`, generuje PDF (jspdf v edge) s hlavičkou CHDP, VIN, DTCs, doporučení, podpis mechanika.
- Uloží do `service-order-photos` bucketu, vrací signed URL.
- Tlačítko v detailu zakázky a v OBD historii.

**4. TSB databáze podle VIN**
- Migrace: `tsbs` (tsb_number, title_cs, summary_cs, vin_pattern text, model, year_from, year_to, system, full_text, source_url, published_at).
- Edge `tsb-search` přijímá VIN → dekóduje (existující NHTSA cache) → matchuje pattern/model/rok.
- Admin UI: tabulka + import (CSV / Firecrawl scrape z workshop-manuals.com — funkce už existuje).
- Public route `/garage/tsb?vin=...`.

**5. Admin mobile view**
- `AdminLayout` má responsive break: <768px → bottom-sheet menu + zjednodušené karty.
- Nová stránka `/admin/mobile` s rychlým schvalováním objednávek/zakázek (swipe-akce přes `react-swipeable`), velká tlačítka, telefon-friendly.

**6. VIN/QR scanner v admin appce**
- Komponenta `AdminVinScanner` využívá `@capacitor/camera` + `@capacitor-mlkit/barcode-scanning` (přidat plugin) a fallback na webový `BarcodeDetector` API.
- Po sejmutí VIN automaticky otevře detail vozu nebo formulář nové zakázky.

**7. Push notifikace pro admina (web + native)**
- Web Push: rozšířit existující `PushNotificationToggle` → nová tabulka `admin_push_subscriptions`.
- Capacitor FCM: přidat `@capacitor/push-notifications`, registrace tokenů do `admin_fcm_tokens`.
- Edge `notify-admin` (existuje) doplnit o broadcast přes obě brány — trigger na nové order/zakázku/fault_report.
- *Pozn.*: FCM vyžaduje Firebase projekt + `google-services.json`. Po nasazení požádám tě o nahrání souboru.

**8. Offline režim pro mechaniky**
- Service Worker (vite-plugin-pwa už máme) – přidat strategii `CacheFirst` pro `/mechanic-dashboard` data.
- IndexedDB store (přes `idb`) pro: přiřazené zakázky, fotky, čas-tracking. Sync queue se odešle při online.
- Indikátor stavu „🟢 Online / 🔴 Offline – 3 změny ve frontě".

### C) Bezpečnost & ostatní
- RLS policy review pro všechny nové tabulky (`has_role admin` + vlastník).
- Audit log už existuje? Pokud ne, vytvořím `admin_audit_log` jako bonus do Systém větve.
- Memory update: nové větve, OBD consent rule, DTC zdroj.

## Co NEBUDU dělat (mimo scope tohoto PR)
- Skutečné FCM klíče (potřebuju od tebe Firebase setup → vyžádám si po nasazení).
- Plnění DTC knihovny stovkami kódů ručně — udělám seed základních + admin UI pro doplňování.
- Plnění TSB obsahu — připravím schéma + scrape, ty doplníš obsah.

## Pořadí prací v PR
1. Migrace DB (8 nových tabulek + RLS)
2. Sidebar layout + přesun všech stávajících tabů
3. Edge funkce (diag-protocol-pdf, tsb-search)
4. UI moduly diagnostiky (Live, DTC, PDF, TSB)
5. Mobile view + VIN scanner
6. Push (web kompletní, FCM scaffold)
7. Offline PWA pro mechaniky
8. QA + memory update

Po schválení rovnou pojedu — bude to 30-50 souborů, ale po dokončení dostaneš přehledný admin a všechny požadované funkce v jednom dni.
