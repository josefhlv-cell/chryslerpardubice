import React from "react";

interface BrandIconProps {
  brand: string;
  className?: string;
  size?: number;
  isSelected?: boolean;
}

const BRAND_LOGO_MAP: Record<string, string> = {
  Chrysler: "/brands/Chrysler.svg",
  Dodge: "/brands/dodge.svg",
  RAM: "/brands/ram.svg",
  Lancia: "/brands/lancia.svg",
};

/**
 * BrandIcon — Displays brand logos as SVG images
 * Maps brand names to their corresponding SVG files from /brands/
 * Supports size variants and selection styling
 */
export const BrandIcon: React.FC<BrandIconProps> = ({
  brand,
  className = "",
  size = 56,
  isSelected = false,
}) => {
  const logoPath = BRAND_LOGO_MAP[brand];

  if (!logoPath) {
    return null;
  }

  return (
    <img
      src={logoPath}
      alt={`${brand} logo`}
      className={`
        transition-all duration-300 ease-out
        ${isSelected ? "scale-125 drop-shadow-lg" : "scale-100"}
        ${className}
      `}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: "contain",
      }}
    />
  );
};

export default BrandIcon;
