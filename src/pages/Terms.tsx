import PageHeader from "@/components/PageHeader";

const Terms = () => (
  <div className="min-h-screen pb-20">
    <PageHeader title="Obchodní podmínky" />
    <div className="p-4 max-w-lg mx-auto prose prose-sm dark:prose-invert">
      <h2>Obchodní podmínky pro prodej náhradních dílů</h2>
      <p className="text-xs text-muted-foreground">Platné od 1. 1. 2025</p>

      <h3>1. Úvodní ustanovení</h3>
      <p>Tyto obchodní podmínky upravují práva a povinnosti smluvních stran při prodeji náhradních dílů prostřednictvím aplikace Chrysler Pardubice (dále jen „prodávající").</p>

      <h3>2. Objednávka a uzavření smlouvy</h3>
      <p>Objednávka zákazníka je návrhem kupní smlouvy. Kupní smlouva je uzavřena potvrzením objednávky prodávajícím. Prodávající si vyhrazuje právo objednávku odmítnout.</p>
      <p>U nových originálních dílů Mopar je cena stanovena dle platného ceníku. U použitých dílů je cena stanovena individuálně po posouzení dostupnosti a stavu dílu.</p>

      <h3>3. Ceny a platební podmínky</h3>
      <p>Všechny ceny jsou uvedeny v CZK. Ceny nových dílů jsou uvedeny bez DPH i s DPH (21 %). Platba je možná při převzetí (hotovost, karta) nebo převodem na účet po potvrzení objednávky.</p>
      <p>Firemní zákazníci se schváleným účtem mohou mít individuální slevu, která se automaticky aplikuje na objednávky.</p>

      <h3>4. Dodací podmínky</h3>
      <p>Díly skladem jsou připraveny k vyzvednutí do 1–2 pracovních dnů. Díly na objednávku mají dodací lhůtu 3–14 pracovních dnů dle dostupnosti u dodavatele. O připravení objednávky k vyzvednutí bude zákazník informován notifikací v aplikaci.</p>

      <h3>5. Záruka a reklamace</h3>
      <p>Na nové originální díly Mopar poskytujeme záruku 24 měsíců od data prodeje. Na použité díly poskytujeme záruku 6 měsíců, pokud není uvedeno jinak.</p>
      <p>Reklamaci je nutné uplatnit bez zbytečného odkladu po zjištění vady, a to osobně v provozovně nebo prostřednictvím aplikace. K reklamaci je nutné doložit doklad o koupi.</p>

      <h3>6. Odstoupení od smlouvy</h3>
      <p>Zákazník má právo odstoupit od smlouvy do 14 dnů od převzetí zboží bez udání důvodu (dle §1829 NOZ). Díl musí být vrácen nepoužitý, nepoškozený a v původním obalu. Náklady na vrácení nese zákazník.</p>
      <p>Právo na odstoupení se nevztahuje na díly upravené na míru nebo díly, které byly namontovány.</p>

      <h3>7. Odpovědnost</h3>
      <p>Prodávající nenese odpovědnost za škody způsobené neodbornou montáží dílu. Doporučujeme montáž dílů v autorizovaném servisu.</p>

      <h3>8. Ochrana osobních údajů</h3>
      <p>Osobní údaje zákazníků jsou zpracovávány v souladu s GDPR. Údaje jsou využívány výhradně pro účely realizace objednávek, komunikace se zákazníkem a vedení servisní historie.</p>

      <h3>9. Závěrečná ustanovení</h3>
      <p>Tyto obchodní podmínky jsou platné a účinné od 1. 1. 2025. Prodávající si vyhrazuje právo na jejich změnu. Aktuální znění je vždy dostupné v aplikaci.</p>
      <p>Vztahy neupravené těmito podmínkami se řídí příslušnými ustanoveními občanského zákoníku (zákon č. 89/2012 Sb.).</p>

      <div className="mt-8 p-4 rounded-lg bg-muted/50 text-xs text-muted-foreground">
        <p className="font-semibold">Chrysler &amp; Dodge Pardubice</p>
        <p>Provozovatel: CHRYSLER PARDUBICE CHDP s.r.o., IČO: 27527638</p>
        <p>Sídlo: Lukovna 11, 533 04 Sezemice</p>
        <p>Kontakt: obchod@chrysler.cz · +420 603 372 911</p>
      </div>
    </div>
  </div>
);

export default Terms;
