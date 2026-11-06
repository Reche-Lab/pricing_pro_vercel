// @vitest-environment node
import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import model from "../../../public/mockups/botton-25mm-v1/modelo.json";
import { commerceArtworkOptionsSchema, defaultArtworkOptions } from "@/domain/commerce/artwork-options";

const root = new URL("../../../public/", import.meta.url);
describe("bundled botton mockup layers", () => {
  it("permits only known bundled assets as relative media paths", () => {
    const options = { ...defaultArtworkOptions(), mockup: model };
    expect(commerceArtworkOptionsSchema.safeParse(options).success).toBe(true);
    for (const unsafe of ["/api/private", "//example.com/image.png", "/mockups/../private.png", "data:image/png;base64,aQ=="]) {
      expect(commerceArtworkOptionsSchema.safeParse({ ...options, mockup: { ...model, front: { ...model.front, baseUrl: unsafe } } }).success).toBe(false);
    }
  });
  it("ships aligned transparent layers within the accepted upload size", async () => {
    for (const face of [model.front, model.back]) {
      for (const path of [face.baseUrl, face.maskUrl, face.overlayUrl]) {
        const file = new URL(path.slice(1), root);
        const metadata = await sharp(await readFile(file)).metadata();
        expect(metadata).toMatchObject({ width: 1254, height: 1254, format: "png", hasAlpha: true });
        expect((await stat(file)).size).toBeLessThanOrEqual(3 * 1024 * 1024);
      }
    }
  });
  it("keeps the rear hardware clear and the front artwork area opaque", async () => {
    for (const [side, face] of [["front", model.front], ["back", model.back]] as const) {
      const { data, info } = await sharp(await readFile(new URL(face.maskUrl.slice(1), root))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const cx = Math.round((face.x + face.width / 2) * info.width), cy = Math.round((face.y + face.height / 2) * info.height);
      const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
      expect(alpha(0, 0)).toBe(0);
      expect(alpha(cx, cy)).toBe(side === "front" ? 255 : 0);
      expect(alpha(Math.round(cx + face.width * info.width * 0.46), cy)).toBe(255);
      const finish = await sharp(await readFile(new URL(face.overlayUrl.slice(1), root))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(finish.data[3]).toBe(0);
      if (side === "back") expect(finish.data[(cy * info.width + cx) * 4 + 3]).toBe(0);
    }
  });
});
