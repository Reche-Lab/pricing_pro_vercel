import { createPrintGuideLayout } from "@/domain/artwork/geometry";
import { artworkCoverage } from "@/domain/artwork/coverage";
import type { ArtworkStudioAsset } from "./artwork-studio-types";
import { drawArtworkFrame } from "./artwork-frame-canvas";

export async function inspectArtworkCoverage(asset: ArtworkStudioAsset) {
  if (!asset.geometry) return { warning: false, uncoveredPercent: 0 };
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.crossOrigin = "anonymous";
    image.onload = () => resolve(image); image.onerror = () => reject(new Error("Não foi possível verificar a cobertura da arte. Reabra o enquadramento e tente novamente.")); image.src = asset.sourceUrl;
  });
  const canvas = document.createElement("canvas"), mask = document.createElement("canvas");
  const size = createPrintGuideLayout({ geometry: asset.geometry, margins: asset.margins, viewportWidth: 256, viewportHeight: 256 });
  canvas.width = mask.width = 256;
  canvas.height = mask.height = Math.max(1, Math.round(256 * size.outputHeightMm / size.outputWidthMm));
  const layout = createPrintGuideLayout({ geometry: asset.geometry, margins: asset.margins, viewportWidth: canvas.width, viewportHeight: canvas.height });
  const context = canvas.getContext("2d", { willReadFrequently: true })!, maskContext = mask.getContext("2d", { willReadFrequently: true })!;
  drawArtworkFrame(context, source, source.naturalWidth, source.naturalHeight, canvas.width, canvas.height, asset.crop);
  maskContext.fillStyle = "white"; maskContext.fill(new Path2D(layout.cut.path));
  return artworkCoverage(context.getImageData(0, 0, canvas.width, canvas.height).data, maskContext.getImageData(0, 0, canvas.width, canvas.height).data);
}
