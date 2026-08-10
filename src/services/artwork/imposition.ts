import { PDFDocument, rgb } from "pdf-lib";
import { decodeImageDataUrl, mmToPoints, type ArtworkProductionProfile } from "./production";

export type PrintArtwork = {
  id: string;
  label: string;
  quantity: number;
  diameterMm: number;
  preparedDataUrl: string;
};

export type PrintPlacement = {
  artworkId: string;
  label: string;
  pageIndex: number;
  xMm: number;
  yMm: number;
  diameterMm: number;
  bleedMm: number;
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
  ).sort((a, b) => b.diameterMm - a.diameterMm);
  if (!copies.length) return { pageCount: 0, copyCount: 0, placements: [] };

  const grid = createShelfPlan(copies, profile);
  const sameDiameter = copies.every((copy) => copy.diameterMm === copies[0].diameterMm);
  if (!sameDiameter || profile.layoutMode === "grid") return grid;
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

  for (const artwork of copies) {
    const outer = artwork.diameterMm + profile.bleedMm * 2;
    if (outer > maxX - profile.marginMm || outer > maxY - profile.marginMm) {
      throw new Error(`A arte ${artwork.label} não cabe na página com as margens configuradas.`);
    }
    if (x + outer > maxX + 0.001) {
      x = profile.marginMm;
      y += rowHeight + profile.gapMm;
      rowHeight = 0;
    }
    if (y + outer > maxY + 0.001) {
      pageIndex += 1;
      x = profile.marginMm;
      y = profile.marginMm;
      rowHeight = 0;
    }
    placements.push({
      artworkId: artwork.id,
      label: artwork.label,
      pageIndex,
      xMm: x,
      yMm: y,
      diameterMm: artwork.diameterMm,
      bleedMm: profile.bleedMm
    });
    x += outer + profile.gapMm;
    rowHeight = Math.max(rowHeight, outer);
  }

  return { pageCount: pageIndex + 1, copyCount: copies.length, placements };
}

function createHexPlan(copies: PrintArtwork[], profile: ArtworkProductionProfile): ImpositionPlan {
  const outer = copies[0].diameterMm + profile.bleedMm * 2;
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
      diameterMm: artwork.diameterMm,
      bleedMm: profile.bleedMm
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

  for (const artwork of artworks) {
    const imageBytes = decodeImageDataUrl(artwork.preparedDataUrl);
    imageById.set(artwork.id, await pdf.embedPng(new Uint8Array(imageBytes)));
  }

  for (const placement of plan.placements) {
    const page = pages[placement.pageIndex];
    const image = imageById.get(placement.artworkId);
    if (!image) continue;
    const outerMm = placement.diameterMm + placement.bleedMm * 2;
    const outerPt = mmToPoints(outerMm);
    const x = mmToPoints(placement.xMm);
    const y = page.getHeight() - mmToPoints(placement.yMm) - outerPt;
    page.drawImage(image, { x, y, width: outerPt, height: outerPt });
    if (profile.drawCutLines) {
      page.drawCircle({
        x: x + outerPt / 2,
        y: y + outerPt / 2,
        size: mmToPoints(placement.diameterMm) / 2,
        borderColor: rgb(0.15, 0.15, 0.15),
        borderWidth: 0.25,
        opacity: 0,
        borderOpacity: 0.7
      });
    }
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, plan };
}
