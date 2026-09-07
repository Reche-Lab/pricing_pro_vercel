import { describe, expect, it } from "vitest";
import { extendArtworkEdges } from "@/domain/artwork/edge-extension";
import { retouchDraftSchema } from "@/services/artwork/retouch-draft";
import { DEFAULT_RETOUCH_ADJUSTMENTS, DEFAULT_RETOUCH_COMPOSITION } from "@/domain/artwork/retouch";

describe("artwork edge continuation", () => {
  it("continues a diagonal linear gradient without rescaling its original pixels", () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      pixels.set([80 + x * 5 + y * 3, 100, 160, 255], (y * 8 + x) * 4);
    }
    const result = extendArtworkEdges(pixels, 8, 8, 2);
    expect(result.width).toBe(12);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      expect(Array.from(result.pixels.slice((y * 12 + x) * 4, (y * 12 + x) * 4 + 4)))
        .toEqual([80 + (x - 2) * 5 + (y - 2) * 3, 100, 160, 255]);
    }
    expect(pixels[0]).toBe(80);
  });
  it("clamps colors and does not invent opaque content at transparent borders", () => {
    const pixels = new Uint8ClampedArray([0,0,0,0, 255,255,255,255, 0,0,0,0, 255,255,255,255]);
    const result = extendArtworkEdges(pixels, 2, 2, 2);
    expect(result.pixels[3]).toBe(0);
    expect(result.pixels[5 * 4]).toBe(255);
    expect(() => extendArtworkEdges(pixels, 0, 2, 2)).toThrow();
    expect(() => extendArtworkEdges(pixels, 2, 2, 50000)).toThrow();
  });
  it("round-trips incorporated stages in existing drafts without raster data or recursion", () => {
    const stage = { operations: [], adjustments: DEFAULT_RETOUCH_ADJUSTMENTS,
      composition: { ...DEFAULT_RETOUCH_COMPOSITION, backgroundMode: "extend" }, cut: true };
    const draft = { version: 1, ...stage, stages: [stage, { ...stage, cut: false }] };
    expect(retouchDraftSchema.parse(draft).stages).toHaveLength(2);
    expect(retouchDraftSchema.safeParse({ ...draft, stages: Array(33).fill(stage) }).success).toBe(false);
    expect(retouchDraftSchema.safeParse({ ...draft, composition: { ...stage.composition, backgroundMode: "unknown" } }).success).toBe(false);
  });
});
