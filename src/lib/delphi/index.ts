export * from "./types";
export * from "./catalog-loader";
export * from "./decoder";
export * from "./runner";
export * from "./vehicleProfiles";
export * from "./transport";
export * from "./i18n";

export function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) =>
    a.localeCompare(b, "cs")
  );
}

export const COMMON_VEHICLE_MAKES = [
  "Volkswagen",
  "Škoda",
  "Audi",
  "Seat",
  "Cupra",
  "Porsche",
  "Bentley",
  "Lamborghini",
  "Bugatti",
  "Chrysler",
  "Dodge",
  "Jeep",
  "RAM",
  "Fiat",
  "Alfa Romeo",
  "Lancia"
];