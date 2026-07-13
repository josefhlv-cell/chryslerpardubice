export type VehicleProfile = {
  id: string;
  brandKey: string;
  make: string;
  model: string;
  generation: string;
  yearFrom: number;
  yearTo: number;
  engine: string;
  engineCode: string;
  fuel: string;
  /** Doporučené řetězce ECU. POUZE pro highlight/předvýběr — NIKDY jako filtr seznamu ECU. */
  ecuHints: string[];
  verifiedRoutineIds?: string[];
};

export const COMMON_VEHICLE_MAKES: string[] = [
  "Alfa Romeo", "Audi", "BMW", "Chevrolet", "Chrysler", "Citroën", "Cupra",
  "Dacia", "Dodge", "Fiat", "Ford", "Honda", "Hyundai", "Iveco", "Jaguar",
  "Jeep", "Kia", "Lancia", "Land Rover", "Lexus", "Mazda", "Mercedes-Benz", "MINI",
  "Mitsubishi", "Nissan", "Opel", "Peugeot", "Porsche", "RAM", "Renault",
  "SEAT", "Škoda", "Smart", "Subaru", "Suzuki", "Tesla", "Toyota",
  "Volkswagen", "Volvo",
];

const vagEcu = ["EDC16", "EDC17", "MD1", "MED17", "MG1", "Simos", "Engine ECU", "Motor"];
const fcaEcu = ["PCM", "ECM", "TCM", "ABS", "RCM", "BCM", "SGW", "IPC", "HVAC", "EPB", "PSCM", "SCCM", "TPMS", "Engine Control", "Powertrain Control", "Motor", "Transmission"];
const fcaDieselEcu = ["CRD ECU", "EDC16", "EDC17", ...fcaEcu];
const fordEcu = ["PCM", "ECM", "Powertrain Control Module", "Engine Control Module", "TCM", "ABS", "RCM", "BCM", "GWM", "IPC", "HVAC", "PSCM", "SCCM", "APIM", "Ford"];

function profile(
  id: string, brandKey: string, make: string, model: string, generation: string,
  yearFrom: number, yearTo: number, engine: string, engineCode: string,
  fuel: string, ecuHints: string[],
): VehicleProfile {
  return {
    id, brandKey, make, model, generation, yearFrom, yearTo,
    engine, engineCode, fuel, ecuHints, verifiedRoutineIds: [],
  };
}

