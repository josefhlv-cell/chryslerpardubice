# Cíl

1. Každá položka v seznamech (kde to dává smysl) → klikatelný detail.
2. Každý detail → tlačítko "Zpět" (nativní historie routeru).
3. Vyřízené položky (poptávky, objednávky, servisy, tow, buyback, import…) lze **archivovat** (soft-delete) — zmizí z hlavních seznamů.
4. Archiv je dostupný v adminu pod novou záložkou **"Vyřízené"** s možností obnovit / trvale smazat.
5. Všechny admin seznamy jsou **collapsible sekce, defaultně zabalené**.

# Rozsah — dotčené entity

| Entita | Tabulka | Detail route | Archivace když |
|---|---|---|---|
| Objednávky dílů | `orders` | `/admin/orders/:id` (existuje?) | `status IN ('completed','cancelled','delivered')` |
| Servisní zakázky | `service_orders` | `/admin/service-orders/:id` | `status = 'completed'` |
| Servisní rezervace | `service_bookings` | detail modal → route | `status IN ('completed','cancelled')` |
| Odtahy | `tow_requests` | `/admin/tow/:id` | `status IN ('completed','cancelled')` |
| Výkup vozu | `vehicle_buyback_requests` | `/admin/buyback/:id` | `status IN ('completed','rejected')` |
| Import vozu | `vehicle_import_requests` | `/admin/import/:id` | dtto |
| Poptávky použ. dílů | `used_part_requests` | `/admin/used-parts/:id` | dtto |
| Poptávky nových dílů | `new_part_orders` | detto | dtto |
| Poptávky vozů | `vehicle_inquiries` | detto | dtto |
| Chybová hlášení | `fault_reports` | detto | `status = 'resolved'` |
| Podpora chat | `support_conversations` | detto | `status = 'closed'` |

# Přístup (technika)

## Univerzální soft-delete
- Přidat sloupec `archived_at TIMESTAMPTZ NULL` do všech tabulek výše (jedna migrace, idempotentní `ADD COLUMN IF NOT EXISTS`).
- Žádné mazání dat — jen filtr. Trvalé smazání je `DELETE` z archiv záložky pod admin rolí.
- Všechny existující admin queries dostanou `.is('archived_at', null)`.
- Archiv view: `.not('archived_at', 'is', null).order('archived_at', desc)`.
- RLS: existující policies zůstanou, jen doplnit pro admin `UPDATE archived_at` (přes has_role admin) a `DELETE`.

## UI komponenty (nové, sdílené)
- `<CollapsibleAdminSection title count defaultOpen={false}>` — wrapper nad shadcn `Collapsible`, ukládá stav do `localStorage` per klíč, ale při spuštění vždy `false` (per zadání "vždy při spuštění zabalené").
- `<BackButton>` — `useNavigate(-1)`, fallback na `/`. Použít v hlavičce každé detail routy + do `PageHeader` přidat prop `showBack`.
- `<ArchiveButton row table>` — dropdown akce "Archivovat" v každém řádku seznamu (jen pro admina, jen když je položka ve vyřízeném stavu).
- `<RowActionsMenu>` — sjednocené kebab menu (Detail, Archivovat, Trvale smazat u archivu).

## Nová admin záložka "Vyřízené"
- Route: `/admin/archive`
- Soubor: `src/pages/admin/AdminArchive.tsx` + `src/components/admin/archive/*Section.tsx` pro každou entitu.
- Každá entita = jedna `CollapsibleAdminSection` s tabulkou archivovaných záznamů, akce: **Obnovit** (`archived_at = null`), **Smazat trvale** (`DELETE`, potvrzovací dialog).
- Přidat do `Admin.tsx` navigace jako nová top-level tab vedle stávajících.

## Detail routes
- Pro entity, které detail nemají, vygenerovat jednoduchý read-only detail (`AdminEntityDetail`) s hlavičkou + `BackButton` + karty s poli + související záznamy (např. u `service_orders` i historie zpráv, fotky, díly).
- Pro řádky v seznamech přidat `onClick` → `navigate('/admin/{entity}/{id}')` nebo obalit `<Link>`.

## Zákaznická strana (mimo admin)
- Detail routy už mají většinou zákaznická data (MyOrders, MyServiceOrders, MyTowRequests). Doplnit `BackButton` a klikatelnost karet, kde chybí.
- Zákazník **nemaže** — archivace je jen admin funkce.

# Kroky implementace

1. **Migrace** — `archived_at` na 11 tabulek + admin UPDATE/DELETE policies (přes `has_role(auth.uid(), 'admin')`).
2. **Sdílené komponenty** — `CollapsibleAdminSection`, `BackButton`, `RowActionsMenu`, `ArchiveButton`, hook `useArchive(table)`.
3. **PageHeader** — přidat `showBack` prop, defaultně true na všech detail stránkách.
4. **Refaktor stávajících admin seznamů** — obalit do `CollapsibleAdminSection`, přidat filtr `archived_at IS NULL`, přidat řádkové akce.
5. **Detail routy** — přidat chybějící (`AdminEntityDetail` generic + specifické karty).
6. **AdminArchive** — nová záložka + sekce per entita + obnovit/smazat akce.
7. **Zákaznická UI** — projít MyOrders, MyServiceOrders, MyTowRequests, VehicleDetail, VehicleOffer, Notifications: přidat BackButton do detailů a klikatelnost karet.
8. **Test** — `tsgo` + `vite build`, ruční projití 4 hlavních cest (objednávka → detail → zpět; admin archivace; admin archiv obnovit; collapse persist).

# Otázky před stavbou (bez blokování)

Beru výchozí předpoklady, pokud nezakážeš:
- Archivace je **soft-delete** (data zachována), trvalé smazání jen z archivu adminem.
- Vyřízené se **neskryjí automaticky**, admin musí kliknout "Archivovat" (jinak by zmizely servisy hned po dokončení, což bys viděl jako bug). Alternativa: auto-archivace po X dnech od `completed` — mohu doplnit později.
- Collapsible = **vždy zabalené při načtení stránky** (bez persist), tak jak jsi napsal.
- Zákazník nevidí archiv (jen admin).

# Odhad velikosti změn

~1 migrace, ~5 nových sdílených komponent, ~10 nových detail rout, ~1 nová admin stránka (+11 sekcí), refaktor ~15 existujících admin listů, ~5 zákaznických obrazovek. Celkem cca 40–50 souborů.
