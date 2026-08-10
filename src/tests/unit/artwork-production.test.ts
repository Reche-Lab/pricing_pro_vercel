import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createImpositionPlan, generatePrintPdf, resolveArtworkProductionQuantities } from "@/services/artwork/imposition";
import { DEFAULT_ARTWORK_PROFILE, mmToPixels, prepareCircularArtwork } from "@/services/artwork/production";

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

  it("creates enough A4 pages for every requested copy", () => {
    const plan = createImpositionPlan([
      { id: "art-1", label: "Arte 1", quantity: 30, diameterMm: 55, preparedDataUrl: "unused" }
    ], DEFAULT_ARTWORK_PROFILE);
    expect(plan.copyCount).toBe(30);
    expect(plan.placements).toHaveLength(30);
    expect(plan.pageCount).toBeGreaterThan(1);
  });

  it("writes a valid multipage PDF using physical A4 dimensions", async () => {
    const source = await sharp({ create: { width: 700, height: 700, channels: 4, background: "#0891b2" } }).png().toBuffer();
    const prepared = await prepareCircularArtwork({ dataUrl: `data:image/png;base64,${source.toString("base64")}`, diameterMm: 55, bleedMm: 2, dpi: 300 });
    const result = await generatePrintPdf([
      { id: "art-1", label: "Arte 1", quantity: 13, diameterMm: 55, preparedDataUrl: prepared.dataUrl }
    ], DEFAULT_ARTWORK_PROFILE);
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(result.plan.pageCount);
    expect(result.plan.copyCount).toBe(13);
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
});
