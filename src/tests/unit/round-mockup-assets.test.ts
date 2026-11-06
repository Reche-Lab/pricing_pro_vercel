// @vitest-environment node
import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { circularMockupPresets } from "@/domain/commerce/mockup-presets";
const root = new URL("../../../public/", import.meta.url);
const originalModel = circularMockupPresets[0].model;
describe("round product finish assets", () => {
  it.each(["ima", "espelho", "abridor"])("ships an aligned %s back, preserving the original outer rim", async id => {
    const preset = circularMockupPresets.find(p => p.id === id)!;
    const path = new URL(preset.model.back.baseUrl.slice(1), root);
    const bytes = await readFile(path);
    expect(await sharp(bytes).metadata()).toMatchObject({ width: 1254, height: 1254, hasAlpha: true, format: "png" });
    expect((await stat(path)).size).toBeLessThanOrEqual(3145728);
    const current = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const original = await sharp(await readFile(new URL(originalModel.back.baseUrl.slice(1), root))).ensureAlpha().raw().toBuffer();
    expect(current.data[3]).toBe(0);
    const face = preset.model.back, width = current.info.width;
    const cx = (face.x + face.width / 2) * width, cy = (face.y + face.height / 2) * current.info.height;
    const rx = face.width * width / 2 * preset.model.backOpeningRatio, ry = face.height * current.info.height / 2 * preset.model.backOpeningRatio;
    let different = 0, checked = 0;
    for (let index = 0; index < width * current.info.height; index += 19) {
      const x = index % width, y = Math.floor(index / width), offset = index * 4;
      if (Math.hypot((x - cx) / rx, (y - cy) / ry) <= 1.02 || original[offset + 3] < 240) continue;
      checked++;
      if (!current.data.subarray(offset, offset + 4).equals(original.subarray(offset, offset + 4))) different++;
    }
    expect(checked).toBeGreaterThan(1000);
    expect(different).toBe(0);
    const sample = (x: number, y: number) => [...current.data.subarray((Math.round(y) * width + Math.round(x)) * 4, (Math.round(y) * width + Math.round(x)) * 4 + 4)];
    const center = sample(cx, cy);
    if (id === "ima") { expect(Math.max(...center.slice(0, 3))).toBeLessThan(65); expect(center[3]).toBeGreaterThan(245); }
    if (id === "espelho") { expect(Math.min(...center.slice(0, 3))).toBeGreaterThan(140); expect(center[3]).toBeGreaterThan(245); }
    if (id === "abridor") { expect(center[3]).toBe(0); expect(sample(cx, cy + ry * 0.45)[3]).toBeGreaterThan(245); }
    expect((await readFile(new URL(preset.downloadUrl.slice(1), root))).subarray(0, 2).toString()).toBe("PK");
  });
});
