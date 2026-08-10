import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createShapePath, resolvePrintGeometry } from "@/domain/artwork/geometry";
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
