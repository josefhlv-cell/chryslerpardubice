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

  // ============= VLNA 1: VW SKUPINA (doplnění benzín / novější) =============
  profile("vw-golf-7-cjza","VAG","Volkswagen","Golf","VII (5G)",2012,2019,"1.2 TSI 63 kW","CJZA","Benzín",["MED17.5.5",...vagEcu]),
  profile("vw-golf-7-cxsa","VAG","Volkswagen","Golf","VII (5G)",2013,2019,"1.4 TSI 90 kW","CXSA","Benzín",["MED17.5.5",...vagEcu]),
  profile("vw-golf-8-dpca","VAG","Volkswagen","Golf","VIII (CD)",2020,2026,"1.5 TSI 96 kW","DPCA","Benzín",["MG1CS111",...vagEcu]),
  profile("vw-tiguan-ad1-dfga","VAG","Volkswagen","Tiguan","II (AD1)",2016,2023,"2.0 TDI 110 kW","DFGA","Diesel",["EDC17C74",...vagEcu]),
  profile("vw-tiguan-ad1-dkza","VAG","Volkswagen","Tiguan","II (AD1)",2018,2023,"1.5 TSI 110 kW","DPCA","Benzín",["MG1CS011",...vagEcu]),
  profile("vw-polo-aw-dkla","VAG","Volkswagen","Polo","VI (AW)",2017,2026,"1.0 TSI 70 kW","DKLA","Benzín",["MG1CS011",...vagEcu]),
  profile("vw-touareg-7p-crca","VAG","Volkswagen","Touareg","II (7P)",2010,2018,"3.0 TDI 180 kW","CRCA","Diesel",["EDC17CP44",...vagEcu]),
  profile("skoda-fabia-nj-czca","VAG","Škoda","Fabia","III (NJ)",2014,2021,"1.0 TSI 70 kW","CHZC","Benzín",["MED17.5.25",...vagEcu]),
  profile("skoda-octavia-4-dttc","VAG","Škoda","Octavia","IV (NX)",2020,2026,"2.0 TDI 110 kW","DTTC","Diesel",["MD1TD100",...vagEcu]),
  profile("skoda-karoq-nu-dfga","VAG","Škoda","Karoq","NU",2017,2026,"2.0 TDI 110 kW","DFGA","Diesel",["EDC17C74",...vagEcu]),
  profile("audi-a4-b9-dety","VAG","Audi","A4","B9 (8W)",2015,2023,"2.0 TDI 140 kW","DETA","Diesel",["MD1TD100",...vagEcu]),
  profile("audi-q5-fy-dety","VAG","Audi","Q5","FY",2017,2026,"2.0 TDI 140 kW","DETA","Diesel",["MD1TD100",...vagEcu]),
  profile("seat-ateca-kh7-dfga","VAG","SEAT","Ateca","KH7",2016,2026,"2.0 TDI 110 kW","DFGA","Diesel",["EDC17C74",...vagEcu]),
  profile("porsche-cayenne-92a-diesel","PORSCHE","Porsche","Cayenne","92A",2010,2017,"3.0 V6 TDI","CRCA","Diesel",["EDC17CP44",...vagEcu]),

  // ============= VLNA 1: BMW / MINI =============
  profile("bmw-3-f30-n47","BMW","BMW","3 (F30)","F30",2011,2019,"320d 2.0 135 kW","N47D20","Diesel",[...bmwEcu,"DDE7","DDE"]),
  profile("bmw-3-f30-b47","BMW","BMW","3 (F30)","F30",2015,2019,"320d 2.0 140 kW","B47D20","Diesel",[...bmwEcu,"DDE8"]),
  profile("bmw-3-g20-b48","BMW","BMW","3 (G20)","G20",2019,2026,"330i 2.0 190 kW","B48B20","Benzín",[...bmwEcu,"DME MEVD"]),
  profile("bmw-5-f10-n57","BMW","BMW","5 (F10)","F10",2010,2017,"530d 3.0 190 kW","N57D30","Diesel",[...bmwEcu,"DDE7"]),
  profile("bmw-5-g30-b57","BMW","BMW","5 (G30)","G30",2017,2024,"530d 3.0 195 kW","B57D30","Diesel",[...bmwEcu,"DDE8"]),
  profile("bmw-x3-f25-n47","BMW","BMW","X3 (F25)","F25",2011,2017,"20d 2.0 135 kW","N47D20","Diesel",bmwEcu),
  profile("bmw-x5-f15-n57","BMW","BMW","X5 (F15)","F15",2013,2018,"30d 3.0 190 kW","N57D30","Diesel",bmwEcu),
  profile("bmw-1-f20-n13","BMW","BMW","1 (F20)","F20",2011,2019,"118i 1.6 100 kW","N13B16","Benzín",bmwEcu),
  profile("mini-cooper-f56-b38","MINI","MINI","Cooper","F56",2014,2026,"1.5 100 kW","B38A15","Benzín",bmwEcu),
  profile("mini-countryman-r60-n47","MINI","MINI","Countryman","R60",2010,2016,"Cooper D 2.0","N47C20","Diesel",bmwEcu),

  // ============= VLNA 1: MERCEDES-BENZ =============
  profile("mb-c-w204-om651","MB","Mercedes-Benz","C (W204)","W204",2007,2014,"C220 CDI 2.1","OM651","Diesel",[...mbEcu,"CDI4","OM651"]),
  profile("mb-c-w205-om654","MB","Mercedes-Benz","C (W205)","W205",2014,2021,"C220d 2.0","OM654","Diesel",[...mbEcu,"CDI6"]),
  profile("mb-e-w212-om642","MB","Mercedes-Benz","E (W212)","W212",2009,2016,"E350 CDI 3.0 V6","OM642","Diesel",[...mbEcu,"CDI3"]),
  profile("mb-e-w213-om654","MB","Mercedes-Benz","E (W213)","W213",2016,2023,"E220d 2.0","OM654","Diesel",mbEcu),
  profile("mb-sprinter-w906-om651","MB","Mercedes-Benz","Sprinter","W906",2009,2018,"2.1 CDI","OM651","Diesel",mbEcu),
  profile("mb-sprinter-w907-om654","MB","Mercedes-Benz","Sprinter","W907/910",2018,2026,"2.0 CDI","OM654","Diesel",mbEcu),
  profile("mb-vito-w447-om651","MB","Mercedes-Benz","Vito","W447",2014,2026,"2.1 CDI","OM651","Diesel",mbEcu),
  profile("mb-glc-x253-om654","MB","Mercedes-Benz","GLC","X253",2015,2022,"220d 2.0","OM654","Diesel",mbEcu),

  // ============= VLNA 1: FORD / LINCOLN =============
  profile("ford-focus-mk3-15tdci","FORD","Ford","Focus","Mk3",2011,2018,"1.5 TDCi 88 kW","XWDA","Diesel",fordEcu),
  profile("ford-focus-mk4-10ecoboost","FORD","Ford","Focus","Mk4",2018,2026,"1.0 EcoBoost 92 kW","B7DA","Benzín",fordEcu),
  profile("ford-mondeo-mk5-20tdci","FORD","Ford","Mondeo","Mk5",2014,2022,"2.0 TDCi 110 kW","T7CJ","Diesel",fordEcu),
  profile("ford-kuga-mk2-20tdci","FORD","Ford","Kuga","Mk2",2012,2019,"2.0 TDCi 110 kW","TXDA","Diesel",fordEcu),
  profile("ford-transit-custom-20ecoblue","FORD","Ford","Transit Custom","V362",2016,2026,"2.0 EcoBlue 96 kW","YMF6","Diesel",fordEcu),
  profile("ford-ranger-t6-32tdci","FORD","Ford","Ranger","T6",2011,2022,"3.2 TDCi 147 kW","SAFA","Diesel",fordEcu),
  profile("ford-f150-p552-27ecoboost","FORD","Ford","F-150","P552",2015,2020,"2.7 EcoBoost V6","2.7L EB","Benzín",fordEcu),
  profile("ford-f150-p702-50","FORD","Ford","F-150","P702",2021,2026,"5.0 V8 Coyote","5.0L","Benzín",fordEcu),
  profile("ford-explorer-u625-30ecoboost","FORD","Ford","Explorer","U625",2020,2026,"3.0 EcoBoost V6","3.0L EB","Benzín",fordEcu),
  profile("lincoln-navigator-u554-35ecoboost","FORD","Lincoln","Navigator","U554",2015,2017,"3.5 EcoBoost V6","3.5L EB","Benzín",fordEcu),
  profile("lincoln-navigator-u554-2018","FORD","Lincoln","Navigator","U554 (IV)",2018,2026,"3.5 EcoBoost V6","3.5L EB","Benzín",fordEcu),
  profile("lincoln-mkz-cd4-20ecoboost","FORD","Lincoln","MKZ","CD4",2013,2020,"2.0 EcoBoost","2.0L EB","Benzín",fordEcu),
  profile("lincoln-mkx-cd4-37","FORD","Lincoln","MKX","CD4",2016,2018,"3.7 V6","3.7L","Benzín",fordEcu),
  profile("lincoln-aviator-cd6-30","FORD","Lincoln","Aviator","CD6",2020,2026,"3.0 V6 Twin-Turbo","3.0L TT","Benzín",fordEcu),

  // ============= VLNA 1: OPEL (GM éra) + Stellantis éra =============
  profile("opel-astra-j-a17dtj","GM","Opel","Astra","J",2009,2015,"1.7 CDTI 81 kW","A17DTJ","Diesel",gmEcu),
  profile("opel-astra-j-a14net","GM","Opel","Astra","J",2009,2015,"1.4 Turbo 103 kW","A14NET","Benzín",gmEcu),
  profile("opel-astra-k-b16dth","GM","Opel","Astra","K",2015,2021,"1.6 CDTI 100 kW","B16DTH","Diesel",gmEcu),
  profile("opel-insignia-a-a20dth","GM","Opel","Insignia","A",2008,2017,"2.0 CDTI 120 kW","A20DTH","Diesel",gmEcu),
  profile("opel-insignia-b-b20dth","GM","Opel","Insignia","B",2017,2022,"2.0 CDTI 125 kW","B20DTH","Diesel",gmEcu),
  profile("opel-corsa-e-b14xer","GM","Opel","Corsa","E",2014,2019,"1.4 66 kW","B14XER","Benzín",gmEcu),
  profile("opel-corsa-f-eb2","STLA","Opel","Corsa","F",2019,2026,"1.2 PureTech 74 kW","EB2ADTS","Benzín",fcaEcu),
  profile("opel-mokka-b-dv5","STLA","Opel","Mokka","B",2021,2026,"1.5 BlueHDi 81 kW","DV5RC","Diesel",fcaDieselEcu),
  profile("opel-vivaro-c-dw10","STLA","Opel","Vivaro","C",2019,2026,"2.0 BlueHDi 90 kW","DW10FE","Diesel",fcaDieselEcu),

  // ============= VLNA 1: CADILLAC (GM) =============
  profile("cadillac-cts-gmx322-36","GM","Cadillac","CTS","II (GMX322)",2008,2013,"3.6 V6 SIDI","LLT","Benzín",gmEcu),
  profile("cadillac-cts-gmx320-30","GM","Cadillac","CTS","III",2014,2019,"3.6 V6","LFX","Benzín",gmEcu),
  profile("cadillac-srx-gmt265-36","GM","Cadillac","SRX","II",2010,2016,"3.6 V6","LFX","Benzín",gmEcu),
  profile("cadillac-escalade-gmt900-62","GM","Cadillac","Escalade","GMT900",2007,2014,"6.2 V8","L94","Benzín",gmEcu),
  profile("cadillac-escalade-k2xx-62","GM","Cadillac","Escalade","K2XX",2015,2020,"6.2 V8","L86","Benzín",gmEcu),
  profile("cadillac-escalade-t1xx-62","GM","Cadillac","Escalade","T1XX",2021,2026,"6.2 V8","L87","Benzín",gmEcu),
  profile("cadillac-xt5-c1xx-36","GM","Cadillac","XT5","C1XX",2017,2026,"3.6 V6","LGX","Benzín",gmEcu),
  profile("cadillac-ats-alpha-20t","GM","Cadillac","ATS","Alpha",2013,2019,"2.0 Turbo","LTG","Benzín",gmEcu),

  // ============= VLNA 1: VOLVO =============
  profile("volvo-xc60-1g-d5244t","VOLVO","Volvo","XC60","I",2008,2017,"D5 2.4 158 kW","D5244T","Diesel",volvoEcu),
  profile("volvo-xc60-2g-d4204t","VOLVO","Volvo","XC60","II (SPA)",2017,2026,"D4 2.0 140 kW","D4204T","Diesel",volvoEcu),
  profile("volvo-xc90-2g-b4204t","VOLVO","Volvo","XC90","II (SPA)",2015,2026,"T6 2.0 235 kW","B4204T","Benzín",volvoEcu),
  profile("volvo-v60-1g-d4162t","VOLVO","Volvo","V60","I",2010,2018,"D2 1.6 84 kW","D4162T","Diesel",volvoEcu),
  profile("volvo-v40-d4204t","VOLVO","Volvo","V40","P1",2012,2019,"D2/D3 2.0","D4204T","Diesel",volvoEcu),
  profile("volvo-s60-3g-b4204t","VOLVO","Volvo","S60","III (SPA)",2018,2026,"T5 2.0 184 kW","B4204T","Benzín",volvoEcu),
  profile("volvo-v70-3g-d5244t","VOLVO","Volvo","V70","III",2007,2016,"D5 2.4","D5244T","Diesel",volvoEcu),
];


export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
    .sort((a, b) => a.localeCompare(b, "cs"));
}
