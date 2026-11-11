// @vitest-environment node
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareArtwork } from "@/services/artwork/production";
import { artworkFrameSchema } from "@/domain/artwork/framing";
import { generatePrintPdf } from "@/services/artwork/imposition";
import { DEFAULT_ARTWORK_PROFILE } from "@/services/artwork/production";
import { PDFDocument } from "pdf-lib";

describe("reversible artwork background", () => {
  it("blends partial transparency with the selected color instead of replacing image pixels", async () => {
    const source = await sharp({ create: { width: 80, height: 80, channels: 4, background: { r: 255, g: 0, b: 0, alpha: .5 } } }).png().toBuffer();
    const result = await prepareArtwork({ dataUrl: `data:image/png;base64,${source.toString("base64")}`, geometry: { shape: "square", widthMm: 30, heightMm: 30, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true }, bleedMm: 0, dpi: 100, backgroundColor: "#0000ff" });
    const { data, info } = await sharp(Buffer.from(result.dataUrl.split(",")[1], "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const offset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
    expect(data[offset]).toBeGreaterThan(120); expect(data[offset + 2]).toBeGreaterThan(120);
    expect(data[offset + 1]).toBe(0); expect(data[offset + 3]).toBe(255);
  });
  it("fills uncovered cut areas without repainting opaque artwork and clears the coverage warning", async () => {
    const source = await sharp({ create: { width: 80, height: 60, channels: 4, background: "#ffffff" } }).png().toBuffer();
    const input = { dataUrl: `data:image/png;base64,${source.toString("base64")}`, geometry: { shape: "circle" as const, widthMm: 35, heightMm: 35, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true }, bleedMm: 2, safeMarginMm: 2, dpi: 100, scale: .5, offsetX: .15, rotationDegrees: 20 };
    const blank = await prepareArtwork(input);
    const filled = await prepareArtwork({ ...input, backgroundColor: "#247a9f" });
    expect(blank.coverage.warning).toBe(true);
    expect(filled.coverage.warning).toBe(false);
    const { data, info } = await sharp(Buffer.from(filled.dataUrl.split(",")[1], "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
    expect(pixel(Math.floor(info.width / 2), Math.floor(info.height / 2))).toEqual([255, 255, 255, 255]);
    expect(pixel(Math.floor(info.width / 2), 8)).toEqual([36, 122, 159, 255]);
    expect(pixel(0, 0)[3]).toBe(0);
    const pdf = await generatePrintPdf([{ id: "filled", label: "Arte com fundo", quantity: 2, geometry: input.geometry, preparedDataUrl: filled.dataUrl }], { ...DEFAULT_ARTWORK_PROFILE, drawCutLines: false });
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(1);
    expect(pdf.plan.copyCount).toBe(2);
  });
  it("keeps old frames compatible and rejects arbitrary CSS or transparent colors", () => {
    expect(artworkFrameSchema.parse({})).toMatchObject({ scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 });
    for (const backgroundColor of ["url(https://example.test)", "transparent", "red", "#fff", "#12345600"])
      expect(artworkFrameSchema.safeParse({ backgroundColor }).success).toBe(false);
    expect(artworkFrameSchema.parse({ backgroundColor: null }).backgroundColor).toBeNull();
  });
});
