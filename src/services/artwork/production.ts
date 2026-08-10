import sharp from "sharp";
import { createShapeSvg, type PrintGeometry } from "@/domain/artwork/geometry";

export type ArtworkProductionProfile = {
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  bleedMm: number;
  safeMarginMm: number;
  gapMm: number;
  dpi: number;
  layoutMode: "auto" | "grid" | "hex";
  drawCutLines: boolean;
};

export const DEFAULT_ARTWORK_PROFILE: ArtworkProductionProfile = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginMm: 7,
  bleedMm: 2,
  safeMarginMm: 2,
  gapMm: 2,
  dpi: 300,
  layoutMode: "auto",
  drawCutLines: true
};

export function resolveDrawCutLines(defaultValue: boolean, override: string | null | undefined) {
  if (override === "1" || override === "true") return true;
  if (override === "0" || override === "false") return false;
  return defaultValue;
}

export type PreparedArtwork = {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  originalWidthPx: number;
  originalHeightPx: number;
  qualityStatus: "warning" | "ready";
  notes: string;
};

export function mmToPixels(mm: number, dpi: number) {
  return Math.max(1, Math.round((mm / 25.4) * dpi));
}

export function mmToPoints(mm: number) {
  return (mm / 25.4) * 72;
}

export async function prepareCircularArtwork(input: {
  dataUrl: string;
  diameterMm: number;
  bleedMm: number;
  dpi: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  rotationDegrees?: number;
}): Promise<PreparedArtwork> {
  return prepareArtwork({
    ...input,
    geometry: { shape: "circle", widthMm: input.diameterMm, heightMm: input.diameterMm, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true }
  });
}

export async function prepareArtwork(input: {
  dataUrl: string;
  geometry: PrintGeometry;
  bleedMm: number;
  dpi: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  rotationDegrees?: number;
}): Promise<PreparedArtwork> {
  const source = decodeImageDataUrl(input.dataUrl);
  const orientedSource = await sharp(source, { failOn: "error" }).rotate().png().toBuffer();
  const image = sharp(orientedSource, { failOn: "error" });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Não foi possível identificar as dimensões da arte.");

  const outputWidthMm = input.geometry.widthMm + input.bleedMm * 2;
  const outputHeightMm = input.geometry.heightMm + input.bleedMm * 2;
  const outputWidthPx = mmToPixels(outputWidthMm, input.dpi);
  const outputHeightPx = mmToPixels(outputHeightMm, input.dpi);
  const requiredFinishedPx = Math.max(mmToPixels(input.geometry.widthMm, input.dpi), mmToPixels(input.geometry.heightMm, input.dpi));
  const availableFinishedPx = Math.min(metadata.width, metadata.height);
  const qualityStatus = availableFinishedPx + 1 >= requiredFinishedPx ? "ready" : "warning";
  const scale = clamp(input.scale ?? 1, 0.1, 5);
  const offsetX = clamp(input.offsetX ?? 0, -1, 1);
  const offsetY = clamp(input.offsetY ?? 0, -1, 1);
  const rotationDegrees = clamp(input.rotationDegrees ?? 0, -180, 180);
  const scaledWidthPx = Math.max(1, Math.ceil(outputWidthPx * scale));
  const scaledHeightPx = Math.max(1, Math.ceil(outputHeightPx * scale));

  const pxPerMm = input.dpi / 25.4;
  const shapeMask = Buffer.from(createShapeSvg({
    shape: input.geometry.shape,
    width: outputWidthPx,
    height: outputHeightPx,
    cornerRadius: (input.geometry.cornerRadiusMm + input.bleedMm) * pxPerMm,
    rotationDegrees: input.geometry.rotationDegrees,
    fill: "white"
  }));
  const transformed = await image
    .rotate(rotationDegrees, { background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .resize(scaledWidthPx, scaledHeightPx, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const framed = scale >= 1
    ? await cropOversizedArtwork(transformed, outputWidthPx, outputHeightPx, scaledWidthPx, scaledHeightPx, offsetX, offsetY)
    : await placeReducedArtwork(transformed, outputWidthPx, outputHeightPx, scaledWidthPx, scaledHeightPx, offsetX, offsetY);
  const output = await sharp(framed)
    .ensureAlpha()
    .composite([{ input: shapeMask, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  const whiteMarginNote = scale < 1 ? ` Zoom reduzido para ${scale.toFixed(2)}x com preenchimento branco.` : "";
  const notes = qualityStatus === "ready"
    ? `Arte preparada em ${input.dpi} DPI com ${input.bleedMm} mm de sangria.${whiteMarginNote}`
    : `A imagem original tem ${metadata.width} x ${metadata.height} px e pode perder nitidez em ${input.dpi} DPI.${whiteMarginNote}`;

  return {
    dataUrl: `data:image/png;base64,${output.toString("base64")}`,
    widthPx: outputWidthPx,
    heightPx: outputHeightPx,
    originalWidthPx: metadata.width,
    originalHeightPx: metadata.height,
    qualityStatus,
    notes
  };
}

async function cropOversizedArtwork(
  image: Buffer,
  outputWidthPx: number,
  outputHeightPx: number,
  scaledWidthPx: number,
  scaledHeightPx: number,
  offsetX: number,
  offsetY: number
) {
  const overflowX = Math.max(0, scaledWidthPx - outputWidthPx);
  const overflowY = Math.max(0, scaledHeightPx - outputHeightPx);
  const left = Math.round(overflowX * ((offsetX + 1) / 2));
  const top = Math.round(overflowY * ((offsetY + 1) / 2));
  return sharp(image)
    .extract({ left, top, width: outputWidthPx, height: outputHeightPx })
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function placeReducedArtwork(
  image: Buffer,
  outputWidthPx: number,
  outputHeightPx: number,
  scaledWidthPx: number,
  scaledHeightPx: number,
  offsetX: number,
  offsetY: number
) {
  const left = Math.round((outputWidthPx - scaledWidthPx) * ((offsetX + 1) / 2));
  const top = Math.round((outputHeightPx - scaledHeightPx) * ((offsetY + 1) / 2));
  return sharp({ create: { width: outputWidthPx, height: outputHeightPx, channels: 4, background: "#ffffff" } })
    .composite([{ input: image, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function decodeImageDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Arquivo de arte inválido.");
  return Buffer.from(match[1], "base64");
}
