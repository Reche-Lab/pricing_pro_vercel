export type ArtworkFrame = { scale: number; offsetX: number; offsetY: number; rotationDegrees: number };

export function artworkFramePlacement(width: number, height: number, frame: ArtworkFrame) {
  const imageWidth = width * frame.scale;
  const imageHeight = height * frame.scale;
  return {
    x: (width - imageWidth) / 2 + frame.offsetX * width / 2,
    y: (height - imageHeight) / 2 + frame.offsetY * height / 2,
    width: imageWidth,
    height: imageHeight,
    rotationDegrees: frame.rotationDegrees
  };
}

export function framedArtworkSize(sourceWidth: number, sourceHeight: number, aspectRatio: number) {
  const width = Math.min(sourceWidth, sourceHeight * aspectRatio);
  const height = width / aspectRatio;
  const reduction = Math.min(1, Math.sqrt(30_000_000 / (width * height)), 20_000 / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * reduction)), height: Math.max(1, Math.floor(height * reduction)) };
}

export function fitArtworkViewport(width: number, height: number, availableWidth: number, availableHeight: number) {
  if (width <= 0 || height <= 0 || availableWidth <= 0 || availableHeight <= 0) return { width: 0, height: 0 };
  const scale = Math.min(availableWidth / width, availableHeight / height);
  return { width: width * scale, height: height * scale };
}
