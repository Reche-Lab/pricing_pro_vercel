import sharp from "sharp";
import { degrees, PDFDocument } from "pdf-lib";
import { createShapeSvg, type PrintGeometry } from "@/domain/artwork/geometry";
import { decodeImageDataUrl, mmToPoints, type ArtworkProductionProfile } from "./production";

export type PrintArtwork = {
  id: string;
  label: string;
  quantity: number;
  geometry: PrintGeometry;
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
  rotated: boolean;
};

export type ImpositionPlan = {
  pageCount: number;
  copyCount: number;
  placements: PrintPlacement[];
};

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
  const copies = artworks.flatMap((artwork) =>
    Array.from({ length: artwork.quantity }, () => artwork)
  ).sort((a, b) => Math.max(b.geometry.widthMm, b.geometry.heightMm) - Math.max(a.geometry.widthMm, a.geometry.heightMm));
  if (!copies.length) return { pageCount: 0, copyCount: 0, placements: [] };

  const grid = createShelfPlan(copies, profile);
  const circular = copies.every((copy) => copy.geometry.shape === "circle" && copy.geometry.widthMm === copies[0].geometry.widthMm);
  if (!circular || profile.layoutMode === "grid") return grid;
  const hex = createHexPlan(copies, profile);
  if (profile.layoutMode === "hex") return hex;
  return hex.pageCount <= grid.pageCount ? hex : grid;
}

function createShelfPlan(copies: PrintArtwork[], profile: ArtworkProductionProfile): ImpositionPlan {

  const placements: PrintPlacement[] = [];
  let pageIndex = 0;
  let x = profile.marginMm;
  let y = profile.marginMm;
  let rowHeight = 0;
  const maxX = profile.pageWidthMm - profile.marginMm;
  const maxY = profile.pageHeightMm - profile.marginMm;
  const availableWidth = maxX - profile.marginMm;
  const availableHeight = maxY - profile.marginMm;

  for (const artwork of copies) {
    const original = { width: artwork.geometry.widthMm + profile.bleedMm * 2, height: artwork.geometry.heightMm + profile.bleedMm * 2, rotated: false };
    const rotated = { width: original.height, height: original.width, rotated: true };
    const candidates = artwork.geometry.allowPrintRotation && original.width !== original.height ? [original, rotated] : [original];
    if (!candidates.some((candidate) => candidate.width <= availableWidth + 0.001 && candidate.height <= availableHeight + 0.001)) {
      throw new Error(`A arte ${artwork.label} não cabe na página com as margens configuradas.`);
    }
    const currentFits = candidates.filter((candidate) => x + candidate.width <= maxX + 0.001 && y + Math.max(rowHeight, candidate.height) <= maxY + 0.001);
    let selected = currentFits.sort((a, b) => Math.max(rowHeight, a.height) - Math.max(rowHeight, b.height))[0] ?? candidates[0];
    if (x + selected.width > maxX + 0.001) {
      x = profile.marginMm;
      y += rowHeight + profile.gapMm;
      rowHeight = 0;
      selected = candidates.filter((candidate) => x + candidate.width <= maxX + 0.001).sort((a, b) => a.height - b.height)[0] ?? candidates[0];
    }
    if (y + selected.height > maxY + 0.001) {
      pageIndex += 1;
      x = profile.marginMm;
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
      bleedMm: profile.bleedMm,
      rotated: selected.rotated
    });
    x += selected.width + profile.gapMm;
    rowHeight = Math.max(rowHeight, selected.height);
  }

  return { pageCount: pageIndex + 1, copyCount: copies.length, placements };
}

function createHexPlan(copies: PrintArtwork[], profile: ArtworkProductionProfile): ImpositionPlan {
  const outer = copies[0].geometry.widthMm + profile.bleedMm * 2;
  const horizontalStep = outer + profile.gapMm;
  const verticalStep = outer * Math.sqrt(3) / 2 + profile.gapMm;
  const availableWidth = profile.pageWidthMm - profile.marginMm * 2;
  const availableHeight = profile.pageHeightMm - profile.marginMm * 2;
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
      xMm: profile.marginMm + (row % 2 ? horizontalStep / 2 : 0) + offset * horizontalStep,
      yMm: profile.marginMm + row * verticalStep,
      geometry: artwork.geometry,
      bleedMm: profile.bleedMm,
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
      const scale = 8;
      const width = Math.round((artwork.geometry.widthMm + profile.bleedMm * 2) * scale);
      const height = Math.round((artwork.geometry.heightMm + profile.bleedMm * 2) * scale);
      const inset = profile.bleedMm * scale;
      const svg = createShapeSvg({
        shape: artwork.geometry.shape, width, height, inset,
        cornerRadius: artwork.geometry.cornerRadiusMm * scale,
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
    const originalWidthPt = mmToPoints(placement.geometry.widthMm + placement.bleedMm * 2);
    const originalHeightPt = mmToPoints(placement.geometry.heightMm + placement.bleedMm * 2);
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
