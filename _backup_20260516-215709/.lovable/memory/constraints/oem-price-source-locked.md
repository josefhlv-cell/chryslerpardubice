---
name: OEM Price Source Locked
description: vernostsevyplaci.cz is the ONLY source for OEM prices. Never use J+M, AI, Mopar PDFs, or any other source for OEM pricing. Parts without price stay "Na dotaz".
type: constraint
---
## Pravidlo
**Jediný povolený zdroj cen pro OEM díly** = vernostsevyplaci.cz (přes `price-sync` edge function s K-prefixem).

## Co je ZAKÁZÁNO
- ❌ Brát ceny OEM z J+M / Nextis (J+M je výhradně aftermarket katalog/strom, ne OEM ceník)
- ❌ AI generování cen (viz constraint `pricing-integrity`)
- ❌ Manuální import OEM ceníku z PDF/XML jiných dovozců
- ❌ Crossref ceny z aftermarket dílů aplikované na OEM

## Chování pro nedostupné ceny
Pokud vernostsevyplaci.cz OEM nezná (vyzkoušeno všech 5 variant: K{padded}, K{cleanPN}, 6{cleanPN}, SP{cleanPN}, holé) → `price_with_vat = 0`, `last_price_update = now()` (aby se neopakovalo).

Frontend musí zobrazit **„Na dotaz"** s amber badgem (`status: on_order`) — viz Core memory.

## Důvod
Rozhodnutí majitele 2026-05-15: cenotvorba musí být 1:1 s autorizovaným dealerským ceníkem (vernostsevyplaci.cz). Cizí zdroje by způsobily nekonzistenci s Mopar dovozcem a problémy při reklamaci.

## Bulk sync historie
- 2026-05-15 00:23 UTC: bulk-price-sync vyčerpal celý katalog. 1 967 / 13 601 OEM má cenu (14 %). Zbytek `tried_not_found` = vernostsevyplaci.cz tyto díly fyzicky nemá.
- Další bulk-price-sync běhy nemají smysl, dokud nepřibudou NOVÉ OEM (cron `price-sync-auto` to řeší automaticky).
