// Generic OBD-II P-code database (P0100–P0599) with Czech descriptions.
// Used as fallback when Chrysler-specific database doesn't contain the code.

export type GenericSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface GenericDTCEntry {
  desc: string;      // Czech description
  descEn: string;    // English standard SAE description
  severity: GenericSeverity;
  cause: string;
}

export const GENERIC_DTC_DB: Record<string, GenericDTCEntry> = {
  // P01xx — Fuel & Air Metering
  P0100: { desc: 'Porucha obvodu snímače hmotnosti/objemu vzduchu (MAF)', descEn: 'Mass or Volume Air Flow Circuit Malfunction', severity: 'medium', cause: 'Vadný MAF snímač, nasávání falešného vzduchu, špatná kabeláž.' },
  P0101: { desc: 'MAF snímač — signál mimo rozsah / výkon', descEn: 'Mass or Volume Air Flow Circuit Range/Performance', severity: 'medium', cause: 'Znečištěný MAF, netěsnost sání, únik vakua.' },
  P0102: { desc: 'MAF snímač — nízký signál', descEn: 'Mass or Volume Air Flow Circuit Low Input', severity: 'medium', cause: 'Přerušený obvod nebo vadný MAF.' },
  P0103: { desc: 'MAF snímač — vysoký signál', descEn: 'Mass or Volume Air Flow Circuit High Input', severity: 'medium', cause: 'Zkrat na napájení, vadný MAF.' },
  P0104: { desc: 'Přerušovaný signál obvodu MAF snímače', descEn: 'Mass or Volume Air Flow Circuit Intermittent', severity: 'medium', cause: 'Uvolněný konektor, poškozená kabeláž MAF.' },
  P0105: { desc: 'MAP snímač — porucha obvodu', descEn: 'Manifold Absolute Pressure/Barometric Pressure Circuit Malfunction', severity: 'medium', cause: 'Vadný MAP snímač, hadičky, kabeláž.' },
  P0106: { desc: 'MAP snímač — signál mimo rozsah', descEn: 'MAP/BARO Circuit Range/Performance Problem', severity: 'medium', cause: 'Netěsnost vakua, mechanická závada motoru.' },
  P0107: { desc: 'MAP snímač — nízký signál', descEn: 'MAP/BARO Circuit Low Input', severity: 'medium', cause: 'Odpojený konektor MAP.' },
  P0108: { desc: 'MAP snímač — vysoký signál', descEn: 'MAP/BARO Circuit High Input', severity: 'medium', cause: 'Zkrat na napájení.' },
  P0109: { desc: 'MAP snímač — přerušovaný signál', descEn: 'MAP/BARO Circuit Intermittent', severity: 'low', cause: 'Špatný kontakt, poškozený kabel.' },
  P0110: { desc: 'IAT snímač (teplota nasávaného vzduchu) — porucha obvodu', descEn: 'Intake Air Temperature Circuit Malfunction', severity: 'low', cause: 'Vadný IAT snímač.' },
  P0111: { desc: 'IAT — signál mimo rozsah', descEn: 'IAT Circuit Range/Performance', severity: 'low', cause: 'Znečištěný nebo vadný IAT.' },
  P0112: { desc: 'IAT — nízký signál', descEn: 'IAT Circuit Low Input', severity: 'low', cause: 'Zkrat na kostru.' },
  P0113: { desc: 'IAT — vysoký signál', descEn: 'IAT Circuit High Input', severity: 'low', cause: 'Přerušení obvodu.' },
  P0114: { desc: 'IAT — přerušovaný signál', descEn: 'IAT Circuit Intermittent', severity: 'low', cause: 'Špatný kontakt.' },
  P0115: { desc: 'ECT snímač (teplota chladicí kapaliny) — porucha obvodu', descEn: 'Engine Coolant Temperature Circuit Malfunction', severity: 'medium', cause: 'Vadný ECT snímač.' },
  P0116: { desc: 'ECT — signál mimo rozsah', descEn: 'ECT Circuit Range/Performance', severity: 'medium', cause: 'Zaseklý termostat.' },
  P0117: { desc: 'ECT — nízký signál', descEn: 'ECT Circuit Low Input', severity: 'medium', cause: 'Zkrat na kostru.' },
  P0118: { desc: 'ECT — vysoký signál', descEn: 'ECT Circuit High Input', severity: 'medium', cause: 'Přerušení obvodu.' },
  P0119: { desc: 'ECT — přerušovaný signál', descEn: 'ECT Circuit Intermittent', severity: 'medium', cause: 'Uvolněný konektor.' },
  P0120: { desc: 'TPS (poloha škrticí klapky) — porucha obvodu', descEn: 'Throttle Position Sensor Circuit Malfunction', severity: 'high', cause: 'Vadný TPS, opotřebení dráhy.' },
  P0121: { desc: 'TPS — signál mimo rozsah', descEn: 'TPS Circuit Range/Performance', severity: 'high', cause: 'Opotřebený TPS.' },
  P0122: { desc: 'TPS — nízký signál', descEn: 'TPS Circuit Low Input', severity: 'high', cause: 'Zkrat.' },
  P0123: { desc: 'TPS — vysoký signál', descEn: 'TPS Circuit High Input', severity: 'high', cause: 'Vadný TPS.' },
  P0124: { desc: 'TPS — přerušovaný signál', descEn: 'TPS Circuit Intermittent', severity: 'high', cause: 'Poškozená kabeláž.' },
  P0125: { desc: 'Nedostatečná teplota chlazení pro uzavřenou smyčku', descEn: 'Insufficient Coolant Temp for Closed Loop', severity: 'medium', cause: 'Zaseklý termostat, vadný ECT.' },
  P0126: { desc: 'Nedostatečná teplota chladiva pro stabilní provoz', descEn: 'Insufficient Coolant Temp for Stable Operation', severity: 'medium', cause: 'Zaseklý termostat.' },
  P0128: { desc: 'Teplota chladicí kapaliny pod regulační teplotou termostatu', descEn: 'Coolant Thermostat Below Regulating Temperature', severity: 'medium', cause: 'Vadný termostat.' },
  P0130: { desc: 'Lambda sonda 1/1 — porucha obvodu', descEn: 'O2 Sensor Circuit (Bank 1 Sensor 1)', severity: 'medium', cause: 'Vadná lambda sonda před katalyzátorem.' },
  P0131: { desc: 'Lambda sonda 1/1 — nízké napětí', descEn: 'O2 Sensor Low Voltage (Bank 1 Sensor 1)', severity: 'medium', cause: 'Falešný vzduch, chudá směs.' },
  P0132: { desc: 'Lambda sonda 1/1 — vysoké napětí', descEn: 'O2 Sensor High Voltage (Bank 1 Sensor 1)', severity: 'medium', cause: 'Bohatá směs, netěsný vstřikovač.' },
  P0133: { desc: 'Lambda sonda 1/1 — pomalá odezva', descEn: 'O2 Sensor Slow Response (Bank 1 Sensor 1)', severity: 'medium', cause: 'Opotřebená sonda.' },
  P0134: { desc: 'Lambda sonda 1/1 — bez aktivity', descEn: 'O2 Sensor No Activity (Bank 1 Sensor 1)', severity: 'medium', cause: 'Vadné vyhřívání, přerušený obvod.' },
  P0135: { desc: 'Vyhřívání lambda sondy 1/1 — porucha', descEn: 'O2 Sensor Heater Circuit (Bank 1 Sensor 1)', severity: 'medium', cause: 'Přerušené vyhřívání sondy.' },
  P0136: { desc: 'Lambda sonda 1/2 (za kat.) — porucha obvodu', descEn: 'O2 Sensor Circuit (Bank 1 Sensor 2)', severity: 'medium', cause: 'Vadná sonda za katalyzátorem.' },
  P0137: { desc: 'Lambda sonda 1/2 — nízké napětí', descEn: 'O2 Sensor Low Voltage (Bank 1 Sensor 2)', severity: 'medium', cause: 'Únik ve výfuku.' },
  P0138: { desc: 'Lambda sonda 1/2 — vysoké napětí', descEn: 'O2 Sensor High Voltage (Bank 1 Sensor 2)', severity: 'medium', cause: 'Poškozený katalyzátor.' },
  P0139: { desc: 'Lambda sonda 1/2 — pomalá odezva', descEn: 'O2 Sensor Slow Response (Bank 1 Sensor 2)', severity: 'medium', cause: 'Opotřebená sonda.' },
  P0140: { desc: 'Lambda sonda 1/2 — bez aktivity', descEn: 'O2 Sensor No Activity (Bank 1 Sensor 2)', severity: 'medium', cause: 'Vadné vyhřívání sondy.' },
  P0141: { desc: 'Vyhřívání lambda sondy 1/2 — porucha', descEn: 'O2 Sensor Heater Circuit (Bank 1 Sensor 2)', severity: 'medium', cause: 'Přerušené vyhřívání sondy.' },
  P0150: { desc: 'Lambda sonda 2/1 — porucha obvodu', descEn: 'O2 Sensor Circuit (Bank 2 Sensor 1)', severity: 'medium', cause: 'Vadná sonda banky 2.' },
  P0151: { desc: 'Lambda sonda 2/1 — nízké napětí', descEn: 'O2 Sensor Low Voltage (Bank 2 Sensor 1)', severity: 'medium', cause: 'Chudá směs banky 2.' },
  P0152: { desc: 'Lambda sonda 2/1 — vysoké napětí', descEn: 'O2 Sensor High Voltage (Bank 2 Sensor 1)', severity: 'medium', cause: 'Bohatá směs banky 2.' },
  P0153: { desc: 'Lambda sonda 2/1 — pomalá odezva', descEn: 'O2 Sensor Slow Response (Bank 2 Sensor 1)', severity: 'medium', cause: 'Opotřebená sonda.' },
  P0154: { desc: 'Lambda sonda 2/1 — bez aktivity', descEn: 'O2 Sensor No Activity (Bank 2 Sensor 1)', severity: 'medium', cause: 'Vadné vyhřívání.' },
  P0155: { desc: 'Vyhřívání lambda sondy 2/1 — porucha', descEn: 'O2 Sensor Heater Circuit (Bank 2 Sensor 1)', severity: 'medium', cause: 'Přerušené vyhřívání.' },
  P0170: { desc: 'Palivová korekce banky 1 mimo rozsah', descEn: 'Fuel Trim Malfunction (Bank 1)', severity: 'high', cause: 'Netěsnost sání, vadné vstřikovače, MAF.' },
  P0171: { desc: 'Chudá směs — banka 1', descEn: 'System Too Lean (Bank 1)', severity: 'high', cause: 'Falešný vzduch, ucpaný filtr, slabá pumpa.' },
  P0172: { desc: 'Bohatá směs — banka 1', descEn: 'System Too Rich (Bank 1)', severity: 'high', cause: 'Netěsný vstřikovač, vysoký tlak paliva.' },
  P0173: { desc: 'Palivová korekce banky 2 mimo rozsah', descEn: 'Fuel Trim Malfunction (Bank 2)', severity: 'high', cause: 'Netěsnost sání, vadné vstřikovače.' },
  P0174: { desc: 'Chudá směs — banka 2', descEn: 'System Too Lean (Bank 2)', severity: 'high', cause: 'Falešný vzduch banky 2.' },
  P0175: { desc: 'Bohatá směs — banka 2', descEn: 'System Too Rich (Bank 2)', severity: 'high', cause: 'Netěsný vstřikovač banky 2.' },

  // P02xx — Injector Circuit
  P0201: { desc: 'Porucha obvodu vstřikovače — válec 1', descEn: 'Injector Circuit Malfunction Cylinder 1', severity: 'high', cause: 'Vadný vstřikovač nebo jeho kabeláž.' },
  P0202: { desc: 'Porucha obvodu vstřikovače — válec 2', descEn: 'Injector Circuit Malfunction Cylinder 2', severity: 'high', cause: 'Vadný vstřikovač 2.' },
  P0203: { desc: 'Porucha obvodu vstřikovače — válec 3', descEn: 'Injector Circuit Malfunction Cylinder 3', severity: 'high', cause: 'Vadný vstřikovač 3.' },
  P0204: { desc: 'Porucha obvodu vstřikovače — válec 4', descEn: 'Injector Circuit Malfunction Cylinder 4', severity: 'high', cause: 'Vadný vstřikovač 4.' },
  P0205: { desc: 'Porucha obvodu vstřikovače — válec 5', descEn: 'Injector Circuit Malfunction Cylinder 5', severity: 'high', cause: 'Vadný vstřikovač 5.' },
  P0206: { desc: 'Porucha obvodu vstřikovače — válec 6', descEn: 'Injector Circuit Malfunction Cylinder 6', severity: 'high', cause: 'Vadný vstřikovač 6.' },
  P0207: { desc: 'Porucha obvodu vstřikovače — válec 7', descEn: 'Injector Circuit Malfunction Cylinder 7', severity: 'high', cause: 'Vadný vstřikovač 7.' },
  P0208: { desc: 'Porucha obvodu vstřikovače — válec 8', descEn: 'Injector Circuit Malfunction Cylinder 8', severity: 'high', cause: 'Vadný vstřikovač 8.' },

  // P03xx — Ignition / Misfire
  P0300: { desc: 'Náhodné/vícenásobné vynechávání zapalování', descEn: 'Random/Multiple Cylinder Misfire Detected', severity: 'critical', cause: 'Zapalování, vstřikování, komprese, palivo.' },
  P0301: { desc: 'Vynechávání zapalování — válec 1', descEn: 'Cylinder 1 Misfire Detected', severity: 'high', cause: 'Svíčka, cívka, vstřikovač, komprese válce 1.' },
  P0302: { desc: 'Vynechávání zapalování — válec 2', descEn: 'Cylinder 2 Misfire Detected', severity: 'high', cause: 'Svíčka, cívka, vstřikovač válce 2.' },
  P0303: { desc: 'Vynechávání zapalování — válec 3', descEn: 'Cylinder 3 Misfire Detected', severity: 'high', cause: 'Svíčka, cívka, vstřikovač válce 3.' },
  P0304: { desc: 'Vynechávání zapalování — válec 4', descEn: 'Cylinder 4 Misfire Detected', severity: 'high', cause: 'Svíčka, cívka, vstřikovač válce 4.' },
  P0305: { desc: 'Vynechávání zapalování — válec 5', descEn: 'Cylinder 5 Misfire Detected', severity: 'high', cause: 'Svíčka, cívka, vstřikovač válce 5.' },
  P0306: { desc: 'Vynechávání zapalování — válec 6', descEn: 'Cylinder 6 Misfire Detected', severity: 'high', cause: 'Svíčka, cívka, vstřikovač válce 6.' },
  P0307: { desc: 'Vynechávání zapalování — válec 7', descEn: 'Cylinder 7 Misfire Detected', severity: 'high', cause: 'Svíčka, cívka, vstřikovač válce 7.' },
  P0308: { desc: 'Vynechávání zapalování — válec 8', descEn: 'Cylinder 8 Misfire Detected', severity: 'high', cause: 'Svíčka, cívka, vstřikovač válce 8.' },
  P0320: { desc: 'Porucha vstupu snímače otáček/polohy klikového hřídele', descEn: 'Ignition/Distributor Engine Speed Input Circuit Malfunction', severity: 'high', cause: 'Vadný CKP snímač.' },
  P0325: { desc: 'Porucha obvodu snímače klepání — banka 1', descEn: 'Knock Sensor 1 Circuit Malfunction (Bank 1)', severity: 'medium', cause: 'Vadný knock senzor.' },
  P0335: { desc: 'Porucha obvodu snímače klikového hřídele (CKP)', descEn: 'Crankshaft Position Sensor A Circuit Malfunction', severity: 'critical', cause: 'Vadný CKP, poškozená kabeláž.' },
  P0340: { desc: 'Porucha obvodu snímače vačkového hřídele (CMP)', descEn: 'Camshaft Position Sensor Circuit Malfunction', severity: 'high', cause: 'Vadný CMP.' },
  P0341: { desc: 'CMP — signál mimo rozsah', descEn: 'Camshaft Position Sensor Range/Performance', severity: 'high', cause: 'Přeskočené VVT, opotřebený rozvod.' },

  // P04xx — Emissions
  P0400: { desc: 'Recirkulace výfukových plynů (EGR) — porucha průtoku', descEn: 'Exhaust Gas Recirculation Flow Malfunction', severity: 'medium', cause: 'Zanesený EGR ventil.' },
  P0401: { desc: 'EGR — nedostatečný průtok', descEn: 'EGR Flow Insufficient Detected', severity: 'medium', cause: 'Zanesený EGR nebo kanály.' },
  P0402: { desc: 'EGR — nadměrný průtok', descEn: 'EGR Flow Excessive Detected', severity: 'medium', cause: 'Zaseklý EGR ventil.' },
  P0403: { desc: 'EGR — porucha obvodu solenoidu', descEn: 'EGR Circuit Malfunction', severity: 'medium', cause: 'Vadný solenoid EGR.' },
  P0410: { desc: 'Sekundární přívod vzduchu — porucha systému', descEn: 'Secondary Air Injection System Malfunction', severity: 'low', cause: 'Vadná pumpa sekundárního vzduchu.' },
  P0420: { desc: 'Nízká účinnost katalyzátoru — banka 1', descEn: 'Catalyst System Efficiency Below Threshold (Bank 1)', severity: 'medium', cause: 'Opotřebený katalyzátor nebo vadná lambda sonda.' },
  P0430: { desc: 'Nízká účinnost katalyzátoru — banka 2', descEn: 'Catalyst System Efficiency Below Threshold (Bank 2)', severity: 'medium', cause: 'Opotřebený katalyzátor banky 2.' },
  P0440: { desc: 'EVAP — porucha systému odparů', descEn: 'Evaporative Emission Control System Malfunction', severity: 'low', cause: 'Netěsné víčko nádrže, prasklá hadice.' },
  P0441: { desc: 'EVAP — nesprávný proplach', descEn: 'EVAP Incorrect Purge Flow', severity: 'low', cause: 'Vadný purge ventil.' },
  P0442: { desc: 'EVAP — malý únik', descEn: 'EVAP System Leak Detected (small leak)', severity: 'low', cause: 'Netěsné víčko nádrže.' },
  P0443: { desc: 'EVAP — porucha obvodu purge ventilu', descEn: 'EVAP Purge Control Valve Circuit Malfunction', severity: 'low', cause: 'Vadný purge ventil.' },
  P0446: { desc: 'EVAP — porucha ventilace kanystru', descEn: 'EVAP Vent Control Circuit Malfunction', severity: 'low', cause: 'Vadný vent solenoid.' },
  P0455: { desc: 'EVAP — velký únik', descEn: 'EVAP System Leak Detected (large leak)', severity: 'low', cause: 'Chybějící/uvolněné víčko nádrže.' },
  P0456: { desc: 'EVAP — velmi malý únik', descEn: 'EVAP System Small Leak Detected', severity: 'low', cause: 'Mikrotrhlina v hadici EVAP.' },
  P0480: { desc: 'Porucha obvodu ventilátoru chladiče 1', descEn: 'Cooling Fan 1 Control Circuit Malfunction', severity: 'medium', cause: 'Vadné relé nebo motor ventilátoru.' },

  // P05xx — Vehicle Speed & Idle
  P0500: { desc: 'Porucha snímače rychlosti vozidla (VSS)', descEn: 'Vehicle Speed Sensor Malfunction', severity: 'medium', cause: 'Vadný VSS nebo ABS snímač.' },
  P0505: { desc: 'Regulace volnoběhu — porucha systému', descEn: 'Idle Control System Malfunction', severity: 'medium', cause: 'Zanesená škrticí klapka, IAC ventil.' },
  P0506: { desc: 'Regulace volnoběhu — otáčky nižší než očekávané', descEn: 'Idle Control System RPM Lower Than Expected', severity: 'medium', cause: 'Falešný vzduch, znečištěná klapka.' },
  P0507: { desc: 'Regulace volnoběhu — otáčky vyšší než očekávané', descEn: 'Idle Control System RPM Higher Than Expected', severity: 'medium', cause: 'Netěsnost sání, zaseklý IAC.' },
  P0520: { desc: 'Porucha snímače tlaku oleje', descEn: 'Engine Oil Pressure Sensor Malfunction', severity: 'high', cause: 'Vadný snímač nebo nízký tlak oleje.' },
  P0522: { desc: 'Nízký tlak oleje — signál nízký', descEn: 'Engine Oil Pressure Sensor Low Voltage', severity: 'high', cause: 'Vadný snímač, nízký tlak.' },
  P0523: { desc: 'Nízký tlak oleje — signál vysoký', descEn: 'Engine Oil Pressure Sensor High Voltage', severity: 'high', cause: 'Přerušený obvod snímače.' },
  P0532: { desc: 'A/C tlak — nízký signál', descEn: 'A/C Refrigerant Pressure Sensor Low Input', severity: 'low', cause: 'Únik chladiva klimatizace.' },
  P0562: { desc: 'Systémové napětí nízké', descEn: 'System Voltage Low', severity: 'high', cause: 'Slabý alternátor nebo baterie.' },
  P0563: { desc: 'Systémové napětí vysoké', descEn: 'System Voltage High', severity: 'high', cause: 'Vadný regulátor alternátoru.' },
  P0571: { desc: 'Přepínač brzdového pedálu — porucha obvodu A', descEn: 'Brake Switch A Circuit Malfunction', severity: 'medium', cause: 'Vadný spínač brzdových světel.' },
};

export function lookupGenericDTC(code: string): GenericDTCEntry | undefined {
  return GENERIC_DTC_DB[code.toUpperCase()];
}
