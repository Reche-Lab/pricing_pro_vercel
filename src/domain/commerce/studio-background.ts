import { calculatePrintGuideDimensions, type PrintGeometry, type PrintMargins } from "@/domain/artwork/geometry";

export type StudioBackgroundAsset = { dataUrl: string; fileName: string; width: number; height: number };
export type StudioBackgroundImage = { asset: StudioBackgroundAsset; scale: number; offsetX: number; offsetY: number; fillColor: string };
export const STUDIO_MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function cutSize(geometry: PrintGeometry, margins: PrintMargins) {
  return calculatePrintGuideDimensions({ safeWidthMm: geometry.widthMm, safeHeightMm: geometry.heightMm, sangriaIncrementMm: margins.safeMarginMm, cutIncrementMm: margins.bleedMm });
}
export function studioRasterSize(geometry: PrintGeometry, margins: PrintMargins, purpose: "preview" | "purchase") {
  const { cutWidthMm, cutHeightMm } = cutSize(geometry, margins);
  const width = purpose === "purchase" ? Math.max(1, Math.round(cutWidthMm / 25.4 * 300)) : Math.max(1, Math.round(640 * Math.min(1, cutWidthMm / cutHeightMm)));
  const height = purpose === "purchase" ? Math.max(1, Math.round(cutHeightMm / 25.4 * 300)) : Math.max(1, Math.round(640 * Math.min(1, cutHeightMm / cutWidthMm)));
  if (!Number.isFinite(width * height) || width * height > 16_000_000 || Math.max(width, height) > 4096) throw new Error("As medidas deste produto excedem o limite do Estúdio. Envie uma arte pronta na página do produto.");
  return { width, height };
}
export function studioImageFitScale(image: { width: number; height: number }, geometry: PrintGeometry, margins: PrintMargins) {
  const { cutWidthMm: width, cutHeightMm: height } = cutSize(geometry, margins);
  return Math.min(width / image.width, height / image.height) / Math.max(width / image.width, height / image.height);
}
export function studioImagePlacement(image: { width: number; height: number }, viewport: { width: number; height: number }, frame: { scale: number; offsetX: number; offsetY: number }) {
  const cover = Math.max(viewport.width / image.width, viewport.height / image.height) * frame.scale;
  const width = image.width * cover, height = image.height * cover;
  return { x: (viewport.width - width) / 2 + frame.offsetX * viewport.width / 2, y: (viewport.height - height) / 2 + frame.offsetY * viewport.height / 2, width, height };
}
export function studioImageDpi(image: { width: number; height: number }, scale: number, geometry: PrintGeometry, margins: PrintMargins) {
  const { cutWidthMm: width, cutHeightMm: height } = cutSize(geometry, margins);
  return 25.4 / (Math.max(width / image.width, height / image.height) * scale);
}

export function verifyStudioImageHeader(bytes: Uint8Array, mimeType: string, size: number) {
  if (!size || size > STUDIO_MAX_IMAGE_BYTES) throw new Error("Envie uma imagem PNG, JPEG ou WebP de até 3 MB.");
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
  if (!(mimeType === "image/png" && png || mimeType === "image/jpeg" && jpeg || mimeType === "image/webp" && webp)) throw new Error("O arquivo precisa ser uma imagem PNG, JPEG ou WebP válida. SVG e outros formatos não são aceitos.");
}
