# Plán: OBD refactor podle Delphi-OBD (read-only)

Cíl je přebudovat vnitřní architekturu OBD stacku podle vrstev z Delphi-OBD, ale zůstat v TS/React/Capacitor a nesahat na stávající BLE spojení, live polling ani UI kontrakty. Práce je rozsáhlá, proto ji rozdělím do jasných kroků a všechno pojede přes stávající `ble-manager.ts` + `elm327-engine.ts` (žádný druhý BLE engine).

## Rozsah — co se udělá

### 1) Vrstvy (nové soubory, žádné duplikace BLE)
```text
src/lib/obd/
  adapter/
    elm-queue.ts          # jediná centrální command queue nad elm327-engine
    elm-init.ts           # ATH1 debug profil + ATH0 simple profil
    elm-errors.ts         # NO DATA, CAN ERROR, BUFFER FULL, ? → typed status
  protocol/
    response-cleaner.ts   # echo, prompt >, ATH1/ATH0, SEARCHING…
    isotp-parser.ts       # SF/FF/CF + ELM "0:/1:/2:" multi-line
    uds-parser.ts         # 62 / 7F XX YY, response_pending 0x78
  services/
    service03.ts          # stored DTC
    service07.ts          # pending DTC
    service09.ts          # VIN
    service0a.ts          # permanent DTC
    dtc-decoder.ts        # 2B → P/C/B/U + kód (společné)
    full-dtc-scan.ts      # 03+07+0A dohromady s summary
  oem/
    OemRegistry.ts
    OemExtension.ts       # interface pro OEM profil
    stellantis.ts         # WMI, sessionPlan, basicDids, engineLiveDids
    stellantis-proxi.ts   # jen lokální buffer, computeChecksum() throws
  dtc/
    catalogs/
      iso-15031.ts
      stellantis.ts
```
`ble-manager.ts`, `elm327-engine.ts`, `isotp-transport.ts` (starý) zůstávají; nové vrstvy je používají skrz `elm-queue.ts`. Starý `isotp-transport.ts` bude označen jako legacy a postupně nahrazen novým `protocol/isotp-parser.ts` (aby jsme nerozbili existující volání, ponechá se re-export).

### 2) Command queue (jedna, centrální)
`elm-queue.ts` obalí `elm327.sendCommand`:
- FIFO, žádné paralelní writy
- per-command timeout + retry pro init
- stavy: `disconnected | connecting | initializing | ready | polling | busy | error`
- `pauseLivePolling()` / `resumeLivePolling()` volají do `useLiveData`/orchestrator přes malý event bus
- před DTC/OEM/raw scanem: pauza pollingu → clear buffer → init check → scan → resume
- admin raw příkazy jdou přes stejnou queue (žádný přímý BLE write)

### 3) ELM init profily
- **Debug (ATH1)**: `ATD ATE0 ATL1 ATS0 ATH1 ATSP0 0100` — pro DTC, VIN, UDS, OEM
- **Simple (ATH0)**: `ATD ATE0 ATL0 ATS0 ATH0 ATSP0 0100` — pro customer live polling
- Přepínání profilu je stavové v queue, po OEM/DTC scanu se vrátí předchozí

### 4) ELM chyby → typed status
`elm-errors.ts` mapuje řetězce (`NO DATA`, `CAN ERROR`, `BUS INIT`, `?`, `BUFFER FULL`, `STOPPED`, `SEARCHING…`, `UNABLE TO CONNECT`, timeout) na:
`no_data | unsupported | adapter_error | bus_error | timeout | invalid_response | error`.
Nikdy → 0/OK.

### 5) DTC 03/07/0A + full scan
Společný `dtc-decoder.ts` (2 bajty, P/C/B/U, dedupe, ignoruj 0000). Každá služba vrací strukturu `{ service, label, status, raw, cleaned, codes, warnings }`. `full-dtc-scan.ts` skládá summary + `isCompleteBasicObdScan`.

### 6) ISO-TP parser
Nový `isotp-parser.ts` podporuje SF (0x), FF (1x) + CF (2x), ELM multi-line `0:/1:/2:`, wrap sekvence 15→0, DTC služby přeskočí byte s počtem. Zachovává raw i cleaned payload.

### 7) UDS parser
`uds-parser.ts` čte pozitivní `62 XX YY` i negativní `7F SID NRC` (0x11/0x12/0x31/0x33/0x78). Jeden failed DID nezastaví scan.

