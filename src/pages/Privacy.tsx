import PageHeader from "@/components/PageHeader";

const Privacy = () => (
  <div className="min-h-screen pb-20">
    <PageHeader title="Zásady ochrany osobních údajů" />
    <div className="p-4 max-w-lg mx-auto prose prose-sm dark:prose-invert">
      <h2>Zásady ochrany osobních údajů — CHDP Garage</h2>
      <p className="text-xs text-muted-foreground">Poslední aktualizace: 15. 9. 2026</p>

      <h3>1. Správce údajů</h3>
      <p>
        CHRYSLER PARDUBICE CHDP s.r.o., IČO 27527612. Kontakt pro dotazy k ochraně údajů:
        prostřednictvím chatu v aplikaci nebo kontaktů uvedených na stránce Kontakty.
      </p>

      <h3>2. Jaké údaje zpracováváme</h3>
      <ul>
        <li>Registrační údaje: e‑mail, jméno, telefon, u firem název firmy, IČO a DIČ.</li>
        <li>Údaje o vozidlech: VIN, SPZ, značka, model, stav tachometru, servisní historie.</li>
        <li>Objednávky dílů, servisní rezervace, hlášení závad a žádosti o odtah.</li>
        <li>Diagnostická data z OBD adaptéru (chybové kódy, hodnoty senzorů) — jen když diagnostiku sami spustíte.</li>
        <li>Technické údaje potřebné pro doručení oznámení (identifikátor zařízení).</li>
      </ul>

      <h3>3. Proč údaje zpracováváme</h3>
      <p>
        Pro vyřízení objednávek a servisních zakázek, vedení servisní knihy vozidla, komunikaci
        se zákazníkem, zasílání oznámení o stavu objednávky či servisu a pro zajištění provozu
        a bezpečnosti aplikace. Údaje nepoužíváme k reklamnímu profilování a neprodáváme je.
      </p>

      <h3>4. Přihlášení přes Apple a Google</h3>
      <p>
        Při přihlášení přes Apple nebo Google získáme pouze identifikátor účtu a e‑mailovou adresu
        (u Apple i skrytou přeposílací adresu, pokud ji zvolíte). Heslo k těmto účtům se k nám nikdy nedostane.
      </p>

      <h3>5. Zpracovatelé</h3>
      <p>
        Používáme poskytovatele cloudové infrastruktury pro databázi, přihlašování a odesílání
        oznámení (Apple APNs, Google FCM) a službu pro odesílání e‑mailů. Údaje se zpracovávají
        v souladu s GDPR a nepředávají se dále nad rámec provozu aplikace.
      </p>

      <h3>6. Doba uchování</h3>
      <p>
        Údaje o objednávkách a servisních zakázkách uchováváme po dobu vyžadovanou právními
        předpisy (zejména účetními). Ostatní údaje uchováváme po dobu trvání účtu.
      </p>

      <h3>7. Vaše práva</h3>
      <p>
        Máte právo na přístup k údajům, opravu, výmaz, omezení zpracování, přenositelnost
        a právo podat stížnost u Úřadu pro ochranu osobních údajů.
      </p>

      <h3>8. Smazání účtu a údajů</h3>
      <p>
        Účet i všechna související data můžete smazat sami a okamžitě v aplikaci:
        <strong> Účet → Nastavení účtu → Smazat účet</strong>. Smazání je nevratné a neprobíhá
        přes žádné schvalování. Zákonem vyžadované účetní doklady zůstávají uchovány v anonymizované podobě.
      </p>

      <h3>9. Oprávnění zařízení</h3>
      <p>
        Fotoaparát používáme pro skenování VIN a SPZ, Bluetooth pro spojení s OBD adaptérem,
        polohu pro servisní služby a odtah, oznámení pro informace o stavu objednávek a servisu.
        Každé oprávnění si vyžádáme až ve chvíli, kdy danou funkci použijete, a aplikaci lze
        používat i bez jejich povolení.
      </p>
    </div>
  </div>
);

export default Privacy;
