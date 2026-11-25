import sharp from "sharp";
import { calculatePrintGuideDimensions, createShapeSvg, type PrintGeometry, type PrintMargins } from "@/domain/artwork/geometry";
import { defaultMockup, mockupSourcePoint, type ProductMockup } from "@/domain/commerce/artwork-options";
import { loadPdfImageBytes, PDF_IMAGE_PIXELS } from "./pdf-images";

/** Same projection as the storefront: the visible edge is the sangria, not the cut. */
export async function renderPdfProductMockup(source: string, geometry: PrintGeometry, margins: PrintMargins, configuredModel?: ProductMockup, side: "front" | "back" = "front") {
  const bytes = await loadPdfImageBytes(source);
  if (!bytes) return null;
  const model = configuredModel ?? defaultMockup(), face = model[side];
  const options = { limitInputPixels: PDF_IMAGE_PIXELS };
  const base = await loadPdfImageBytes(face.baseUrl);
  const metadata = base ? await sharp(base, options).metadata() : null;
  const aspect = metadata?.width && metadata.height ? metadata.width / metadata.height : geometry.widthMm / geometry.heightMm;
  const width = Math.round(480 * Math.min(1, aspect)), height = Math.round(480 / Math.max(1, aspect));
  const w = Math.max(1, Math.round(width * face.width)), h = Math.max(1, Math.round(height * face.height));
  const x = Math.min(width - w, Math.round(width * face.x)), y = Math.min(height - h, Math.round(height * face.y));
  const dimensions = calculatePrintGuideDimensions({ safeWidthMm: geometry.widthMm, safeHeightMm: geometry.heightMm, sangriaIncrementMm: margins.safeMarginMm, cutIncrementMm: margins.bleedMm });
  let artwork: Buffer;
  if (geometry.shape === "circle") {
    const sample = await sharp(bytes, options).resize(1024, 1024, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    const pixels = Buffer.alloc(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const point = mockupSourcePoint((i + .5) / w * 2 - 1, (j + .5) / h * 2 - 1, side, dimensions.sangriaWidthMm / dimensions.cutWidthMm, model);
      if (!point) continue;
      const sx = Math.max(0, Math.min(1023, point.x * 1023)), sy = Math.max(0, Math.min(1023, point.y * 1023));
      const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
      for (let c = 0; c < 4; c++) {
        const at = (xx: number, yy: number) => sample[(Math.min(1023, yy) * 1024 + Math.min(1023, xx)) * 4 + c];
        pixels[(j * w + i) * 4 + c] = Math.round((at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy);
      }
    }
    artwork = await sharp(pixels, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  } else {
    const full = await sharp(bytes, options).resize(1024, 1024, { fit: "fill" }).toBuffer();
    const cropX = Math.round(1024 * margins.bleedMm / dimensions.cutWidthMm), cropY = Math.round(1024 * margins.bleedMm / dimensions.cutHeightMm);
    let image = sharp(full, options).extract({ left: cropX, top: cropY, width: 1024 - cropX * 2, height: 1024 - cropY * 2 }).resize(w, h);
    if (side === "back") image = image.flop();
    const mask = Buffer.from(createShapeSvg({ shape: geometry.shape, width: w, height: h, cornerRadius: geometry.cornerRadiusMm / geometry.widthMm * w, rotationDegrees: geometry.rotationDegrees }));
    artwork = await image.composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  }
  const transparent = { create: { width, height, channels: 4 as const, background: "transparent" } };
  let layer = await sharp(transparent).composite([{ input: artwork, left: x, top: y }]).png().toBuffer();
  const mask = await loadPdfImageBytes(face.maskUrl);
  if (mask) layer = await sharp(layer).composite([{ input: await sharp(mask, options).resize(width, height, { fit: "fill" }).png().toBuffer(), blend: "dest-in" }]).png().toBuffer();
  const background = base && (side === "back" || geometry.shape !== "circle") ? await sharp(base, options).resize(width, height, { fit: "fill" }).png().toBuffer() : await sharp(transparent).png().toBuffer();
  let result = await sharp(background).composite([{ input: layer }]).png().toBuffer();
  // Never add the bright front rim; on the back, the finish covers only the opening.
  const overlay = geometry.shape === "circle" && side === "front" ? null : await loadPdfImageBytes(face.overlayUrl);
  if (overlay) {
    let finish = await sharp(overlay, options).resize(width, height, { fit: "fill" }).png().toBuffer();
    if (geometry.shape === "circle") {
      const opening = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w * model.backOpeningRatio / 2}" ry="${h * model.backOpeningRatio / 2}" fill="white"/></svg>`);
      finish = await sharp(finish).composite([{ input: opening, blend: "dest-in" }]).png().toBuffer();
    }
    result = await sharp(result).composite([{ input: finish }]).png().toBuffer();
  }
  return result;
}