### 8) Stellantis / FCA
`stellantis.ts`:
- WMI: 1C3/1C4/1C6/2C3/2C4/3C3/3C4/3C6/1D4/1D7/2D4/2D8/3D4/1J4/1J8/1RR/ZFA/ZFB/ZFC/9BD/ZAR/ZAM/VF3/VF7/W0L/VXR
- `getSessionPlan()` → `10 03` + volitelný probe `22 F1 98` (7F 22 31 = non-fatal)
- `getBasicDids()`: F190, F198, F199, F1A8, F187, F188, 1A02, 1B01, 1B02, 1B03
- `getEngineLiveDids()`: 1B04, 4005, 4007, 4009, 400B, 4019, 4026, 4048, 404A, 404B
- `decodeDid()` pro F190 (VIN ASCII), F199 (BCD YYMMDD), 1A02 (24-bit km), 1B01 (%), 1B02 (32-bit s), 1B03 (mV/1000 V), F187/F188/F1A8 (ASCII/HEX fallback). Engine DID bez ověřeného vzorce → raw + warning „dekódování neověřené".
- `scanStellantisBasicInfo()` + `scanStellantisEngineLive()` — sekvence: pauza polling → ATH1 → 0100 → 10 03 → volitelný F198 → čtení DID → resume.

### 9) Proxi / zápisy (zakázáno)
`stellantis-proxi.ts` obsahuje jen lokální buffer helpers; `computeChecksum()` throwuje `"Stellantis Proxi CRC algorithm is not available. Proxi writing is disabled."`. Žádné 2E/27/31 write/34/36/37/3D, žádné UI tlačítko pro zápis.

### 10) DTC katalogy
`iso-15031.ts` (obecné P0/P1…) + `stellantis.ts` (OEM specifické). P0403 a P001D naplněny přesně podle zadání (cz popis, příčiny, řešení). Parser dtc-decoder jen dekóduje kód, katalog přidá popis a příčiny.

### 11) Admin UI
Do stávající admin OBD sekce přidat panel „Stellantis / FCA / Chrysler OEM" s tlačítky přesně dle bodu 16 zadání. Každý výsledek: command / raw / cleaned / status / positive marker / payload / decoded / warnings.

### 12) Remote commands
Do stávajícího `admin_remote_commands` (nebo ekvivalentu) přidat typy z bodu 17. Handler v customer aplikaci je pouští přes `elm-queue.ts`.

### 13) Customer UI
Beze změny UX, jen doplnit hlášky:
- nekompletní OEM scan → „Rozšířená Stellantis/FCA diagnostika…"
- unsupported DID → „Tato jednotka tento údaj neposkytla."
- invalid raw → „Hodnota nebyla platně načtena."
Nikdy nefabrikovaná 0.

### 14) Testy
`src/test/obd/*.test.ts` (vitest) — sanity vektory ze zadání (P0403, ISO-TP VIN sestavení, `7F 22 31` non-fatal, `62 1B 03 30 39` = 12.345 V atd.).

### 15) Build gate
Na konci: `tsgo` typecheck + `vite build`. Až obojí projde, píše se report.

## Co se **nedotkne**
- `ble-manager.ts` (žádný druhý BLE engine)
- `elm327-engine.ts` (jen se obalí queue)
- stávající live polling API v `useLiveData`
- stávající VIN Mode 09 tok (nový service09 jen doplní strukturovaný výstup, starý zůstává)
- stávající DTC UI kontrakty (nový výstup je supersetem – přidává `raw/cleaned/status/warnings`)
- žádný Node SerialPort, žádný nový EventEmitter, žádné `NodeJS.Timeout`

## Report po dokončení
Přesně 15 bodů z bodu 23 zadání (přidané soubory, upravené soubory, queue, init, ISO-TP, UDS, DTC, Stellantis, DIDy, admin tlačítka, remote commands, potvrzení: 1 BLE engine, žádné zápisy, TS build ok, Vite build ok).

## Rizika
- Rozsah je velký; půjdu po vrstvách zdola nahoru (adapter → protocol → services → oem → UI) a po každé vrstvě spouštím typecheck, aby se regrese chytila brzy.
- Pokud narazím na kolizi se stávajícím `isotp-transport.ts` / `dtc-engine.ts`, nechám staré API funkční přes tenký adaptér a nové vrstvy pojedou paralelně – žádné rozbití existujících volajících.

Potvrď plán a začnu implementovat vrstvu po vrstvě; pak přijde jeden souhrnný report.