/**
 * CarIcon – displays a real car image based on brand/model/year.
 * Uses multiple image sources with intelligent fallback:
 * 1. cdn.imagin.studio with verified model mappings
 * 2. Generic SVG silhouettes by body type
 */

import { useState, memo, useRef, useEffect } from "react";
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

// Imagin.studio modelFamily mappings — must match their database exactly
const modelMap: Record<string, string> = {
  "grand caravan": "caravan",
  "grand cherokee": "grand+cherokee",
  "town & country": "town+%26+country",
  "town country": "town+%26+country",
  "town&country": "town+%26+country",
  "300c": "300",
  "300s": "300",
  "300 c": "300",
  "300 s": "300",
  "pacifica": "pacifica",
  "durango": "durango",
  "challenger": "challenger",
  "charger": "charger",
  "wrangler": "wrangler",
  "compass": "compass",
  "renegade": "renegade",
  "cherokee": "cherokee",
  "1500": "1500",
  "2500": "2500",
  "3500": "3500",
};

const normalizeModel = (model: string): string => {
  const lower = model.trim().toLowerCase();
  if (modelMap[lower]) return modelMap[lower];
  // Try partial matches
  for (const [key, val] of Object.entries(modelMap)) {
    if (lower.includes(key)) return val;
  }
  return encodeURIComponent(lower);
};

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

// Cache for failed URLs
const failedUrls = new Set<string>();

// Build multiple image source URLs to try in order
const getImageUrls = (car: CarData): string[] => {
  const brand = normalizeBrand(car.brand);
  const model = normalizeModel(car.model);
  const year = car.year || new Date().getFullYear();
  const rawModel = car.model.trim().replace(/\s+/g, "+");
  const rawBrand = car.brand.trim().replace(/\s+/g, "+");
  
  return [
    // Primary: imagin.studio
    `https://cdn.imagin.studio/getimage?customer=hrjavascript-masede&make=${brand}&modelFamily=${model}&modelYear=${year}&angle=01&width=400`,
    // Fallback: try with raw model name
    `https://cdn.imagin.studio/getimage?customer=hrjavascript-masede&make=${brand}&modelFamily=${rawModel}&modelYear=${year}&angle=01&width=400`,
  ];
};

const CarIcon = memo(({ car, size = "md", className }: CarIconProps) => {
  const urls = getImageUrls(car);
  const [urlIndex, setUrlIndex] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const alt = `${car.brand} ${car.model} ${car.year || ""}`.trim();
  const bodyType = detectBodyType(car.brand, car.model);

  // Check if all URLs are already known to fail
  useEffect(() => {
    if (urls.every(u => failedUrls.has(u))) {
      setShowFallback(true);
    }
  }, []);

  const currentUrl = urls[urlIndex];

  const handleError = () => {
    failedUrls.add(currentUrl);
    if (urlIndex < urls.length - 1) {
      setUrlIndex(urlIndex + 1);
    } else {
      setShowFallback(true);
    }
  };

  // Detect covered car by checking naturalWidth — covered car images are often 1x1 or very small
  const handleLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    // If image is suspiciously small (< 10px), it's likely a placeholder
    if (img.naturalWidth < 10 || img.naturalHeight < 10) {
      handleError();
    }
  };

  if (showFallback) {
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
        ref={imgRef}
        src={currentUrl}
        alt={alt}
        loading="lazy"
        className="w-full h-full object-contain"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
});

CarIcon.displayName = "CarIcon";

export default CarIcon;