export const VEHICLE_PROFILES: VehicleProfile[] = [
  // ============= ŠKODA / VW / AUDI / SEAT (VAG) =============
  profile("skoda-superb-2-cayc","VAG","Škoda","Superb","II (3T)",2008,2015,"1.6 TDI 77 kW","CAYC","Diesel",["EDC17C46",...vagEcu]),
  profile("skoda-superb-2-cffb","VAG","Škoda","Superb","II (3T)",2010,2015,"2.0 TDI 103 kW","CFFB","Diesel",["EDC17CP14",...vagEcu]),
  profile("skoda-superb-3-crlb","VAG","Škoda","Superb","III (3V)",2015,2019,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("skoda-octavia-2-bxe","VAG","Škoda","Octavia","II (1Z)",2004,2010,"1.9 TDI 77 kW","BXE","Diesel",["EDC16U34",...vagEcu]),
  profile("skoda-octavia-2-bkd","VAG","Škoda","Octavia","II (1Z)",2004,2008,"2.0 TDI 103 kW","BKD","Diesel",["EDC16U31",...vagEcu]),
  profile("skoda-octavia-3-cayc","VAG","Škoda","Octavia","III (5E)",2013,2017,"1.6 TDI 77/81 kW","CAYC","Diesel",["EDC17C46",...vagEcu]),
  profile("skoda-octavia-3-crlb","VAG","Škoda","Octavia","III (5E)",2013,2020,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("skoda-kodiaq-dfga","VAG","Škoda","Kodiaq","NS",2017,2021,"2.0 TDI 110 kW","DFGA","Diesel",["EDC17C74",...vagEcu]),
  profile("vw-golf-5-bkc","VAG","Volkswagen","Golf","V (1K)",2003,2008,"1.9 TDI 77 kW","BKC","Diesel",["EDC16U34",...vagEcu]),
  profile("vw-golf-6-cfhc","VAG","Volkswagen","Golf","VI (5K)",2008,2013,"2.0 TDI 103 kW","CFHC","Diesel",["EDC17C46",...vagEcu]),
  profile("vw-golf-7-crlb","VAG","Volkswagen","Golf","VII (5G)",2013,2020,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("vw-passat-b6-cbab","VAG","Volkswagen","Passat","B6 (3C)",2008,2010,"2.0 TDI 103 kW","CBAB","Diesel",["EDC17CP14",...vagEcu]),
  profile("vw-passat-b7-cffb","VAG","Volkswagen","Passat","B7 (3C)",2010,2014,"2.0 TDI 103 kW","CFFB","Diesel",["EDC17CP14",...vagEcu]),
  profile("vw-passat-b8-crlb","VAG","Volkswagen","Passat","B8 (3G)",2014,2019,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("vw-transporter-t5-caac","VAG","Volkswagen","Transporter","T5",2009,2015,"2.0 TDI 103 kW","CAAC","Diesel",["EDC17CP20",...vagEcu]),
  profile("vw-transporter-t6-cxha","VAG","Volkswagen","Transporter","T6",2015,2019,"2.0 TDI 110 kW","CXHA","Diesel",["EDC17CP54",...vagEcu]),
  profile("audi-a3-8p-bkd","VAG","Audi","A3","8P",2003,2008,"2.0 TDI 103 kW","BKD","Diesel",["EDC16U31",...vagEcu]),
  profile("audi-a3-8v-crlb","VAG","Audi","A3","8V",2013,2020,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("audi-a4-b8-caga","VAG","Audi","A4","B8 (8K)",2008,2015,"2.0 TDI 105 kW","CAGA","Diesel",["EDC17CP14",...vagEcu]),
  profile("audi-a6-c7-cduc","VAG","Audi","A6","C7 (4G)",2011,2018,"3.0 TDI 180 kW","CDUC","Diesel",["EDC17CP44",...vagEcu]),
  profile("audi-q7-4l-casa","VAG","Audi","Q7","4L",2007,2015,"3.0 TDI","CASA","Diesel",["EDC17CP04",...vagEcu]),
  profile("seat-leon-1p-bkd","VAG","SEAT","Leon","1P",2005,2009,"2.0 TDI 103 kW","BKD","Diesel",["EDC16U31",...vagEcu]),
  profile("seat-leon-5f-crlb","VAG","SEAT","Leon","5F",2013,2020,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("seat-alhambra-7n-cffb","VAG","SEAT","Alhambra","7N",2010,2015,"2.0 TDI 103 kW","CFFB","Diesel",["EDC17CP14",...vagEcu]),

  // ============= FORD =============
  profile("ford-mustang-s550-23-ecoboost","FORD","Ford","Mustang","VI / S550",2015,2023,"2.3 EcoBoost","2.3L EcoBoost","Benzín",["Bosch MED17","Continental",...fordEcu]),
  profile("ford-mustang-s550-50-gt","FORD","Ford","Mustang","VI / S550",2015,2023,"5.0 V8 Coyote","5.0L Coyote","Benzín",fordEcu),
  profile("ford-mustang-s650-23-ecoboost","FORD","Ford","Mustang","VII / S650",2024,2026,"2.3 EcoBoost","2.3L EcoBoost","Benzín",fordEcu),
  profile("ford-mustang-s650-50-gt","FORD","Ford","Mustang","VII / S650",2024,2026,"5.0 V8 Coyote","5.0L Coyote","Benzín",fordEcu),

  // ============= CHRYSLER =============
  // Pacifica (RU)
  profile("chrysler-pacifica-ru-erb","STLA","Chrysler","Pacifica","RU",2017,2026,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("chrysler-pacifica-ru-ehybrid","STLA","Chrysler","Pacifica","RU",2017,2026,"3.6 V6 Plug-in Hybrid","EHYBRID","Hybrid",fcaEcu),
  // Voyager / Grand Voyager (RT/RU – US Voyager = RU po 2020)
  profile("chrysler-voyager-ru-erb","STLA","Chrysler","Voyager","RU",2020,2026,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("chrysler-voyager-rt-erb","STLA","Chrysler","Voyager","RT",2011,2016,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("chrysler-voyager-rg-28crd","STLA","Chrysler","Voyager","RG",2001,2007,"2.8 CRD","ENR","Diesel",fcaDieselEcu),
  profile("chrysler-voyager-rg-33","STLA","Chrysler","Voyager","RG",2001,2007,"3.3 V6","EGA","Benzín",fcaEcu),
  profile("chrysler-grand-voyager-rt-38","STLA","Chrysler","Grand Voyager","RT",2008,2015,"3.8 V6","EGH","Benzín",fcaEcu),
  profile("chrysler-grand-voyager-rt-28crd","STLA","Chrysler","Grand Voyager","RT",2008,2015,"2.8 CRD","ENS","Diesel",fcaDieselEcu),
  // Town & Country (RT)
  profile("chrysler-town-country-rt-erb","STLA","Chrysler","Town & Country","RT",2011,2016,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("chrysler-town-country-rt-egq","STLA","Chrysler","Town & Country","RT",2008,2010,"4.0 V6","EGQ","Benzín",fcaEcu),
  profile("chrysler-town-country-rt-38","STLA","Chrysler","Town & Country","RT",2008,2016,"3.8 V6","EGH","Benzín",fcaEcu),
  // 300 / 300C (LX / LD)
  profile("chrysler-300c-lx-exl","STLA","Chrysler","300C","LX (I)",2005,2010,"3.0 CRD","EXL","Diesel",fcaDieselEcu),
  profile("chrysler-300c-lx-ezh","STLA","Chrysler","300C","LX (I)",2005,2010,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("chrysler-300c-lx-ezb","STLA","Chrysler","300C","LX (I)",2005,2010,"6.1 V8 HEMI SRT","ESF","Benzín",fcaEcu),
  profile("chrysler-300-ld-erb","STLA","Chrysler","300","LD",2011,2023,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("chrysler-300-ld-ezh","STLA","Chrysler","300","LD",2011,2023,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("chrysler-300-ld-esg","STLA","Chrysler","300","LD",2012,2023,"6.4 V8 HEMI SRT","ESG","Benzín",fcaEcu),
  // Sebring (JS)
  profile("chrysler-sebring-js-24","STLA","Chrysler","Sebring","JS",2007,2010,"2.4 World Engine","EDG","Benzín",fcaEcu),
  profile("chrysler-sebring-js-27","STLA","Chrysler","Sebring","JS",2007,2010,"2.7 V6","EER","Benzín",fcaEcu),
  profile("chrysler-sebring-js-20crd","STLA","Chrysler","Sebring","JS",2007,2010,"2.0 CRD","BYL","Diesel",fcaDieselEcu),
  // PT Cruiser (PT)
  profile("chrysler-pt-cruiser-pt-24","STLA","Chrysler","PT Cruiser","PT",2000,2010,"2.4","EDZ","Benzín",fcaEcu),
  profile("chrysler-pt-cruiser-pt-22crd","STLA","Chrysler","PT Cruiser","PT",2002,2007,"2.2 CRD","ENJ","Diesel",fcaDieselEcu),
  // Crossfire (ZH)
  profile("chrysler-crossfire-zh-32","STLA","Chrysler","Crossfire","ZH",2004,2008,"3.2 V6","EGX","Benzín",fcaEcu),
  // Aspen (HG)
  profile("chrysler-aspen-hg-47","STLA","Chrysler","Aspen","HG",2007,2009,"4.7 V8 PowerTech","EVA","Benzín",fcaEcu),
  profile("chrysler-aspen-hg-57","STLA","Chrysler","Aspen","HG",2007,2009,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  // Neon (PL/PL2)
  profile("chrysler-neon-pl-20","STLA","Chrysler","Neon","PL",1994,1999,"2.0 SOHC","ECB","Benzín",fcaEcu),
  profile("chrysler-neon-pl2-20","STLA","Chrysler","Neon","PL2",2000,2005,"2.0","ECC","Benzín",fcaEcu),

  // ============= DODGE =============
  // Caravan / Grand Caravan (RT)
  profile("dodge-grand-caravan-rt-erb","STLA","Dodge","Grand Caravan","RT",2011,2020,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("dodge-grand-caravan-rt-38","STLA","Dodge","Grand Caravan","RT",2008,2010,"3.8 V6","EGH","Benzín",fcaEcu),
  profile("dodge-grand-caravan-rt-40","STLA","Dodge","Grand Caravan","RT",2008,2010,"4.0 V6","EGQ","Benzín",fcaEcu),
  profile("dodge-caravan-rg-33","STLA","Dodge","Caravan","RG",2001,2007,"3.3 V6","EGA","Benzín",fcaEcu),
  profile("dodge-caravan-rg-28crd","STLA","Dodge","Caravan","RG",2001,2007,"2.8 CRD","ENR","Diesel",fcaDieselEcu),
  // Challenger (LC/LA)
  profile("dodge-challenger-lc-erb","STLA","Dodge","Challenger","LC",2008,2010,"3.5 V6","EGF","Benzín",fcaEcu),
  profile("dodge-challenger-la-erb","STLA","Dodge","Challenger","LA",2011,2023,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("dodge-challenger-la-ezh","STLA","Dodge","Challenger","LA",2011,2023,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("dodge-challenger-la-esg","STLA","Dodge","Challenger","LA",2011,2023,"6.4 V8 HEMI SRT","ESG","Benzín",fcaEcu),
  profile("dodge-challenger-la-hellcat","STLA","Dodge","Challenger","LA Hellcat",2015,2023,"6.2 V8 Supercharged","EPE","Benzín",fcaEcu),
  // Charger (LX/LD)
  profile("dodge-charger-lx-erb","STLA","Dodge","Charger","LX (I)",2006,2010,"3.5 V6","EGF","Benzín",fcaEcu),
  profile("dodge-charger-lx-ezh","STLA","Dodge","Charger","LX (I)",2006,2010,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("dodge-charger-ld-erb","STLA","Dodge","Charger","LD",2011,2023,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("dodge-charger-ld-ezh","STLA","Dodge","Charger","LD",2011,2023,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("dodge-charger-ld-esg","STLA","Dodge","Charger","LD",2012,2023,"6.4 V8 HEMI SRT","ESG","Benzín",fcaEcu),
  profile("dodge-charger-ld-hellcat","STLA","Dodge","Charger","LD Hellcat",2015,2023,"6.2 V8 Supercharged","EPE","Benzín",fcaEcu),
  // Durango (WD)
  profile("dodge-durango-wd-erb","STLA","Dodge","Durango","WD",2011,2024,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("dodge-durango-wd-ezh","STLA","Dodge","Durango","WD",2011,2024,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("dodge-durango-wd-esg","STLA","Dodge","Durango","WD",2018,2024,"6.4 V8 HEMI SRT","ESG","Benzín",fcaEcu),
  profile("dodge-durango-hb-47","STLA","Dodge","Durango","HB (II)",2004,2009,"4.7 V8 PowerTech","EVA","Benzín",fcaEcu),
  profile("dodge-durango-hb-57","STLA","Dodge","Durango","HB (II)",2004,2009,"5.7 V8 HEMI","EZA","Benzín",fcaEcu),
  // Journey (JC)
  profile("dodge-journey-jc-erb","STLA","Dodge","Journey","JC",2011,2020,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("dodge-journey-jc-24","STLA","Dodge","Journey","JC",2008,2020,"2.4 World Engine","ED3","Benzín",fcaEcu),
  profile("dodge-journey-jc-20crd","STLA","Dodge","Journey","JC",2008,2011,"2.0 CRD","BYL","Diesel",fcaDieselEcu),
  // Caliber (PM)
  profile("dodge-caliber-pm-18","STLA","Dodge","Caliber","PM",2006,2012,"1.8","EBA","Benzín",fcaEcu),
  profile("dodge-caliber-pm-20","STLA","Dodge","Caliber","PM",2006,2012,"2.0","ECN","Benzín",fcaEcu),
  profile("dodge-caliber-pm-20crd","STLA","Dodge","Caliber","PM",2006,2012,"2.0 CRD","BYL","Diesel",fcaDieselEcu),
  profile("dodge-caliber-pm-22crd","STLA","Dodge","Caliber","PM",2006,2012,"2.2 CRD","ENP","Diesel",fcaDieselEcu),
  // Nitro (KA)
  profile("dodge-nitro-ka-37","STLA","Dodge","Nitro","KA",2007,2012,"3.7 V6","EKG","Benzín",fcaEcu),
  profile("dodge-nitro-ka-40","STLA","Dodge","Nitro","KA",2007,2012,"4.0 V6","EGT","Benzín",fcaEcu),
  profile("dodge-nitro-ka-28crd","STLA","Dodge","Nitro","KA",2007,2012,"2.8 CRD","ENS","Diesel",fcaDieselEcu),
  // Avenger (JS)
  profile("dodge-avenger-js-24","STLA","Dodge","Avenger","JS",2008,2014,"2.4 World Engine","ED3","Benzín",fcaEcu),
  profile("dodge-avenger-js-erb","STLA","Dodge","Avenger","JS",2011,2014,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("dodge-avenger-js-20crd","STLA","Dodge","Avenger","JS",2008,2010,"2.0 CRD","BYL","Diesel",fcaDieselEcu),
  // Dart (PF)
  profile("dodge-dart-pf-14","STLA","Dodge","Dart","PF",2013,2016,"1.4 MultiAir Turbo","EAM","Benzín",fcaEcu),
  profile("dodge-dart-pf-20","STLA","Dodge","Dart","PF",2013,2016,"2.0 Tigershark","ECC","Benzín",fcaEcu),
  profile("dodge-dart-pf-24","STLA","Dodge","Dart","PF",2013,2016,"2.4 Tigershark","ED6","Benzín",fcaEcu),
  // Magnum (LX)
  profile("dodge-magnum-lx-35","STLA","Dodge","Magnum","LX",2005,2008,"3.5 V6","EGF","Benzín",fcaEcu),
  profile("dodge-magnum-lx-57","STLA","Dodge","Magnum","LX",2005,2008,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("dodge-magnum-lx-crd","STLA","Dodge","Magnum","LX",2005,2008,"3.0 CRD","EXL","Diesel",fcaDieselEcu),
  // Viper (ZB/VX)
  profile("dodge-viper-zb-83","STLA","Dodge","Viper","ZB",2003,2010,"8.3 V10","EWA","Benzín",fcaEcu),
  profile("dodge-viper-vx-84","STLA","Dodge","Viper","VX",2013,2017,"8.4 V10","EWB","Benzín",fcaEcu),
  // Neon (PL/SX)
  profile("dodge-neon-pl-20","STLA","Dodge","Neon","PL",1994,1999,"2.0 SOHC","ECB","Benzín",fcaEcu),
  profile("dodge-neon-sx-20","STLA","Dodge","Neon","SX (II)",2000,2005,"2.0","ECC","Benzín",fcaEcu),
  // Stratus (JR)
  profile("dodge-stratus-jr-24","STLA","Dodge","Stratus","JR",2001,2006,"2.4","EDZ","Benzín",fcaEcu),
  profile("dodge-stratus-jr-27","STLA","Dodge","Stratus","JR",2001,2006,"2.7 V6","EER","Benzín",fcaEcu),
  // Dakota (ND)
  profile("dodge-dakota-nd-37","STLA","Dodge","Dakota","ND",2005,2011,"3.7 V6","EKG","Benzín",fcaEcu),
  profile("dodge-dakota-nd-47","STLA","Dodge","Dakota","ND",2005,2011,"4.7 V8 PowerTech","EVA","Benzín",fcaEcu),
  // Sprinter (rebadge Mercedes)
  profile("dodge-sprinter-w906-30crd","STLA","Dodge","Sprinter","W906",2007,2009,"3.0 CRD","OM642","Diesel",[...fcaDieselEcu,"OM642"]),

  // ============= JEEP =============
  profile("jeep-grand-cherokee-wk2-erb","STLA","Jeep","Grand Cherokee","WK2",2011,2021,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("jeep-grand-cherokee-wk2-ezh","STLA","Jeep","Grand Cherokee","WK2",2011,2021,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("jeep-grand-cherokee-wk2-exf","STLA","Jeep","Grand Cherokee","WK2",2011,2020,"3.0 CRD","EXF","Diesel",fcaDieselEcu),
  profile("jeep-wrangler-jk-erb","STLA","Jeep","Wrangler","JK",2012,2018,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("jeep-wrangler-jl-erb","STLA","Jeep","Wrangler","JL",2018,2026,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("jeep-cherokee-kl-ed6","STLA","Jeep","Cherokee","KL",2014,2023,"2.4 Tigershark","ED6","Benzín",fcaEcu),
  profile("jeep-renegade-bu-eam","STLA","Jeep","Renegade","BU",2015,2023,"1.6 MultiJet","EAM","Diesel",fcaDieselEcu),

  // ============= RAM =============
  profile("ram-1500-ds-ezh","STLA","RAM","1500","DS",2009,2018,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("ram-1500-dt-ezh","STLA","RAM","1500","DT",2019,2026,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("ram-1500-ds-exf","STLA","RAM","1500","DS",2014,2018,"3.0 EcoDiesel","EXF","Diesel",fcaDieselEcu),
  profile("ram-1500-dt-exf","STLA","RAM","1500","DT",2020,2023,"3.0 EcoDiesel","EXF","Diesel",fcaDieselEcu),
  profile("ram-2500-dj-cummins","STLA","RAM","2500","DJ",2013,2026,"6.7 Cummins","ISB6.7","Diesel",[...fcaDieselEcu,"Cummins"]),
];

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
    .sort((a, b) => a.localeCompare(b, "cs"));
}
