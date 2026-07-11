export type VehicleProfile = {
  brand: string;
  model: string;
  year: string;
  engine: string;
  ecu: string;
};

export const VEHICLE_PROFILES: VehicleProfile[] = [
  {
    brand: "Škoda",
    model: "Superb II",
    year: "2012",
    engine: "1.6 TDI CAYC",
    ecu: "EDC17C46",
  },
  {
    brand: "Škoda",
    model: "Superb II",
    year: "2012",
    engine: "2.0 TDI CFFB",
    ecu: "EDC17",
  },
  {
    brand: "Chrysler",
    model: "Pacifica",
    year: "2018",
    engine: "3.6 Pentastar",
    ecu: "PCM",
  },
];

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "cs")
  );
}