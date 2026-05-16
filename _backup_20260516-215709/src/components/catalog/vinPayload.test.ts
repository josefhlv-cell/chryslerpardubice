import { describe, it, expect } from "vitest";
import {
  parseVinPayload,
  normalizeBrand,
  normalizeModel,
  deriveEngineLabel,
} from "./vinPayload";

describe("normalizeBrand", () => {
  it("title-cases UPPERCASE NHTSA brands", () => {
    expect(normalizeBrand("CHRYSLER")).toBe("Chrysler");
    expect(normalizeBrand("dodge")).toBe("Dodge");
    expect(normalizeBrand("CADILLAC")).toBe("Cadillac");
  });

  it("keeps RAM/GMC fully uppercase", () => {
    expect(normalizeBrand("ram")).toBe("RAM");
    expect(normalizeBrand("Ram")).toBe("RAM");
    expect(normalizeBrand("gmc")).toBe("GMC");
  });

  it("returns empty string for nullish input", () => {
    expect(normalizeBrand(null)).toBe("");
    expect(normalizeBrand(undefined)).toBe("");
    expect(normalizeBrand("   ")).toBe("");
  });
});

describe("normalizeModel", () => {
  it("title-cases multi-word models", () => {
    expect(normalizeModel("GRAND VOYAGER")).toBe("Grand Voyager");
    expect(normalizeModel("town & country")).toBe("Town & Country");
    expect(normalizeModel("PACIFICA")).toBe("Pacifica");
  });
});

describe("deriveEngineLabel", () => {
  it("prefers enriched.engine_label", () => {
    expect(
      deriveEngineLabel(
        { engine_displacement: "3.6L", fuel_type: "Gasoline" },
        { engine_label: "3.6L Pentastar V6" },
      ),
    ).toBe("3.6L Pentastar V6");
  });

  it("falls back to basic.engine_label", () => {
    expect(
      deriveEngineLabel({ engine_label: "2.8L CRD" }, {}),
    ).toBe("2.8L CRD");
  });

  it("composes displacement + CRD for diesels", () => {
    expect(
      deriveEngineLabel(
        { engine_displacement: "2.8L", fuel_type: "Diesel" },
        {},
      ),
    ).toBe("2.8L CRD");
  });

  it("returns just displacement for petrol", () => {
    expect(
      deriveEngineLabel(
        { engine_displacement: "3.8L", fuel_type: "Gasoline" },
        {},
      ),
    ).toBe("3.8L");
  });

  it("returns undefined when no engine info", () => {
    expect(deriveEngineLabel({}, {})).toBeUndefined();
  });
});

describe("parseVinPayload", () => {
  it("parses canonical {basic, enriched} payload from edge fn", () => {
    const result = parseVinPayload({
      success: true,
      basic: {
        brand: "CHRYSLER",
        model: "GRAND VOYAGER",
        engine_displacement: "2.8L",
        fuel_type: "Diesel",
      },
      enriched: { engine_label: "2.8L CRD 163 hp" },
    });
    expect(result).toEqual({
      ok: true,
      brand: "Chrysler",
      model: "Grand Voyager",
      engine: "2.8L CRD 163 hp",
    });
  });

  it("unwraps {data: ...} wrapper", () => {
    const result = parseVinPayload({
      data: {
        basic: { brand: "DODGE", model: "RAM 1500" },
        enriched: {},
      },
    });
    expect(result.ok).toBe(true);
    expect(result.brand).toBe("Dodge");
    expect(result.model).toBe("Ram 1500");
  });

  it("derives engine from basic when enriched is missing", () => {
    const result = parseVinPayload({
      basic: {
        brand: "Chrysler",
        model: "Pacifica",
        engine_displacement: "3.6L",
        fuel_type: "Gasoline",
      },
    });
    expect(result.ok).toBe(true);
    expect(result.engine).toBe("3.6L");
  });

  it("returns ok:false with Czech error when brand/model missing", () => {
    const result = parseVinPayload({ basic: { brand: "", model: "" } });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nepodařilo dekódovat/i);
  });

  it("returns ok:false when edge fn signals success:false", () => {
    const result = parseVinPayload({
      success: false,
      error: "VIN not recognized by NHTSA",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("VIN not recognized by NHTSA");
  });

  it("handles flat (non-wrapped) payloads", () => {
    const result = parseVinPayload({
      brand: "RAM",
      model: "1500",
    });
    expect(result.ok).toBe(true);
    expect(result.brand).toBe("RAM");
    expect(result.model).toBe("1500");
  });

  it("never throws on garbage input", () => {
    expect(() => parseVinPayload(null)).not.toThrow();
    expect(() => parseVinPayload(undefined)).not.toThrow();
    expect(() => parseVinPayload("nonsense")).not.toThrow();
    expect(parseVinPayload(null).ok).toBe(false);
  });

  it("uses `make` as fallback for brand", () => {
    const result = parseVinPayload({
      basic: { make: "CHRYSLER", model: "300" },
    });
    expect(result.brand).toBe("Chrysler");
    expect(result.model).toBe("300");
  });
});
