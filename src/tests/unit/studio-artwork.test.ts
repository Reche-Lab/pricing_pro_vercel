import { describe, expect, it } from "vitest";
import { layoutStudioText, studioGradientColor, studioTextBounds, type TextMeasure } from "@/domain/commerce/studio-artwork";
const measure: TextMeasure = (text, size) => Array.from(text).length * size * .56;
const bounds = { x: 120, y: 120, width: 400, height: 400 };
describe("studio artwork composition", () => {
  it("wraps a long message into multiple centered lines inside the circular safety boundary", () => {
    const result = layoutStudioText({ text: "Minha marca faz parte dos melhores momentos da sua vida", mode: "centered", bounds, measure });
    expect(result.fontSize).toBeGreaterThanOrEqual(24);
    expect(new Set(result.glyphs.map(glyph => glyph.y)).size).toBeGreaterThan(2);
    expect(result.truncated).toBe(false);
    for (const glyph of result.glyphs) {
      const rx = bounds.width / 2, ry = bounds.height / 2;
      for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
        expect(((glyph.x + dx * glyph.width / 2 - 320) / rx) ** 2 + ((glyph.y + dy * result.fontSize * .62 - 320) / ry) ** 2).toBeLessThanOrEqual(1.001);
      }
    }
  });
  it("honors manual line breaks and never drops long words or accents", () => {
    const result = layoutStudioText({ text: "São Paulo\nExtraordinariamente", mode: "centered", bounds, measure });
    expect(result.glyphs.map(glyph => glyph.text).join("").replaceAll(" ", "")).toBe("SãoPauloExtraordinariamente");
    expect(new Set(result.glyphs.map(glyph => glyph.y)).size).toBeGreaterThan(1);
  });
  it("places circular lettering near the edge without overlap or truncation", () => {
    const result = layoutStudioText({ text: "Celebre cada conquista", mode: "circle", bounds, measure });
    expect(result.glyphs).toHaveLength(Array.from("Celebre cada conquista").length);
    for (const glyph of result.glyphs) expect(Math.hypot(glyph.x - 320, glyph.y - 320)).toBeLessThan(200 - result.fontSize / 2);
    expect(result.glyphs[0].rotation).not.toBe(result.glyphs.at(-1)?.rotation);
  });
  it("starts spiral lettering near the center and continues outward", () => {
    const result = layoutStudioText({ text: "Uma ideia que cresce e transforma o seu mundo", mode: "spiral", bounds, measure });
    const radius = (index: number) => Math.hypot(result.glyphs[index].x - 320, result.glyphs[index].y - 320);
    expect(result.truncated).toBe(false);
    expect(radius(0)).toBeLessThan(radius(result.glyphs.length - 1));
    expect(result.glyphs).toHaveLength(Array.from("Uma ideia que cresce e transforma o seu mundo").length);
  });
  it("derives safe text bounds from the same cut geometry as the final mockup", () => {
    const geometry = { shape: "circle" as const, widthMm: 53, heightMm: 53, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true };
    const result = studioTextBounds(geometry, { safeMarginMm: 1.5, bleedMm: 2 }, 640);
    expect(result.width).toBeCloseTo(640 * 53 / 60 * .94);
    expect(result.x + result.width / 2).toBe(320);
  });
  it("interpolates one to four colors and produces a seamless spiral palette", () => {
    expect(studioGradientColor(["#226d5c"], .8)).toEqual([34, 109, 92]);
    expect(studioGradientColor(["#000000", "#ffffff"], .5)).toEqual([128, 128, 128]);
    expect(studioGradientColor(["#112233", "#ff6655", "#00ff00", "#ffff00"], 0, true)).toEqual(studioGradientColor(["#112233", "#ff6655", "#00ff00", "#ffff00"], 1, true));
  });
});
