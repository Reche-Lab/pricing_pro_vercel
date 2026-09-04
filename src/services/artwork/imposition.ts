import sharp from "sharp";
import { degrees, PDFDocument } from "pdf-lib";
import { calculatePrintGuideDimensions, createShapeSvg, type PrintGeometry } from "@/domain/artwork/geometry";
import { decodeImageDataUrl, mmToPoints, type ArtworkProductionProfile } from "./production";

export type PrintArtwork = {
  id: string;
  label: string;
  quantity: number;
  geometry: PrintGeometry;
  bleedMm?: number;
  safeMarginMm?: number;
  preparedDataUrl: string;
};

export type PrintPlacement = {
  artworkId: string;
  label: string;
  pageIndex: number;
  xMm: number;
  yMm: number;
  geometry: PrintGeometry;
  bleedMm: number;
  safeMarginMm: number;
  rotated: boolean;
};

export type ImpositionPlan = {
  pageCount: number;
  copyCount: number;
  placements: PrintPlacement[];
};

export const MIN_ARTWORK_GAP_MM = 3;
export const MIN_BOTTOM_MARGIN_MM = 10;

export function resolveArtworkProductionQuantities(
  items: Array<{ id: string; description: string; quantity: number }>,
  artworks: Array<{ id: string; quote_item_id: string; production_quantity: number | null }>
) {
  const result = new Map<string, number>();
  for (const item of items) {
    const itemArtworks = artworks.filter((artwork) => artwork.quote_item_id === item.id);
    if (itemArtworks.length === 1) {
      const quantity = itemArtworks[0].production_quantity ?? item.quantity;
      if (quantity !== item.quantity) throw new Error(`A quantidade distribuída de ${item.description} deve totalizar ${item.quantity}.`);
      result.set(itemArtworks[0].id, quantity);
      continue;
    }
    const quantities = itemArtworks.map((artwork) => artwork.production_quantity ?? 0);
    if (quantities.some((quantity) => quantity <= 0) || quantities.reduce((sum, quantity) => sum + quantity, 0) !== item.quantity) {
      throw new Error(`Distribua exatamente ${item.quantity} unidades entre as artes de ${item.description}.`);
    }
    itemArtworks.forEach((artwork, index) => result.set(artwork.id, quantities[index]));
  }
  return result;
}

export function createImpositionPlan(artworks: PrintArtwork[], profile: ArtworkProductionProfile): ImpositionPlan {
  const effectiveProfile = {
    ...profile,
    gapMm: Math.max(MIN_ARTWORK_GAP_MM, profile.gapMm),
    bottomMarginMm: Math.max(MIN_BOTTOM_MARGIN_MM, profile.bottomMarginMm ?? 15)
  };
  const copies = artworks.flatMap((artwork) =>
    Array.from({ length: artwork.quantity }, () => artwork)
  ).sort((a, b) => Math.max(b.geometry.widthMm, b.geometry.heightMm) - Math.max(a.geometry.widthMm, a.geometry.heightMm));
  if (!copies.length) return { pageCount: 0, copyCount: 0, placements: [] };

  const grid = createShelfPlan(copies, effectiveProfile);
  const circular = copies.every((copy) => copy.geometry.shape === "circle" && copy.geometry.widthMm === copies[0].geometry.widthMm && artworkBleedMm(copy, effectiveProfile) === artworkBleedMm(copies[0], effectiveProfile) && artworkSafeMarginMm(copy, effectiveProfile) === artworkSafeMarginMm(copies[0], effectiveProfile));
  if (!circular || effectiveProfile.layoutMode === "grid") return grid;
  const hex = createHexPlan(copies, effectiveProfile);
  if (effectiveProfile.layoutMode === "hex") return hex;
  return hex.pageCount <= grid.pageCount ? hex : grid;
}

