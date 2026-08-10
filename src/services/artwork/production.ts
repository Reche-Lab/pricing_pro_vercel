import sharp from "sharp";

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
  const source = decodeImageDataUrl(input.dataUrl);
  const orientedSource = await sharp(source, { failOn: "error" }).rotate().png().toBuffer();
  const image = sharp(orientedSource, { failOn: "error" });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Não foi possível identificar as dimensões da arte.");

  const outputDiameterMm = input.diameterMm + input.bleedMm * 2;
  const outputPx = mmToPixels(outputDiameterMm, input.dpi);
  const requiredFinishedPx = mmToPixels(input.diameterMm, input.dpi);
  const availableFinishedPx = Math.min(metadata.width, metadata.height) * (input.diameterMm / outputDiameterMm);
  const qualityStatus = availableFinishedPx + 1 >= requiredFinishedPx ? "ready" : "warning";
  const scale = clamp(input.scale ?? 1, 1, 5);
  const offsetX = clamp(input.offsetX ?? 0, -1, 1);
  const offsetY = clamp(input.offsetY ?? 0, -1, 1);
  const rotationDegrees = clamp(input.rotationDegrees ?? 0, -180, 180);
  const scaledPx = Math.max(outputPx, Math.ceil(outputPx * scale));
  const overflowPx = scaledPx - outputPx;
  const left = Math.round(overflowPx * ((offsetX + 1) / 2));
  const top = Math.round(overflowPx * ((offsetY + 1) / 2));

  const circleMask = Buffer.from(
    `<svg width="${outputPx}" height="${outputPx}"><circle cx="${outputPx / 2}" cy="${outputPx / 2}" r="${outputPx / 2}" fill="white"/></svg>`
  );
  const output = await image
    .rotate(rotationDegrees, { background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .resize(scaledPx, scaledPx, { fit: "cover", position: "centre" })
    .extract({ left, top, width: outputPx, height: outputPx })
    .ensureAlpha()
    .composite([{ input: circleMask, blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  const notes = qualityStatus === "ready"
    ? `Arte preparada em ${input.dpi} DPI com ${input.bleedMm} mm de sangria.`
    : `A imagem original tem ${metadata.width} x ${metadata.height} px e pode perder nitidez em ${input.dpi} DPI.`;

  return {
    dataUrl: `data:image/png;base64,${output.toString("base64")}`,
    widthPx: outputPx,
    heightPx: outputPx,
    originalWidthPx: metadata.width,
    originalHeightPx: metadata.height,
    qualityStatus,
    notes
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function decodeImageDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Arquivo de arte inválido.");
  return Buffer.from(match[1], "base64");
}
