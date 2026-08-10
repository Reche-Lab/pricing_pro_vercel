import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createImpositionPlan, generatePrintPdf, resolveArtworkProductionQuantities } from "@/services/artwork/imposition";
import { DEFAULT_ARTWORK_PROFILE, mmToPixels, prepareCircularArtwork, resolveDrawCutLines } from "@/services/artwork/production";

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

  it("creates enough A4 pages for every requested copy", () => {
    const plan = createImpositionPlan([
      { id: "art-1", label: "Arte 1", quantity: 30, geometry: circle55, preparedDataUrl: "unused" }
    ], DEFAULT_ARTWORK_PROFILE);
    expect(plan.copyCount).toBe(30);
    expect(plan.placements).toHaveLength(30);
    expect(plan.pageCount).toBeGreaterThan(1);
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
