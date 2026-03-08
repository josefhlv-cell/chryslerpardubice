/**
 * CarIcon – displays a real car image based on brand/model/year.
 * Uses cdn.imagin.studio free tier for photorealistic renders.
 * Falls back to generic body-type SVG silhouettes.
 */

import { useState, memo } from "react";
import { cn } from "@/lib/utils";

type CarData = {
  brand: string;
  model: string;
  year?: number | null;
  vin?: string | null;
};

type CarIconProps = {
  car: CarData;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeMap = {
  sm: "w-16 h-10",
  md: "w-20 h-[50px]",
  lg: "w-28 h-[70px]",
};

// Normalize brand names for the imagin API
const normalizeBrand = (brand: string): string => {
  const map: Record<string, string> = {
    "CHRYSLER": "chrysler",
    "DODGE": "dodge",
    "RAM": "ram",
    "JEEP": "jeep",
    "FIAT": "fiat",
    "ALFA ROMEO": "alfa-romeo",
    "VOLKSWAGEN": "volkswagen",
    "MERCEDES-BENZ": "mercedes-benz",
    "BMW": "bmw",
    "AUDI": "audi",
    "TOYOTA": "toyota",
    "HONDA": "honda",
    "FORD": "ford",
    "CHEVROLET": "chevrolet",
    "HYUNDAI": "hyundai",
    "KIA": "kia",
    "NISSAN": "nissan",
    "MAZDA": "mazda",
    "SUBARU": "subaru",
    "VOLVO": "volvo",
    "PEUGEOT": "peugeot",
    "RENAULT": "renault",
    "SKODA": "skoda",
    "ŠKODA": "skoda",
    "CITROËN": "citroen",
    "CITROEN": "citroen",
    "OPEL": "opel",
    "SEAT": "seat",
    "LAND ROVER": "land-rover",
    "MINI": "mini",
    "PORSCHE": "porsche",
    "TESLA": "tesla",
    "LEXUS": "lexus",
    "INFINITI": "infiniti",
    "ACURA": "acura",
    "LINCOLN": "lincoln",
    "CADILLAC": "cadillac",
    "BUICK": "buick",
    "GMC": "gmc",
  };
  const upper = brand.trim().toUpperCase();
  return map[upper] || brand.trim().toLowerCase().replace(/\s+/g, "-");
};

const normalizeModel = (model: string): string =>
  model.trim().toLowerCase().replace(/\s+/g, "-");

// Simple in-memory cache for failed URLs to avoid re-fetching
const failedUrls = new Set<string>();

// Detect likely body type from model name for fallback SVG
const detectBodyType = (brand: string, model: string): "suv" | "sedan" | "van" | "truck" | "hatchback" => {
  const combined = `${brand} ${model}`.toLowerCase();
  if (/durango|cherokee|wrangler|compass|renegade|patriot|rav4|cr-v|x5|x3|q[357]|tucson|sportage|tiguan|kodiaq|karoq|outlander|land rover|range|tahoe|suburban|escalade|explorer|4runner|highlander|pilot|traverse/i.test(combined)) return "suv";
  if (/pacifica|grand caravan|town.country|voyager|caravan|carnival|sharan|touran|transit|sienna|odyssey/i.test(combined)) return "van";
  if (/ram|silverado|f-150|f150|tundra|tacoma|ranger|colorado|frontier|titan|gladiator|maverick|ridgeline/i.test(combined)) return "truck";
  if (/polo|golf|fabia|ibiza|clio|fiesta|corsa|yaris|fit|swift|i[23]0|rio|micra|note|jazz|punto/i.test(combined)) return "hatchback";
  return "sedan";
};

// Inline SVG fallbacks by body type
const FallbackSvg = ({ type, alt }: { type: ReturnType<typeof detectBodyType>; alt: string }) => {
  const paths: Record<string, string> = {
    sedan: "M5 18 L5 14 L8 10 L14 8 L22 8 L28 10 L31 14 L31 18 Z M8 18 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M24 18 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0",
    suv: "M4 18 L4 12 L7 8 L13 6 L23 6 L29 8 L32 12 L32 18 Z M7 18 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 M24 18 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0",
    van: "M3 18 L3 10 L6 6 L14 5 L28 5 L32 8 L32 18 Z M7 18 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 M24 18 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0",
    truck: "M3 18 L3 12 L6 8 L14 7 L18 7 L18 10 L32 10 L32 18 Z M7 18 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 M24 18 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0",
    hatchback: "M5 18 L5 14 L8 10 L13 7 L21 7 L27 10 L30 14 L30 18 Z M8 18 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M23 18 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0",
  };

  return (
    <svg viewBox="0 4 36 18" className="w-full h-full" aria-label={alt}>
      <path d={paths[type]} fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.3" />
    </svg>
  );
};

const getImageUrl = (car: CarData): string => {
  const brand = normalizeBrand(car.brand);
  const model = normalizeModel(car.model);
  const year = car.year || new Date().getFullYear();
  // cdn.imagin.studio free angle=01, width=400
  return `https://cdn.imagin.studio/getimage?customer=hrjavascript-masede&make=${brand}&modelFamily=${model}&modelYear=${year}&angle=01&width=400`;
};

const CarIcon = memo(({ car, size = "md", className }: CarIconProps) => {
  const url = getImageUrl(car);
  const alreadyFailed = failedUrls.has(url);
  const [failed, setFailed] = useState(alreadyFailed);
  const alt = `${car.brand} ${car.model} ${car.year || ""}`.trim();
  const bodyType = detectBodyType(car.brand, car.model);

  if (failed) {
    return (
      <div
        className={cn(
          sizeMap[size],
          "flex items-center justify-center rounded-lg bg-muted/50 text-muted-foreground shrink-0",
          className
        )}
        title={alt}
      >
        <FallbackSvg type={bodyType} alt={alt} />
      </div>
    );
  }

  return (
    <div className={cn(sizeMap[size], "rounded-lg overflow-hidden bg-muted/30 shrink-0", className)} title={alt}>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="w-full h-full object-contain"
        onError={() => {
          failedUrls.add(url);
          setFailed(true);
        }}
      />
    </div>
  );
});

CarIcon.displayName = "CarIcon";

export default CarIcon;
