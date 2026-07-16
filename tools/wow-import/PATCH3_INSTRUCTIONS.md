# WOW → Delphi Patch V3

Tento patch navazuje na V2. **Nepředstírá, že nalezené hex sekvence jsou funkční příkazy.** Přidává vrstvu pro dohledání, zobrazení, ruční ověření a bezpečné povolení skutečných servisních definic.

## Zkopírovat do repozitáře
Zachovej relativní cesty všech souborů.

## Napojení do Delphi UI
- lazy načti `service-definition-candidates.json` pouze v sekci Delphi/WOW;
- přidej kartu „Kandidátní servisní definice“ dostupnou pouze administrátorovi;
- zobraz zdroj, offset, kandidátní request, kontext a confidence;
- tlačítko Spustit musí vždy používat `evaluateWowExecution()`;
- žádný z dodaných kandidátů není `verified`, takže se nesmí odeslat.

## Jak se funkce skutečně povolí
Teprve po testu na konkrétním vozidle vytvoř ručně `VerifiedWowServiceDefinition`: ECU, protokol, TX/RX, request, kladná odpověď, timeout, podmínky a podporovaný adaptér.
