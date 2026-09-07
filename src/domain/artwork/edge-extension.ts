// Extrapolate boundary slopes instead of enlarging the original gradient.
export function extendArtworkEdges(source: Uint8ClampedArray, width: number, height: number, padding: number) {
  if (![width, height, padding].every(Number.isInteger) || width < 1 || height < 1 || padding < 0 ||
      source.length !== width * height * 4 || (width + padding * 2) * (height + padding * 2) > 4_000_000) {
    throw new Error("Invalid edge extension dimensions.");
  }
  const outWidth = width + padding * 2, outHeight = height + padding * 2;
  const pixels = new Uint8ClampedArray(outWidth * outHeight * 4);
  const bandX = Math.min(12, width - 1), bandY = Math.min(12, height - 1);
  for (let y = 0; y < outHeight; y++) for (let x = 0; x < outWidth; x++) {
    const sx = Math.max(0, Math.min(width - 1, x - padding));
    const sy = Math.max(0, Math.min(height - 1, y - padding));
    const dx = x - padding - sx, dy = y - padding - sy;
    const inwardX = dx < 0 ? bandX : width - 1 - bandX;
    const inwardY = dy < 0 ? bandY : height - 1 - bandY;
    const sourceIndex = (sy * width + sx) * 4, target = (y * outWidth + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      const edge = source[sourceIndex + channel];
      const slopeX = dx && bandX ? (edge - source[(sy * width + inwardX) * 4 + channel]) / bandX : 0;
      const slopeY = dy && bandY ? (edge - source[(inwardY * width + sx) * 4 + channel]) / bandY : 0;
      pixels[target + channel] = Math.round(edge + slopeX * Math.abs(dx) + slopeY * Math.abs(dy));
    }
    pixels[target + 3] = source[sourceIndex + 3];
  }
  return { pixels, width: outWidth, height: outHeight };
}
