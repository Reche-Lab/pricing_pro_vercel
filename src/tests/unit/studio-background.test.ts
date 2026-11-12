import { describe, expect, it } from "vitest";
import { studioImageFitScale, studioRasterSize, studioImageDpi, studioImagePlacement, verifyStudioImageHeader } from "@/domain/commerce/studio-background";
const geometry = { shape: "circle" as const, widthMm: 53, heightMm: 53, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true };
const margins = { safeMarginMm: 1.5, bleedMm: 2 };
describe("studio background and print dimensions", () => {
  it("fits a wide image without cropping or distortion and treats scale as relative to cover", () => {
    expect(studioImageFitScale({ width: 200, height: 100 }, geometry, margins)).toBeCloseTo(.5);
    expect(studioImageFitScale({ width: 100, height: 200 }, geometry, margins)).toBeCloseTo(.5);
    expect(studioImageFitScale({ width: 200, height: 200 }, geometry, margins)).toBe(1);
  });
  it("keeps the full rectangular image when fitting instead of clipping it inside a scaled square", () => {
    const image = { width: 800, height: 400 };
    expect(studioImagePlacement(image, { width: 640, height: 640 }, { scale: .5, offsetX: 0, offsetY: 0 })).toEqual({ x: 0, y: 160, width: 640, height: 320 });
    expect(studioImagePlacement(image, { width: 640, height: 640 }, { scale: .5, offsetX: .5, offsetY: -1 })).toEqual({ x: 160, y: -160, width: 640, height: 320 });
  });
  it("exports the actual cut dimensions at 300 dpi instead of reusing the 640 px demonstration", () => {
    expect(studioRasterSize(geometry, margins, "preview")).toEqual({ width: 640, height: 640 });
    expect(studioRasterSize(geometry, margins, "purchase")).toEqual({ width: 709, height: 709 });
    const rect = { ...geometry, shape: "rectangle" as const, widthMm: 100, heightMm: 50 };
    const size = studioRasterSize(rect, { safeMarginMm: 0, bleedMm: 0 }, "purchase");
    expect(size).toEqual({ width: 1181, height: 591 });
  });
  it("rejects an excessive production canvas rather than silently reducing print quality", () => {
    expect(() => studioRasterSize({ ...geometry, widthMm: 400, heightMm: 400 }, margins, "purchase")).toThrow(/medidas/i);
  });
  it("estimates original background sharpness even after the composed output has high resolution", () => {
    expect(studioImageDpi({ width: 300, height: 300 }, 1, geometry, margins)).toBeCloseTo(127);
    expect(studioImageDpi({ width: 300, height: 300 }, .5, geometry, margins)).toBeCloseTo(254);
  });
  it("rejects empty, oversized, disguised SVG and mismatched content before decoding an image", () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(() => verifyStudioImageHeader(png, "image/png", 100)).not.toThrow();
    expect(() => verifyStudioImageHeader(png, "image/png", 0)).toThrow(/3 MB/);
    expect(() => verifyStudioImageHeader(png, "image/png", 4 * 1024 * 1024)).toThrow(/3 MB/);
    expect(() => verifyStudioImageHeader(png, "image/jpeg", 100)).toThrow(/válida/);
    expect(() => verifyStudioImageHeader(new TextEncoder().encode("<svg></svg>"), "image/png", 11)).toThrow(/SVG/);
  });
});
