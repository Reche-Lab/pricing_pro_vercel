// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { quotePdfItemVisuals } from "@/services/pdf/quote-visuals";
import { renderPdfProductMockup } from "@/services/pdf/product-mockup";
import { defaultMockup } from "@/domain/commerce/artwork-options";
import { circularMockupPresets } from "@/domain/commerce/mockup-presets";
import type { QuoteItemRow } from "@/repositories/quotes";
import { loadPdfImageBytes } from "@/services/pdf/pdf-images";

vi.mock("@/services/storage/artwork-storage", () => ({ loadArtworkDataUrl: async (data: string | null) => { if (!data) throw new Error("unavailable"); return data; } }));
const geometry = { shape: "circle" as const, widthMm: 50, heightMm: 50, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true };
async function sample() {
  const pixels = Buffer.alloc(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const r = Math.hypot((x + .5) / 128 - 1, (y + .5) / 128 - 1), i = (y * 256 + x) * 4;
    pixels[i] = r > .91 ? 255 : 0; pixels[i + 1] = r <= .91 ? 180 : 0; pixels[i + 2] = 0; pixels[i + 3] = r <= 1 ? 255 : 0;
  }
  return `data:image/png;base64,${(await sharp(pixels, { raw: { width: 256, height: 256, channels: 4 } }).png().toBuffer()).toString("base64")}`;
}
function item(source: string, approved = true): QuoteItemRow {
  return { id: "i", description: "Botton", quantity: 50, unit_price: "3", total_price: "150", print_shape: "circle", print_width_mm: "50", print_height_mm: "50", print_safe_margin_mm: "2", print_bleed_mm: "3",
    product_mockup: circularMockupPresets[0].model,
    artworks: [{ id: "a", quote_item_id: "i", artwork_name: "Campanha", file_name: "original.png", mime_type: "image/png", file_size: 100, data_url: source, storage_path: null, prepared_data_url: source, approval_status: approved ? "approved" : "pending" }] };
}
describe("finished product and fallback images for quote PDFs", () => {
  it("maps only the visible sangria to the front and continues the hidden outer band onto the back", async () => {
    const source = await sample(), model = defaultMockup();
    const front = await renderPdfProductMockup(source, geometry, { safeMarginMm: 2, bleedMm: 3 }, model, "front");
    const back = await renderPdfProductMockup(source, geometry, { safeMarginMm: 2, bleedMm: 3 }, model, "back");
    const a = await sharp(front!).ensureAlpha().raw().toBuffer(), b = await sharp(back!).ensureAlpha().raw().toBuffer();
    const at = (buffer: Buffer, x: number, y: number) => Array.from(buffer.subarray((y * 480 + x) * 4, (y * 480 + x) * 4 + 4));
    expect(at(a, 240, 240)).toEqual([0, 180, 0, 255]);
    expect(at(a, 470, 240)[1]).toBeGreaterThan(160); // Front must not show the cut-only red band.
    expect(at(a, 0, 0)[3]).toBe(0);
    expect(at(b, 240, 240)[3]).toBe(0); expect(at(b, 435, 240)[0]).toBeGreaterThan(200);
  });
  it("renders approved front/back with the same configured product model and disclaimer flag", async () => {
    const visuals = await quotePdfItemVisuals(item(await sample()), "product", "both");
    expect(visuals[0].label).toBe("Produto com arte aprovada"); expect(visuals[0].images.map(image => image.label)).toEqual(["Frente", "Verso"]);
    expect(visuals[0].illustrative).toBe(true);
  });
  it("supports front only and does not falsely show an unapproved crop as a finished product", async () => {
    const source = await sample();
    expect((await quotePdfItemVisuals(item(source), "product", "front"))[0].images).toHaveLength(1);
    const pending = (await quotePdfItemVisuals(item(source, false), "product", "both"))[0];
    expect(pending.label).toContain("Arte original"); expect(pending.label).toContain("aprovação pendente"); expect(pending.illustrative).toBe(false);
  });
  it("falls back to the product example when no original artwork is available", async () => {
    const source = await sample(), input = item(source);
    input.artworks = []; input.product_image_url = source;
    expect((await quotePdfItemVisuals(input, "product", "both"))[0].label).toContain("Exemplo do produto");
    input.artworks = [{ ...item(source).artworks![0], data_url: null, prepared_data_url: null }];
    expect((await quotePdfItemVisuals(input, "product", "both"))[0].images).toHaveLength(1);
  });
  it("rejects private URLs, path traversal, redirects' target schemes and oversized inline images", async () => {
    for (const url of ["http://example.com/x.png", "https://user:pass@example.com/x.png", "https://127.0.0.1/image.png", "https://169.254.169.254/image.png", "/mockups/../../.env", "data:image/png;base64," + "A".repeat(8_000_000)]) expect(await loadPdfImageBytes(url)).toBeNull();
  });
});
