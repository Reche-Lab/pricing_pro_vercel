import { describe, expect, it } from "vitest";
import { calculateCenteredLayerBounds, createRetouchedArtworkFileName, createRetouchShape, findContiguousColorRegion, moveRetouchShape, normalizeSelection, resizeRetouchShape, sampledRgbToHex } from "@/domain/artwork/retouch";
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

  it("moves and resizes an editable shape without rasterizing it", () => {
    const shape = createRetouchShape({ shapeType: "rectangle", start: { x: 10, y: 20 }, end: { x: 110, y: 80 }, color: "#ffffff", width: 10 });
    expect(moveRetouchShape(shape, 15, -5).bounds).toEqual({ x: 25, y: 15, width: 100, height: 60 });
    expect(resizeRetouchShape(shape, "se", { x: 160, y: 120 }).bounds).toEqual({ x: 10, y: 20, width: 150, height: 100 });
  });

  it("preserves proportions while resizing circles", () => {
    const circle = createRetouchShape({ shapeType: "circle", start: { x: 20, y: 20 }, end: { x: 80, y: 80 }, color: "#ffffff", width: 6 });
    expect(resizeRetouchShape(circle, "se", { x: 120, y: 70 }).bounds).toEqual({ x: 20, y: 20, width: 100, height: 100 });
  });

  it("centers and expands a duplicated background independently from the main artwork", () => {
    expect(calculateCenteredLayerBounds({ canvasWidth: 1400, canvasHeight: 1000, sourceWidth: 1000, sourceHeight: 600, scalePercent: 110, expansionPx: 30 }))
      .toEqual({ x: 120, y: 140, width: 1160, height: 720 });
    expect(calculateCenteredLayerBounds({ canvasWidth: 1400, canvasHeight: 1000, sourceWidth: 1000, sourceHeight: 600, scalePercent: 80 }))
      .toEqual({ x: 300, y: 260, width: 800, height: 480 });
  });

  it("accepts persisted image composition and rejects unsafe scales", () => {
    const draft = {
      version: 1,
      operations: [],
      adjustments: { brightness: 100, contrast: 100, saturation: 100, sharpness: 0 },
      composition: { foregroundScalePercent: 90, backgroundEnabled: true, backgroundExpansionMm: 4, backgroundScalePercent: 115, backgroundBlurPx: 8 }
    };
    expect(retouchDraftSchema.safeParse(draft).success).toBe(true);
    expect(retouchDraftSchema.safeParse({ ...draft, composition: { ...draft.composition, foregroundScalePercent: 500 } }).success).toBe(false);
  });
});