function createShelfPlan(copies: PrintArtwork[], profile: ArtworkProductionProfile): ImpositionPlan {

  const placements: PrintPlacement[] = [];
  let pageIndex = 0;
  let x = profile.sideMarginMm;
  let y = profile.marginMm;
  let rowHeight = 0;
  const maxX = profile.pageWidthMm - profile.sideMarginMm;
  const maxY = profile.pageHeightMm - profile.bottomMarginMm;
  const availableWidth = maxX - profile.sideMarginMm;
  const availableHeight = maxY - profile.marginMm;

  for (const artwork of copies) {
    const bleedMm = artworkBleedMm(artwork, profile);
    const safeMarginMm = artworkSafeMarginMm(artwork, profile);
    const dimensions = artworkDimensions(artwork.geometry, safeMarginMm, bleedMm);
    const original = { width: dimensions.cutWidthMm, height: dimensions.cutHeightMm, rotated: false };
    const rotated = { width: original.height, height: original.width, rotated: true };
    const candidates = artwork.geometry.allowPrintRotation && original.width !== original.height ? [original, rotated] : [original];
    if (!candidates.some((candidate) => candidate.width <= availableWidth + 0.001 && candidate.height <= availableHeight + 0.001)) {
      throw new Error(`A arte ${artwork.label} não cabe na página com as margens configuradas.`);
    }
    const currentFits = candidates.filter((candidate) => x + candidate.width <= maxX + 0.001 && y + Math.max(rowHeight, candidate.height) <= maxY + 0.001);
    let selected = currentFits.sort((a, b) => Math.max(rowHeight, a.height) - Math.max(rowHeight, b.height))[0] ?? candidates[0];
    if (x + selected.width > maxX + 0.001) {
      x = profile.sideMarginMm;
      y += rowHeight + profile.gapMm;
      rowHeight = 0;
      selected = candidates.filter((candidate) => x + candidate.width <= maxX + 0.001).sort((a, b) => a.height - b.height)[0] ?? candidates[0];
    }
    if (y + selected.height > maxY + 0.001) {
      pageIndex += 1;
      x = profile.sideMarginMm;
      y = profile.marginMm;
      rowHeight = 0;
      selected = candidates
        .filter((candidate) => candidate.width <= availableWidth + 0.001 && candidate.height <= availableHeight + 0.001)
        .sort((a, b) => a.height - b.height)[0];
    }
    placements.push({
      artworkId: artwork.id,
      label: artwork.label,
      pageIndex,
      xMm: x,
      yMm: y,
      geometry: artwork.geometry,
      bleedMm,
      safeMarginMm,
      rotated: selected.rotated
    });
    x += selected.width + profile.gapMm;
    rowHeight = Math.max(rowHeight, selected.height);
  }

  return { pageCount: pageIndex + 1, copyCount: copies.length, placements };
}

function createHexPlan(copies: PrintArtwork[], profile: ArtworkProductionProfile): ImpositionPlan {
  const bleedMm = artworkBleedMm(copies[0], profile);
  const safeMarginMm = artworkSafeMarginMm(copies[0], profile);
  const outer = artworkDimensions(copies[0].geometry, safeMarginMm, bleedMm).cutWidthMm;
  const horizontalStep = outer + profile.gapMm;
  const verticalStep = outer * Math.sqrt(3) / 2 + profile.gapMm;
  const availableWidth = profile.pageWidthMm - profile.sideMarginMm * 2;
  const availableHeight = profile.pageHeightMm - profile.marginMm - profile.bottomMarginMm;
  const columnsEven = Math.floor((availableWidth + profile.gapMm) / horizontalStep);
  const columnsOdd = Math.floor((availableWidth - horizontalStep / 2 + profile.gapMm) / horizontalStep);
  const rows = Math.floor((availableHeight - outer) / verticalStep) + 1;
  if (columnsEven < 1 || columnsOdd < 1 || rows < 1) return createShelfPlan(copies, profile);
  const perPage = Array.from({ length: rows }, (_, row) => row % 2 ? columnsOdd : columnsEven).reduce((sum, value) => sum + value, 0);
  const placements: PrintPlacement[] = [];
  copies.forEach((artwork, index) => {
    const pageIndex = Math.floor(index / perPage);
    let offset = index % perPage;
    let row = 0;
    while (offset >= (row % 2 ? columnsOdd : columnsEven)) {
      offset -= row % 2 ? columnsOdd : columnsEven;
      row += 1;
    }
    placements.push({
      artworkId: artwork.id,
      label: artwork.label,
      pageIndex,
      xMm: profile.sideMarginMm + (row % 2 ? horizontalStep / 2 : 0) + offset * horizontalStep,
      yMm: profile.marginMm + row * verticalStep,
      geometry: artwork.geometry,
      bleedMm: artworkBleedMm(artwork, profile),
      safeMarginMm: artworkSafeMarginMm(artwork, profile),
      rotated: false
    });
  });
  return { pageCount: Math.ceil(copies.length / perPage), copyCount: copies.length, placements };
}

