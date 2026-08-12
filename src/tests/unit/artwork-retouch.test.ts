import { describe, expect, it } from "vitest";
import { createRetouchedArtworkFileName, createRetouchShape, findContiguousColorRegion, normalizeSelection, sampledRgbToHex } from "@/domain/artwork/retouch";
import { retouchDraftSchema } from "@/services/artwork/retouch-draft";

describe("artwork retouch", () => {
  it("creates a safe and traceable file name without replacing the original extension", () => {
    expect(createRetouchedArtworkFileName("Arte São João.final.PNG", 123456))
      .toBe("Arte-Sao-Joao-final-retoque-123456.webp");
  });

  it("converts a sampled canvas color to a bounded hexadecimal color", () => {
    expect(sampledRgbToHex(12, 128, 255)).toBe("#0c80ff");
    expect(sampledRgbToHex(-10, 260, 15.7)).toBe("#00ff10");
  });

  it("finds only a connected color region within the configured tolerance", () => {
    const pixels = new Uint8ClampedArray([
      10, 10, 10, 255, 12, 12, 12, 255, 240, 240, 240, 255,
      11, 11, 11, 255, 200, 200, 200, 255, 241, 241, 241, 255
    ]);
    expect([...findContiguousColorRegion({ pixels, width: 3, height: 2, startX: 0, startY: 0, tolerance: 3 })])
      .toEqual([1, 1, 0, 1, 0, 0]);
  });

  it("limits fills to a normalized rectangular selection", () => {
    const pixels = new Uint8ClampedArray(3 * 2 * 4).fill(20);
    expect([...findContiguousColorRegion({
      pixels, width: 3, height: 2, startX: 1, startY: 0, tolerance: 0,
      selection: { x: 2, y: 2, width: -2, height: -2 }
    })]).toEqual([1, 1, 0, 1, 1, 0]);
    expect(normalizeSelection({ x: 10, y: 8, width: -4, height: -3 })).toEqual({ x: 6, y: 5, width: 4, height: 3 });
  });

  it("validates persisted non-destructive drafts and rejects unsafe values", () => {
    const draft = {
      version: 1,
      operations: [{ kind: "fill", point: { x: 10, y: 20 }, color: "#102030", tolerance: 18 }],
      adjustments: { brightness: 100, contrast: 100, saturation: 100, sharpness: 0 }
    };
    expect(retouchDraftSchema.safeParse(draft).success).toBe(true);
    expect(retouchDraftSchema.safeParse({ ...draft, adjustments: { ...draft.adjustments, sharpness: 999 } }).success).toBe(false);
  });

  it("creates proportional hollow circles and squares in every drag direction", () => {
    expect(createRetouchShape({ shapeType: "circle", start: { x: 100, y: 80 }, end: { x: 40, y: 30 }, color: "#ffffff", width: 12 }).bounds)
      .toEqual({ x: 40, y: 20, width: 60, height: 60 });
    expect(createRetouchShape({ shapeType: "square", start: { x: 10, y: 10 }, end: { x: 40, y: 70 }, color: "#ffffff", width: 8 }).bounds)
      .toEqual({ x: 10, y: 10, width: 60, height: 60 });
  });

  it("validates hollow geometric shapes in persisted drafts", () => {
    const shape = createRetouchShape({ shapeType: "triangle", start: { x: 10, y: 20 }, end: { x: 110, y: 90 }, color: "#abcdef", width: 16 });
    const draft = { version: 1, operations: [shape], adjustments: { brightness: 100, contrast: 100, saturation: 100, sharpness: 0 } };
    expect(retouchDraftSchema.safeParse(draft).success).toBe(true);
  });
});
