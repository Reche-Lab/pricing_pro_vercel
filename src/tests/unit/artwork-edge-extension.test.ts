import { describe, expect, it } from "vitest";
import { extendArtworkEdges, requiredArtworkEdgePadding } from "@/domain/artwork/edge-extension";
import { artworkContour } from "@/domain/artwork/artwork-contour";
import { retouchDraftSchema } from "@/services/artwork/retouch-draft";
import { DEFAULT_RETOUCH_ADJUSTMENTS, DEFAULT_RETOUCH_COMPOSITION } from "@/domain/artwork/retouch";

describe("artwork edge continuation", () => {
  it("finds exact distances to irregularly distributed visible pixels", () => {
    const pixels = new Uint8ClampedArray(11 * 9 * 4);
    const seeds = [[0, 0], [8, 1], [3, 7], [8, 8], [2, 4]];
    seeds.forEach(([x, y]) => { pixels[(y * 11 + x) * 4 + 3] = 255; });
    const field = artworkContour(pixels, 11, 9);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 11; x++) {
      expect(field.distance[y * 11 + x]).toBe(Math.min(...seeds.map(([sx, sy]) => (x - sx) ** 2 + (y - sy) ** 2)));
      expect(pixels[field.nearest[y * 11 + x] * 4 + 3]).toBe(255);
    }
  });
  it("continues a diagonal linear gradient without rescaling its original pixels", () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      pixels.set([80 + x * 5 + y * 3, 100, 160, 255], (y * 8 + x) * 4);
    }
    const result = extendArtworkEdges(pixels, 8, 8, 2);
    expect(result.width).toBe(12);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const dx = Math.max(2 - x, x - 9, 0), dy = Math.max(2 - y, y - 9, 0);
      if (Math.hypot(dx, dy) > 2) continue;
      expect(Array.from(result.pixels.slice((y * 12 + x) * 4, (y * 12 + x) * 4 + 4)))
        .toEqual([80 + (x - 2) * 5 + (y - 2) * 3, 100, 160, 255]);
    }
    expect(pixels[0]).toBe(80);
  });
  it("clamps colors and rejects invalid dimensions", () => {
    const pixels = new Uint8ClampedArray([0,0,0,0, 255,255,255,255, 0,0,0,0, 255,255,255,255]);
    const result = extendArtworkEdges(pixels, 2, 2, 2);
    expect(result.pixels[3]).toBe(0); // Beyond the requested distance from the visible column.
    expect(result.pixels[(2 * 6 + 5) * 4]).toBe(255);
    expect(() => extendArtworkEdges(pixels, 0, 2, 2)).toThrow();
    expect(() => extendArtworkEdges(pixels, 2, 2, 50000)).toThrow();
  });
  it("extends below a non-square artwork with uneven transparent file margins", () => {
    const pixels = new Uint8ClampedArray(30 * 20 * 4);
    for (let y = 2; y <= 10; y++) for (let x = 3; x <= 26; x++) {
      pixels.set([60 + x * 2 + y * 3, 100, 120, 255], (y * 30 + x) * 4);
    }
    const result = extendArtworkEdges(pixels, 30, 20, 4);
    for (const [x, y] of [[15, 14], [15, -2], [-1, 6], [30, 6]]) {
      const index = ((y + 4) * result.width + x + 4) * 4;
      expect(Array.from(result.pixels.slice(index, index + 4))).toEqual([60 + x * 2 + y * 3, 100, 120, 255]);
    }
  });
  it("follows every angle of a circular contour and retains original pixels", () => {
    const pixels = new Uint8ClampedArray(60 * 50 * 4);
    for (let y = 0; y < 50; y++) for (let x = 0; x < 60; x++) {
      if (Math.hypot(x - 30, y - 25) <= 15) pixels.set([70 + x + y, 140, 190, 255], (y * 60 + x) * 4);
    }
    const before = pixels.slice();
    const result = extendArtworkEdges(pixels, 60, 50, 6);
    for (let angle = 0; angle < 360; angle += 15) {
      const x = Math.round(30 + 19 * Math.cos(angle * Math.PI / 180));
      const y = Math.round(25 + 19 * Math.sin(angle * Math.PI / 180));
      const offset = ((y + 6) * result.width + x + 6) * 4;
      expect(Array.from(result.pixels.slice(offset, offset + 4))).toEqual([70 + x + y, 140, 190, 255]);
    }
    expect(pixels).toEqual(before);
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]) {
      const x = (i / 4) % 60, y = Math.floor(i / 4 / 60), offset = ((y + 6) * result.width + x + 6) * 4;
      expect(Array.from(result.pixels.slice(offset, offset + 4))).toEqual(Array.from(pixels.slice(i, i + 4)));
    }
  });
  it("preserves enclosed transparent holes and handles empty and translucent artwork", () => {
    const pixels = new Uint8ClampedArray(9 * 9 * 4);
    for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) {
      if (x === 2 || x === 6 || y === 2 || y === 6) pixels.set([90,120,180,80], (y * 9 + x) * 4);
    }
    const result = extendArtworkEdges(pixels, 9, 9, 2);
    expect(result.pixels[((4 + 2) * 13 + 4 + 2) * 4 + 3]).toBe(0);
    expect(result.pixels[((4 + 2) * 13 + 0 + 2) * 4 + 3]).toBe(80);
    expect(extendArtworkEdges(new Uint8ClampedArray(16), 2, 2, 3).pixels.every(value => value === 0)).toBe(true);
  });
  it("calculates the automatic extent from visible pixels, not the file rectangle", () => {
    const source = new Uint8ClampedArray(20 * 20 * 4), target = source.slice();
    source.set([80,120,160,255], (10 * 20 + 10) * 4);
    target.set([255,255,255,255], (14 * 20 + 13) * 4);
    expect(requiredArtworkEdgePadding(source, 20, 20, target)).toBe(5);
    expect(() => requiredArtworkEdgePadding(new Uint8ClampedArray(1600), 20, 20, target)).toThrow();
  });
  it("fills behind antialiased curved edges without duplicating the opaque foreground", () => {
    const pixels = new Uint8ClampedArray(30 * 30 * 4);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
      const radius = Math.hypot(x - 15, y - 15);
      if (radius <= 10) pixels.set([25,173,130,radius < 9 ? 255 : 110], (y * 30 + x) * 4);
    }
    const result = extendArtworkEdges(pixels, 30, 30, 4, { backgroundOnly: true });
    expect(result.pixels[((15 + 4) * result.width + 15 + 4) * 4 + 3]).toBe(0);
    const fringe = ((15 + 4) * result.width + 25 + 4) * 4;
    expect(Array.from(result.pixels.slice(fringe, fringe + 4))).toEqual([25,173,130,255]);
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
