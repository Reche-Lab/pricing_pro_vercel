import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { calculatePrintGuideDimensions, createPrintGuideLayout, createShapePath, resolvePrintGeometry, resolvePrintMargins, validatePrintMargins } from "@/domain/artwork/geometry";
import { prepareArtwork } from "@/services/artwork/production";

describe("artwork print geometry", () => {
  it("keeps legacy diameters compatible with circular products", () => {
    expect(resolvePrintGeometry({ print_diameter_mm: 45 })).toMatchObject({ shape: "circle", widthMm: 45, heightMm: 45 });
  });

  it("normalizes square dimensions and rounded corners", () => {
    expect(resolvePrintGeometry({ print_shape: "square", print_width_mm: 50, print_height_mm: 80, print_corner_style: "rounded", print_corner_radius_mm: 4 })).toMatchObject({ shape: "square", widthMm: 50, heightMm: 50, cornerStyle: "rounded", cornerRadiusMm: 4 });
  });

  it("creates paths for every supported shape", () => {
    for (const shape of ["circle", "square", "rectangle", "triangle", "hexagon"] as const) {
      expect(createShapePath({ shape, width: 500, height: 350, cornerRadius: 18 })).toMatch(/^M /);
    }
  });

  it("resolves product print margins and preserves the prepared artwork snapshot", () => {
    expect(resolvePrintMargins({ print_bleed_mm: 3, print_safe_margin_mm: 2.5 })).toEqual({ bleedMm: 3, safeMarginMm: 2.5 });
    expect(resolvePrintMargins({ print_bleed_mm: 3, print_safe_margin_mm: 2.5, bleed_mm: 1.5, safe_margin_mm: 1 })).toEqual({ bleedMm: 1.5, safeMarginMm: 1 });
    expect(resolvePrintMargins({ print_bleed_mm: 0, print_safe_margin_mm: 0 })).toEqual({ bleedMm: 0, safeMarginMm: 0 });
  });

  it("calculates sangria and cut as per-side increments after the absolute safety size", () => {
    expect(calculatePrintGuideDimensions({ safeWidthMm: 41, safeHeightMm: 41, sangriaIncrementMm: 2, cutIncrementMm: 3 })).toEqual({
      safeWidthMm: 41,
      safeHeightMm: 41,
      sangriaWidthMm: 45,
      sangriaHeightMm: 45,
      cutWidthMm: 51,
      cutHeightMm: 51,
      sangriaIncrementMm: 2,
      cutIncrementMm: 3
    });
  });

  it("rejects a safe margin that consumes the finished cut area", () => {
    const geometry = resolvePrintGeometry({ print_shape: "circle", print_width_mm: 25, print_height_mm: 25 });
    expect(geometry && validatePrintMargins(geometry, { bleedMm: 2, safeMarginMm: 13 })).toContain("área útil");
    expect(geometry && validatePrintMargins(geometry, { bleedMm: 2, safeMarginMm: 2 })).toBeNull();
  });

  it("uses the same physical dimensions for retouch, framing and print guides", () => {
    const geometry = { shape: "rectangle", widthMm: 80, heightMm: 50, cornerStyle: "rounded", cornerRadiusMm: 4, rotationDegrees: 0, allowPrintRotation: true } as const;
    const guides = createPrintGuideLayout({ geometry, margins: { bleedMm: 3, safeMarginMm: 2 }, viewportWidth: 1200, viewportHeight: 900, paddingRatio: 0.05 });
    expect(guides.outputWidthMm).toBe(86);
    expect(guides.outputHeightMm).toBe(56);
    expect(guides.safeWidthMm).toBe(76);
    expect(guides.safeHeightMm).toBe(46);
    expect(guides.cut).toEqual(guides.outer);
    expect(guides.bleed.path).not.toBe(guides.cut.path);
    expect(guides.safe.path).not.toBe(guides.bleed.path);
  });

  it("prepares a rectangular rounded artwork at physical dimensions", async () => {
    const source = await sharp({ create: { width: 1200, height: 800, channels: 4, background: "#0891b2" } }).png().toBuffer();
    const prepared = await prepareArtwork({
      dataUrl: `data:image/png;base64,${source.toString("base64")}`,
      geometry: { shape: "rectangle", widthMm: 80, heightMm: 50, cornerStyle: "rounded", cornerRadiusMm: 5, rotationDegrees: 0, allowPrintRotation: true },
      bleedMm: 2,
      dpi: 150
    });
    expect(prepared.widthPx).toBeGreaterThan(prepared.heightPx);
    expect(prepared.widthPx).toBe(Math.round(84 / 25.4 * 150));
    expect(prepared.heightPx).toBe(Math.round(54 / 25.4 * 150));
  });
});
