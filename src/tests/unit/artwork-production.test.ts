import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createImpositionPlan, generatePrintPdf, resolveArtworkProductionQuantities } from "@/services/artwork/imposition";
import { DEFAULT_ARTWORK_PROFILE, mmToPixels, prepareArtwork, prepareCircularArtwork, resolveDrawCutLines } from "@/services/artwork/production";

const circle55 = { shape: "circle", widthMm: 55, heightMm: 55, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true } as const;
const roundedRectangle = { shape: "rectangle", widthMm: 80, heightMm: 50, cornerStyle: "rounded", cornerRadiusMm: 5, rotationDegrees: 0, allowPrintRotation: true } as const;

describe("artwork production", () => {
  it("prepares a circular PNG at the exact diameter plus bleed", async () => {
    const source = await sharp({ create: { width: 1000, height: 800, channels: 4, background: "#e11d48" } }).png().toBuffer();
    const prepared = await prepareCircularArtwork({
      dataUrl: `data:image/png;base64,${source.toString("base64")}`,
      diameterMm: 45,
      bleedMm: 2,
      dpi: 300
    });
    expect(prepared.widthPx).toBe(mmToPixels(49, 300));
    expect(prepared.heightPx).toBe(prepared.widthPx);
    expect(prepared.dataUrl).toMatch(/^data:image\/png;base64,/);
    const metadata = await sharp(Buffer.from(prepared.dataUrl.split(",")[1], "base64")).metadata();
    expect(metadata.width).toBe(prepared.widthPx);
    expect(metadata.channels).toBe(4);
  });

  it("supports zoom out and fills the uncovered circular area with white", async () => {
    const source = await sharp({ create: { width: 800, height: 800, channels: 4, background: "#e11d48" } }).png().toBuffer();
    const prepared = await prepareCircularArtwork({
      dataUrl: `data:image/png;base64,${source.toString("base64")}`,
      diameterMm: 45,
      bleedMm: 2,
      dpi: 150,
      scale: 0.5
    });
    const { data, info } = await sharp(Buffer.from(prepared.dataUrl.split(",")[1], "base64"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const index = (y * info.width + x) * info.channels;
      return Array.from(data.subarray(index, index + 4));
    };

    expect(pixel(Math.floor(info.width / 2), Math.floor(info.height / 2))).toEqual([225, 29, 72, 255]);
    expect(pixel(Math.floor(info.width / 2), Math.floor(info.height * 0.15))).toEqual([255, 255, 255, 255]);
    expect(pixel(0, 0)[3]).toBe(0);
    expect(prepared.notes).toContain("preenchimento branco");
  });

  it("applies horizontal and vertical displacement independently at 1x zoom", async () => {
    const source = await sharp({ create: { width: 600, height: 600, channels: 4, background: "#e11d48" } }).png().toBuffer();
    const prepared = await prepareArtwork({
      dataUrl: `data:image/png;base64,${source.toString("base64")}`,
      geometry: { shape: "square", widthMm: 50, heightMm: 50, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true },
      bleedMm: 0,
      dpi: 100,
      scale: 1,
      offsetX: 0.5,
      offsetY: 0.5
    });
    const { data, info } = await sharp(Buffer.from(prepared.dataUrl.split(",")[1], "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 4));
    expect(pixel(Math.floor(info.width * 0.1), Math.floor(info.height * 0.5))).toEqual([255, 255, 255, 255]);
    expect(pixel(Math.floor(info.width * 0.5), Math.floor(info.height * 0.1))).toEqual([255, 255, 255, 255]);
    expect(pixel(Math.floor(info.width * 0.7), Math.floor(info.height * 0.7))).toEqual([225, 29, 72, 255]);
  });

  it("creates enough A4 pages for every requested copy", () => {
    const plan = createImpositionPlan([
      { id: "art-1", label: "Arte 1", quantity: 30, geometry: circle55, preparedDataUrl: "unused" }
    ], DEFAULT_ARTWORK_PROFILE);
    expect(plan.copyCount).toBe(30);
    expect(plan.placements).toHaveLength(30);
    expect(plan.pageCount).toBeGreaterThan(1);
  });

  it("starts every page at the top and enforces spacing and a protected bottom edge", () => {
    const square40 = { shape: "square" as const, widthMm: 40, heightMm: 40, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true };
    const profile = { ...DEFAULT_ARTWORK_PROFILE, layoutMode: "grid" as const, marginMm: 5, bottomMarginMm: 20, gapMm: 0, bleedMm: 0 };
    const plan = createImpositionPlan([{ id: "square", label: "Quadrado", quantity: 40, geometry: square40, preparedDataUrl: "unused" }], profile);
    for (let page = 0; page < plan.pageCount; page += 1) {
      const placements = plan.placements.filter((placement) => placement.pageIndex === page);
      expect(Math.min(...placements.map((placement) => placement.yMm))).toBe(profile.marginMm);
      expect(placements.every((placement) => placement.yMm + 40 <= profile.pageHeightMm - profile.bottomMarginMm + 0.001)).toBe(true);
      for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < placements.length; rightIndex += 1) {
          const left = placements[leftIndex]; const right = placements[rightIndex];
          const horizontalGap = Math.max(right.xMm - (left.xMm + 40), left.xMm - (right.xMm + 40));
          const verticalGap = Math.max(right.yMm - (left.yMm + 40), left.yMm - (right.yMm + 40));
          expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(3 - 0.001);
        }
      }
    }
  });

  it("uses the exact bleed configured for each product in a mixed A4 layout", () => {
    const square40 = { shape: "square" as const, widthMm: 40, heightMm: 40, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true };
    const plan = createImpositionPlan([
      { id: "bleed-zero", label: "Sem sangria", quantity: 1, geometry: square40, bleedMm: 0, preparedDataUrl: "unused" },
      { id: "bleed-five", label: "Sangria 5 mm", quantity: 1, geometry: square40, bleedMm: 5, preparedDataUrl: "unused" }
    ], { ...DEFAULT_ARTWORK_PROFILE, layoutMode: "grid" });
    const first = plan.placements.find((placement) => placement.artworkId === "bleed-zero");
    const second = plan.placements.find((placement) => placement.artworkId === "bleed-five");
    expect(first?.bleedMm).toBe(0);
    expect(second?.bleedMm).toBe(5);
    expect(first && second && Math.abs(first.xMm - second.xMm)).toBeGreaterThanOrEqual(43);
  });

  it("keeps the same minimum spacing and bottom protection in the alternating circular layout", () => {
    const profile = { ...DEFAULT_ARTWORK_PROFILE, layoutMode: "hex" as const, marginMm: 5, bottomMarginMm: 20, gapMm: 0 };
    const outerDiameter = circle55.widthMm + profile.bleedMm * 2;
    const plan = createImpositionPlan([{ id: "circle", label: "Circular", quantity: 40, geometry: circle55, preparedDataUrl: "unused" }], profile);
    for (let page = 0; page < plan.pageCount; page += 1) {
      const placements = plan.placements.filter((placement) => placement.pageIndex === page);
      expect(Math.min(...placements.map((placement) => placement.yMm))).toBe(profile.marginMm);
      expect(placements.every((placement) => placement.yMm + outerDiameter <= profile.pageHeightMm - profile.bottomMarginMm + 0.001)).toBe(true);
      for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < placements.length; rightIndex += 1) {
          const left = placements[leftIndex]; const right = placements[rightIndex];
          const centerDistance = Math.hypot(right.xMm - left.xMm, right.yMm - left.yMm);
          expect(centerDistance - outerDiameter).toBeGreaterThanOrEqual(3 - 0.001);
        }
      }
    }
  });

  it("writes a valid multipage PDF using physical A4 dimensions", async () => {
    const source = await sharp({ create: { width: 700, height: 700, channels: 4, background: "#0891b2" } }).png().toBuffer();
    const prepared = await prepareCircularArtwork({ dataUrl: `data:image/png;base64,${source.toString("base64")}`, diameterMm: 55, bleedMm: 2, dpi: 300 });
    const result = await generatePrintPdf([
      { id: "art-1", label: "Arte 1", quantity: 13, geometry: circle55, preparedDataUrl: prepared.dataUrl }
    ], DEFAULT_ARTWORK_PROFILE);
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(result.plan.pageCount);
    expect(result.plan.copyCount).toBe(13);
  });

  it("rotates a rectangular format only when that is required to fit A4", () => {
    const rotatable = { ...roundedRectangle, widthMm: 260, heightMm: 80 };
    const plan = createImpositionPlan([
      { id: "wide-art", label: "Arte larga", quantity: 1, geometry: rotatable, preparedDataUrl: "unused" }
    ], DEFAULT_ARTWORK_PROFILE);
    expect(plan.placements[0].rotated).toBe(true);
    expect(() => createImpositionPlan([
      { id: "wide-art", label: "Arte larga", quantity: 1, geometry: { ...rotatable, allowPrintRotation: false }, preparedDataUrl: "unused" }
    ], DEFAULT_ARTWORK_PROFILE)).toThrow("não cabe na página");
  });

  it("writes rounded rectangular artwork and its cut contour to PDF", async () => {
    const source = await sharp({ create: { width: 1000, height: 700, channels: 4, background: "#7c3aed" } }).png().toBuffer();
    const prepared = await import("@/services/artwork/production").then(({ prepareArtwork }) => prepareArtwork({
      dataUrl: `data:image/png;base64,${source.toString("base64")}`,
      geometry: roundedRectangle,
      bleedMm: 2,
      dpi: 150
    }));
    const result = await generatePrintPdf([
      { id: "rect-art", label: "Arte retangular", quantity: 3, geometry: roundedRectangle, preparedDataUrl: prepared.dataUrl }
    ], { ...DEFAULT_ARTWORK_PROFILE, drawCutLines: true });
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(result.plan.copyCount).toBe(3);
  });

  it("splits an item quantity across multiple approved artworks", () => {
    const quantities = resolveArtworkProductionQuantities(
      [{ id: "item-1", description: "Botton 4,5 cm", quantity: 30 }],
      [
        { id: "art-1", quote_item_id: "item-1", production_quantity: 10 },
        { id: "art-2", quote_item_id: "item-1", production_quantity: 20 }
      ]
    );
    expect(quantities.get("art-1")).toBe(10);
    expect(quantities.get("art-2")).toBe(20);
  });

  it("rejects an incomplete artwork quantity split", () => {
    expect(() => resolveArtworkProductionQuantities(
      [{ id: "item-1", description: "Botton 4,5 cm", quantity: 30 }],
      [
        { id: "art-1", quote_item_id: "item-1", production_quantity: 10 },
        { id: "art-2", quote_item_id: "item-1", production_quantity: 10 }
      ]
    )).toThrow("Distribua exatamente 30 unidades");
  });

  it("allows each print job to override the default cut lines setting", () => {
    expect(resolveDrawCutLines(true, "0")).toBe(false);
    expect(resolveDrawCutLines(false, "1")).toBe(true);
    expect(resolveDrawCutLines(false, null)).toBe(false);
  });
});