export async function generatePrintPdf(
  artworks: PrintArtwork[],
  profile: ArtworkProductionProfile
): Promise<{ bytes: Uint8Array; plan: ImpositionPlan }> {
  const plan = createImpositionPlan(artworks, profile);
  if (!plan.pageCount) throw new Error("Nenhuma arte aprovada para montar.");
  const pdf = await PDFDocument.create();
  const pages = Array.from({ length: plan.pageCount }, () =>
    pdf.addPage([mmToPoints(profile.pageWidthMm), mmToPoints(profile.pageHeightMm)])
  );
  const imageById = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  const cutLineById = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();

  for (const artwork of artworks) {
    const imageBytes = decodeImageDataUrl(artwork.preparedDataUrl);
    imageById.set(artwork.id, await pdf.embedPng(new Uint8Array(imageBytes)));
    if (profile.drawCutLines) {
      const bleedMm = artworkBleedMm(artwork, profile);
      const safeMarginMm = artworkSafeMarginMm(artwork, profile);
      const dimensions = artworkDimensions(artwork.geometry, safeMarginMm, bleedMm);
      const scale = 8;
      const width = Math.round(dimensions.cutWidthMm * scale);
      const height = Math.round(dimensions.cutHeightMm * scale);
      const svg = createShapeSvg({
        shape: artwork.geometry.shape, width, height, inset: 0,
        cornerRadius: (artwork.geometry.cornerRadiusMm + safeMarginMm + bleedMm) * scale,
        rotationDegrees: artwork.geometry.rotationDegrees,
        fill: "none", stroke: "#262626", strokeWidth: 1.5
      });
      const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
      cutLineById.set(artwork.id, await pdf.embedPng(new Uint8Array(overlay)));
    }
  }

  for (const placement of plan.placements) {
    const page = pages[placement.pageIndex];
    const image = imageById.get(placement.artworkId);
    if (!image) continue;
    const dimensions = artworkDimensions(placement.geometry, placement.safeMarginMm, placement.bleedMm);
    const originalWidthPt = mmToPoints(dimensions.cutWidthMm);
    const originalHeightPt = mmToPoints(dimensions.cutHeightMm);
    const occupiedHeightPt = placement.rotated ? originalWidthPt : originalHeightPt;
    const x = mmToPoints(placement.xMm);
    const y = page.getHeight() - mmToPoints(placement.yMm) - occupiedHeightPt;
    const options = placement.rotated
      ? { x: x + originalHeightPt, y, width: originalWidthPt, height: originalHeightPt, rotate: degrees(90) }
      : { x, y, width: originalWidthPt, height: originalHeightPt };
    page.drawImage(image, options);
    const cutLine = cutLineById.get(placement.artworkId);
    if (cutLine) page.drawImage(cutLine, options);
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, plan };
}

function artworkBleedMm(artwork: PrintArtwork, profile: ArtworkProductionProfile) {
  return Number.isFinite(artwork.bleedMm) && (artwork.bleedMm as number) >= 0 ? artwork.bleedMm as number : profile.bleedMm;
}

function artworkSafeMarginMm(artwork: PrintArtwork, profile: ArtworkProductionProfile) {
  return Number.isFinite(artwork.safeMarginMm) && (artwork.safeMarginMm as number) >= 0 ? artwork.safeMarginMm as number : profile.safeMarginMm;
}

function artworkDimensions(geometry: PrintGeometry, safeMarginMm: number, bleedMm: number) {
  return calculatePrintGuideDimensions({
    safeWidthMm: geometry.widthMm,
    safeHeightMm: geometry.heightMm,
    sangriaIncrementMm: safeMarginMm,
    cutIncrementMm: bleedMm
  });
}
