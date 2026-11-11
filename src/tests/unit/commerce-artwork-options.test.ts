import { describe, expect, it } from "vitest";
import { commerceArtworkOptionsSchema, defaultArtworkOptions, defaultMockup, mockupSourcePoint } from "@/domain/commerce/artwork-options";
describe("product mockup mapping", () => {
  it("keeps the face center centered and maps its edge to the visible contour", () => {
    const m = defaultMockup();
    expect(mockupSourcePoint(0, 0, "front", 0.8, m)).toEqual({ x: 0.5, y: 0.5 });
    expect(mockupSourcePoint(1, 0, "front", 0.8, m)?.x).toBeCloseTo(0.9);
  });
  it("continues the folded band on the back and mirrors its orientation", () => {
    const m = defaultMockup();
    const front = mockupSourcePoint(1, 0, "front", 0.8, m)!;
    const back = mockupSourcePoint(-1, 0, "back", 0.8, m)!;
    expect(front.x).toBeCloseTo(back.x);
    expect(mockupSourcePoint(m.backOpeningRatio, 0, "back", 0.8, m)?.x).toBeCloseTo(0);
    expect(mockupSourcePoint(0, 0, "back", 0.8, m)).toBeNull();
    expect(mockupSourcePoint(1.1, 0, "front", 0.8, m)).toBeNull();
  });
  it("validates safe image URLs and bounded calibration", () => {
    expect(commerceArtworkOptionsSchema.safeParse(defaultArtworkOptions()).success).toBe(true);
    const m = defaultMockup(); m.front.baseUrl = "javascript:alert(1)";
    expect(commerceArtworkOptionsSchema.safeParse({ ...defaultArtworkOptions(), mockup: m }).success).toBe(false);
    m.front.baseUrl = ""; m.front.x = 0.9;
    expect(commerceArtworkOptionsSchema.safeParse({ ...defaultArtworkOptions(), mockup: m }).success).toBe(false);
  });
});
