import { describe, expect, it, vi } from "vitest";
import { artworkFramePlacement, fitArtworkViewport, framedArtworkSize } from "@/domain/artwork/framing";
import { drawArtworkFrame } from "@/components/quotes/artwork-frame-canvas";

describe("shared crop and retouch framing", () => {
  it("preserves scale, both offsets and rotation in the same cut coordinate system", () => {
    expect(artworkFramePlacement(1000, 500, { scale: 0.8, offsetX: 0.4, offsetY: -0.2, rotationDegrees: 30 }))
      .toEqual({ x: 300, y: 0, width: 800, height: 400, rotationDegrees: 30 });
  });
  it("uses cover rather than contain for landscape and portrait uploads", () => {
    for (const [sourceWidth, sourceHeight, expected] of [[1200, 800, [-250, 0, 1500, 1000]], [800, 1200, [0, -250, 1000, 1500]]] as const) {
      const context = Object.fromEntries(["save", "restore", "translate", "rotate", "beginPath", "rect", "clip", "drawImage"].map(key => [key, vi.fn()])) as unknown as CanvasRenderingContext2D;
      const image = {} as CanvasImageSource;
      drawArtworkFrame(context, image, sourceWidth, sourceHeight, 1000, 1000, { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 });
      expect(context.drawImage).toHaveBeenCalledWith(image, ...expected);
      expect(context.rect).toHaveBeenCalledWith(0, 0, 1000, 1000);
    }
  });
  it("rotates around the cut center and clips the scaled image box", () => {
    const context = Object.fromEntries(["save", "restore", "translate", "rotate", "beginPath", "rect", "clip", "drawImage"].map(key => [key, vi.fn()])) as unknown as CanvasRenderingContext2D;
    drawArtworkFrame(context, {} as CanvasImageSource, 800, 800, 1000, 500, { scale: 0.8, offsetX: 0.4, offsetY: -0.2, rotationDegrees: 30 });
    expect(context.translate).toHaveBeenNthCalledWith(1, 500, 250);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 6);
    expect(context.rect).toHaveBeenCalledWith(300, 0, 800, 400);
  });
  it("bounds the framed canvas without adding transparent margins or upscaling uploads", () => {
    expect(framedArtworkSize(1200, 800, 1)).toEqual({ width: 800, height: 800 });
    expect(framedArtworkSize(800, 1200, 2)).toEqual({ width: 800, height: 400 });
    const large = framedArtworkSize(12000, 8000, 1);
    expect(large.width * large.height).toBeLessThanOrEqual(30_010_000);
  });
  it.each([[1600, 900], [900, 1600], [1000, 1000]])("fits the entire %i × %i canvas by both dimensions", (width, height) => {
    const fitted = fitArtworkViewport(width, height, 320, 180);
    expect(fitted.width).toBeLessThanOrEqual(320);
    expect(fitted.height).toBeLessThanOrEqual(180);
    expect(fitted.width / fitted.height).toBeCloseTo(width / height);
  });
});
