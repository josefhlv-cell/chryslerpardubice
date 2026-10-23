import { describe, expect, it } from "vitest";
import { epcSelectionReady, inSchedulePeriod, maintenanceStatus, requireSaved, savedItemIndexes, withPhotos } from "@/lib/practicalReliability";

describe("Practical audit reliability", () => {
  it("rejects a resolved API error instead of declaring success", () => {
    expect(() => requireSaved({ data: null, error: new Error("denied") })).toThrow("denied");
    expect(() => requireSaved({ data: null, error: null })).toThrow();
    expect(requireSaved({ data: { id: "persisted" }, error: null }).id).toBe("persisted");
  });
  it("retains failed cart items after partial submission", () => {
    expect(savedItemIndexes([{ status: "fulfilled", value: { id: "one" } }, { status: "rejected", reason: "offline" }, { status: "fulfilled", value: { id: "three" } }])).toEqual([0, 2]);
  });
  it("keeps incomplete EPC selection open", () => {
    expect(epcSelectionReady("Chrysler", "", "", "")).toBe(false);
    expect(epcSelectionReady("Chrysler", "300C", "2014", "3.6L V6")).toBe(true);
  });
  it("filters schedule by the chosen day and Monday to Sunday week", () => {
    const sunday = new Date(2026, 9, 25, 12);
    expect(inSchedulePeriod(new Date(2026, 9, 19).toISOString(), sunday, "week")).toBe(true);
    expect(inSchedulePeriod(new Date(2026, 9, 26).toISOString(), sunday, "week")).toBe(false);
    expect(inSchedulePeriod(new Date(2026, 9, 24).toISOString(), sunday, "day")).toBe(false);
    expect(inSchedulePeriod(null, sunday, "week")).toBe(false);
  });
  it("marks time-based maintenance overdue even below kilometre limit", () => {
    expect(maintenanceStatus({ interval_km: 15000, interval_months: 12, last_service_km: 100000, last_service_date: "2025-01-01" }, 101000, new Date("2026-02-01")).color).toBe("destructive");
  });
  it("does not invent maintenance history", () => {
    const result = maintenanceStatus({ interval_km: 15000, interval_months: 12, last_service_km: null, last_service_date: null }, null);
    expect(result.missing).toBe(true);
    expect(result.urgent).toBe(false);
  });
  it("passes actual image parts without replacing chat history", () => {
    const messages = [{ role: "assistant", content: "Historie" }, { role: "user", content: "Závada" }];
    const output = withPhotos(messages, ["https://example.test/photo.jpg"]);
    expect(output[0]).toEqual(messages[0]);
    expect(output[1].content).toEqual([{ type: "text", text: "Závada" }, { type: "image_url", image_url: { url: "https://example.test/photo.jpg" } }]);
  });
});