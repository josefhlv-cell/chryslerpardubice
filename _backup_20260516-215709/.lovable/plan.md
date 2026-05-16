## Problém

Z konzole a network logů vidím dvě chyby, které mají **stejnou kořenovou příčinu**:

1. **Skladové vozy "Načítám vozy…" donekonečna** — všechny GETy na `vehicles_public` vrací `403 / 42501`:
   ```
   "permission denied for function has_role"
   ```
2. **Chybí preklik do Admin panelu** — `useAuth().isAdmin` zůstává `false`, protože dotaz na `user_roles` selhává ze stejného důvodu (RLS policy „Admins can manage roles" volá `has_role()`).

## Kořenová příčina

Funkce `public.has_role(uuid, app_role)` má v aktuálním DB stavu pouze tyto execute granty:
```
postgres=X/postgres
service_role=X/postgres
sandbox_exec_*=X/postgres
```

**Chybí grant pro `authenticated` a `anon`.** Jakmile RLS policy zavolá `has_role(auth.uid(), 'admin')`, Postgres odmítne s `42501`. Tím padají VŠECHNY tabulky/views, jejichž policy ji volají (vehicles, user_roles, parts atd.).

Pravděpodobně byl grant odstraněn při některé pozdější migraci (bezpečnostním tweaku) — funkce je `SECURITY DEFINER`, takže potřebuje pouze EXECUTE pro role volající z PostgREST.

## Plán opravy

Jediná migrace, žádný frontend zásah:

```sql
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)
  TO authenticated, anon;
```

## Verifikace po nasazení

1. `vehicles_public` GET vrátí 200 → načtení skladových vozů.
2. `user_roles` SELECT vrátí roli `admin` pro `josefhlv@gmail.com` → v Účtu se objeví položka **Admin panel**.
3. Smoke-check ostatních admin RLS policies (parts, orders) — měly přestat hlásit 403.

## Co NEMĚNÍM

- Žádný kód v `AuthContext`, `Account.tsx` ani v RLS policy — logika je správná, pouze chybí execute grant.
- Žádné změny v cenotvorbě / katalogu (mimo scope).
