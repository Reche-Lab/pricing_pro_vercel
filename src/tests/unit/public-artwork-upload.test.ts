import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizePublicArtworkUpload } from "@/services/artwork/public-upload";

describe("public artwork upload", () => {
  it("decodes, validates and normalizes a real PNG to WebP", async () => {
    const source = await sharp({ create: { width: 400, height: 300, channels: 4, background: "#22d3ee" } }).png().toBuffer();
    const result = await normalizePublicArtworkUpload({
      dataUrl: `data:image/png;base64,${source.toString("base64")}`,
      declaredMimeType: "image/png",
      declaredSize: source.length,
      originalFileName: "Minha arte final.PNG"
    });
    expect(result.contentType).toBe("image/webp");
    expect(result.fileName).toBe("Minha-arte-final.webp");
    expect((await sharp(result.bytes).metadata()).format).toBe("webp");
  });

  it("rejects active SVG content even when presented as an image", async () => {
    const source = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
    await expect(normalizePublicArtworkUpload({
      dataUrl: `data:image/svg+xml;base64,${source.toString("base64")}`,
      declaredMimeType: "image/png",
      declaredSize: source.length,
      originalFileName: "arte.png"
    })).rejects.toThrow("tipo real");
  });

  it("rejects spoofed client file sizes", async () => {
    const source = await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).jpeg().toBuffer();
    await expect(normalizePublicArtworkUpload({
      dataUrl: `data:image/jpeg;base64,${source.toString("base64")}`,
      declaredMimeType: "image/jpeg",
      declaredSize: source.length - 1,
      originalFileName: "arte.jpg"
    })).rejects.toThrow("tamanho real");
  });
});
