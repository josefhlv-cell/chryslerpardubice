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
  ecuHints: string[];
  verifiedRoutineIds?: string[];
};

export const COMMON_VEHICLE_MAKES: string[] = [
  "Alfa Romeo", "Audi", "BMW", "Chevrolet", "Chrysler", "Citroën", "Cupra",
  "Dacia", "Dodge", "Fiat", "Ford", "Honda", "Hyundai", "Iveco", "Jaguar",
  "Jeep", "Kia", "Land Rover", "Lexus", "Mazda", "Mercedes-Benz", "MINI",
  "Mitsubishi", "Nissan", "Opel", "Peugeot", "Porsche", "RAM", "Renault",
  "SEAT", "Škoda", "Smart", "Subaru", "Suzuki", "Tesla", "Toyota",
  "Volkswagen", "Volvo"
];

const vagEcu = ["EDC16", "EDC17", "MD1", "MED17", "MG1", "Simos", "Engine ECU", "Motor"];
const fcaEcu = ["PCM", "ECM", "Engine Control", "Powertrain Control", "Motor"];
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
  // ŠKODA
  profile("skoda-superb-2-cayc","VAG","Škoda","Superb","II (3T)",2008,2015,"1.6 TDI 77 kW","CAYC","Diesel",["EDC17C46",...vagEcu]),
  profile("skoda-superb-2-cffb","VAG","Škoda","Superb","II (3T)",2010,2015,"2.0 TDI 103 kW","CFFB","Diesel",["EDC17CP14",...vagEcu]),
  profile("skoda-superb-3-crlb","VAG","Škoda","Superb","III (3V)",2015,2019,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("skoda-octavia-2-bxe","VAG","Škoda","Octavia","II (1Z)",2004,2010,"1.9 TDI 77 kW","BXE","Diesel",["EDC16U34",...vagEcu]),
  profile("skoda-octavia-2-bkd","VAG","Škoda","Octavia","II (1Z)",2004,2008,"2.0 TDI 103 kW","BKD","Diesel",["EDC16U31",...vagEcu]),
  profile("skoda-octavia-3-cayc","VAG","Škoda","Octavia","III (5E)",2013,2017,"1.6 TDI 77/81 kW","CAYC","Diesel",["EDC17C46",...vagEcu]),
  profile("skoda-octavia-3-crlb","VAG","Škoda","Octavia","III (5E)",2013,2020,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("skoda-kodiaq-dfga","VAG","Škoda","Kodiaq","NS",2017,2021,"2.0 TDI 110 kW","DFGA","Diesel",["EDC17C74",...vagEcu]),

  // VOLKSWAGEN
  profile("vw-golf-5-bkc","VAG","Volkswagen","Golf","V (1K)",2003,2008,"1.9 TDI 77 kW","BKC","Diesel",["EDC16U34",...vagEcu]),
  profile("vw-golf-6-cfhc","VAG","Volkswagen","Golf","VI (5K)",2008,2013,"2.0 TDI 103 kW","CFHC","Diesel",["EDC17C46",...vagEcu]),
  profile("vw-golf-7-crlb","VAG","Volkswagen","Golf","VII (5G)",2013,2020,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("vw-passat-b6-cbab","VAG","Volkswagen","Passat","B6 (3C)",2008,2010,"2.0 TDI 103 kW","CBAB","Diesel",["EDC17CP14",...vagEcu]),
  profile("vw-passat-b7-cffb","VAG","Volkswagen","Passat","B7 (3C)",2010,2014,"2.0 TDI 103 kW","CFFB","Diesel",["EDC17CP14",...vagEcu]),
  profile("vw-passat-b8-crlb","VAG","Volkswagen","Passat","B8 (3G)",2014,2019,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("vw-transporter-t5-caac","VAG","Volkswagen","Transporter","T5",2009,2015,"2.0 TDI 103 kW","CAAC","Diesel",["EDC17CP20",...vagEcu]),
  profile("vw-transporter-t6-cxha","VAG","Volkswagen","Transporter","T6",2015,2019,"2.0 TDI 110 kW","CXHA","Diesel",["EDC17CP54",...vagEcu]),

  // AUDI
  profile("audi-a3-8p-bkd","VAG","Audi","A3","8P",2003,2008,"2.0 TDI 103 kW","BKD","Diesel",["EDC16U31",...vagEcu]),
  profile("audi-a3-8v-crlb","VAG","Audi","A3","8V",2013,2020,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("audi-a4-b8-caga","VAG","Audi","A4","B8 (8K)",2008,2015,"2.0 TDI 105 kW","CAGA","Diesel",["EDC17CP14",...vagEcu]),
  profile("audi-a6-c7-cduc","VAG","Audi","A6","C7 (4G)",2011,2018,"3.0 TDI 180 kW","CDUC","Diesel",["EDC17CP44",...vagEcu]),
  profile("audi-q7-4l-casa","VAG","Audi","Q7","4L",2007,2015,"3.0 TDI","CASA","Diesel",["EDC17CP04",...vagEcu]),

  // SEAT / CUPRA
  profile("seat-leon-1p-bkd","VAG","SEAT","Leon","1P",2005,2009,"2.0 TDI 103 kW","BKD","Diesel",["EDC16U31",...vagEcu]),
  profile("seat-leon-5f-crlb","VAG","SEAT","Leon","5F",2013,2020,"2.0 TDI 110 kW","CRLB","Diesel",["EDC17C64",...vagEcu]),
  profile("seat-alhambra-7n-cffb","VAG","SEAT","Alhambra","7N",2010,2015,"2.0 TDI 103 kW","CFFB","Diesel",["EDC17CP14",...vagEcu]),

  // FORD
  profile("ford-mustang-s550-23-ecoboost","FORD","Ford","Mustang","VI / S550",2015,2023,"2.3 EcoBoost","2.3L EcoBoost","Benzín",["PCM","ECM","Bosch MED17","Continental",...fordEcu]),
  profile("ford-mustang-s650-23-ecoboost","FORD","Ford","Mustang","VII / S650",2024,2026,"2.3 EcoBoost","2.3L EcoBoost","Benzín",["PCM","ECM","Powertrain Control Module",...fordEcu]),

  // CHRYSLER
  profile("chrysler-pacifica-ru-erb","STLA","Chrysler","Pacifica","RU",2017,2026,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("chrysler-pacifica-ru-ehybrid","STLA","Chrysler","Pacifica","RU",2017,2026,"3.6 V6 Plug-in Hybrid","EHYBRID","Hybrid",fcaEcu),
  profile("chrysler-town-country-rt-erb","STLA","Chrysler","Town & Country","RT",2011,2016,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("chrysler-town-country-rt-egq","STLA","Chrysler","Town & Country","RT",2008,2010,"4.0 V6","EGQ","Benzín",fcaEcu),
  profile("chrysler-300c-lx-erb","STLA","Chrysler","300C","LX",2011,2023,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("chrysler-300c-lx-ezh","STLA","Chrysler","300C","LX",2011,2023,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("chrysler-300c-le-exl","STLA","Chrysler","300C","LE/LX",2005,2010,"3.0 CRD","EXL","Diesel",["CRD ECU",...fcaEcu]),
  profile("chrysler-voyager-rt-erb","STLA","Chrysler","Voyager","RT",2011,2016,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("chrysler-voyager-rg-2-8","STLA","Chrysler","Voyager","RG",2001,2007,"2.8 CRD","ENR","Diesel",["CRD ECU",...fcaEcu]),

  // DODGE
  profile("dodge-grand-caravan-rt-erb","STLA","Dodge","Grand Caravan","RT",2011,2020,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("dodge-challenger-la-erb","STLA","Dodge","Challenger","LA",2011,2023,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("dodge-challenger-la-ezh","STLA","Dodge","Challenger","LA",2011,2023,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("dodge-challenger-la-esg","STLA","Dodge","Challenger","LA",2011,2023,"6.4 V8 HEMI","ESG","Benzín",fcaEcu),
  profile("dodge-charger-ld-erb","STLA","Dodge","Charger","LD",2011,2023,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("dodge-charger-ld-ezh","STLA","Dodge","Charger","LD",2011,2023,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("dodge-durango-wd-erb","STLA","Dodge","Durango","WD",2011,2024,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("dodge-durango-wd-ezh","STLA","Dodge","Durango","WD",2011,2024,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("dodge-journey-jc-erb","STLA","Dodge","Journey","JC",2011,2020,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),

  // JEEP
  profile("jeep-grand-cherokee-wk2-erb","STLA","Jeep","Grand Cherokee","WK2",2011,2021,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("jeep-grand-cherokee-wk2-ezh","STLA","Jeep","Grand Cherokee","WK2",2011,2021,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("jeep-grand-cherokee-wk2-exf","STLA","Jeep","Grand Cherokee","WK2",2011,2020,"3.0 CRD","EXF","Diesel",["EDC17C79","CRD ECU",...fcaEcu]),
  profile("jeep-wrangler-jk-erb","STLA","Jeep","Wrangler","JK",2012,2018,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("jeep-wrangler-jl-erb","STLA","Jeep","Wrangler","JL",2018,2026,"3.6 V6 Pentastar","ERB","Benzín",fcaEcu),
  profile("jeep-cherokee-kl-ed6","STLA","Jeep","Cherokee","KL",2014,2023,"2.4 Tigershark","ED6","Benzín",fcaEcu),
  profile("jeep-renegade-bu-eam","STLA","Jeep","Renegade","BU",2015,2023,"1.6 MultiJet","EAM","Diesel",["EDC17C69",...fcaEcu]),

  // RAM
  profile("ram-1500-ds-ezh","STLA","RAM","1500","DS",2009,2018,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("ram-1500-dt-ezh","STLA","RAM","1500","DT",2019,2026,"5.7 V8 HEMI","EZH","Benzín",fcaEcu),
  profile("ram-1500-ds-exf","STLA","RAM","1500","DS",2014,2018,"3.0 EcoDiesel","EXF","Diesel",["EDC17C79",...fcaEcu]),
];

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
    .sort((a, b) => a.localeCompare(b, "cs"));
}
