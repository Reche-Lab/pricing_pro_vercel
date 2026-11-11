import { describe, expect, it } from "vitest";
import { productionDays, deliveryEstimate, productionSettingsSchema } from "@/domain/shipping/production-lead-time";
import { artworkLimit, distributeQuantity } from "@/domain/commerce/commerce";

describe("production lead time", () => {
  it.each([[1,3],[300,3],[301,4],[500,5]])("%s units need %s business days", (quantity, days) => {
    expect(productionDays(quantity)).toBe(days);
  });
  it("uses tenant capacity and minimum", () => expect(productionDays(401, { minimumDays: 2, unitsPerDay: 200, holidays: [] })).toBe(3));
  it("skips weekends and tenant holidays in Sao Paulo", () => {
    const result = deliveryEstimate(301, 2, { minimumDays: 3, unitsPerDay: 100, holidays: ["2026-11-16"] }, "2026-11-13");
    expect(result.productionDays).toBe(4);
    expect(result.productionReadyDate).toBe("2026-11-20");
    expect(result.deliveryDate).toBe("2026-11-24");
  });
  it("does not invent a delivery date without a carrier deadline", () => expect(deliveryEstimate(10, null, undefined, "2026-11-11").deliveryDate).toBeNull());
  it("validates calendar dates and bounded capacity", () => {
    expect(productionSettingsSchema.safeParse({ minimumDays: 0, unitsPerDay: 0, holidays: [] }).success).toBe(false);
    expect(productionSettingsSchema.safeParse({ minimumDays: 3, unitsPerDay: 100, holidays: ["2026-02-31"] }).success).toBe(false);
  });
});
describe("artwork limits", () => {
  it("uses the smallest cap", () => { expect(artworkLimit(5, 10)).toBe(5); expect(artworkLimit(20, 20)).toBe(10); expect(artworkLimit(20, 3)).toBe(3); });
  it("rejects more artworks than units or ten", () => { expect(() => distributeQuantity(5,10)).toThrow(); expect(() => distributeQuantity(20,11)).toThrow(); });
});
