import { artworkContour } from "./artwork-contour";

function validate(source: Uint8ClampedArray, width: number, height: number, padding = 0) {
  if (![width, height, padding].every(Number.isInteger) || width < 1 || height < 1 || padding < 0 ||
      source.length !== width * height * 4 || (width + padding * 2) * (height + padding * 2) > 4_000_000) {
    throw new Error("Invalid edge extension dimensions.");
  }
}

/** Extends the visible outer contour, including curved cuts and transparent file margins. */
export function extendArtworkEdges(source: Uint8ClampedArray, width: number, height: number, padding: number, options: { backgroundOnly?: boolean } = {}) {
  validate(source, width, height, padding);
  const outWidth = width + padding * 2, outHeight = height + padding * 2;
  const pixels = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < height; y++) {
    pixels.set(source.subarray(y * width * 4, (y + 1) * width * 4), ((y + padding) * outWidth + padding) * 4);
  }
  if (!padding) {
    if (options.backgroundOnly) pixels.fill(0);
    return { pixels, width: outWidth, height: outHeight };
  }
  const contour = artworkContour(pixels, outWidth, outHeight);
  const slopes = new Map<number, number[]>();
  for (let i = 0; i < contour.nearest.length; i++) {
    const alpha = pixels[i * 4 + 3];
    if ((alpha && !options.backgroundOnly) || !contour.exterior[i] || contour.distance[i] > padding * padding) {
      if (options.backgroundOnly) pixels[i * 4 + 3] = 0;
      continue;
    }
    const seed = contour.nearest[i];
    if (seed < 0) continue;
    const sx = seed % outWidth - padding, sy = Math.floor(seed / outWidth) - padding;
    let slope = slopes.get(seed);
    if (!slope) {
      slope = boundarySlope(source, width, height, sx, sy, contour.threshold);
      slopes.set(seed, slope);
    }
    const dx = i % outWidth - padding - sx, dy = Math.floor(i / outWidth) - padding - sy;
    for (let channel = 0; channel < 3; channel++) {
      pixels[i * 4 + channel] = Math.round(slope[channel * 3] + slope[channel * 3 + 1] * dx + slope[channel * 3 + 2] * dy);
    }
    // Fill behind antialiased fringe pixels, without drawing the foreground twice.
    pixels[i * 4 + 3] = options.backgroundOnly && alpha
      ? (contour.maxAlpha - alpha) * 255 / (255 - alpha)
      : contour.maxAlpha;
  }
  return { pixels, width: outWidth, height: outHeight };
}

// Fit a local color plane from inward visible pixels; transparent corners cannot bias the gradient.
function boundarySlope(source: Uint8ClampedArray, width: number, height: number, sx: number, sy: number, threshold: number) {
  let count = 0, sumX = 0, sumY = 0, xx = 0, xy = 0, yy = 0;
  const colors = [0, 0, 0], xc = [0, 0, 0], yc = [0, 0, 0];
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = (y * width + x) * 4;
    if (source[i + 3] < threshold) continue;
    count++; sumX += dx; sumY += dy;
    xx += dx * dx; xy += dx * dy; yy += dy * dy;
    for (let c = 0; c < 3; c++) {
      colors[c] += source[i + c]; xc[c] += dx * source[i + c]; yc[c] += dy * source[i + c];
    }
  }
  xx -= sumX * sumX / count; xy -= sumX * sumY / count; yy -= sumY * sumY / count;
  const determinant = xx * yy - xy * xy;
  return colors.flatMap((color, c) => {
    const xColor = xc[c] - sumX * color / count, yColor = yc[c] - sumY * color / count;
    const gx = determinant > 1e-8 ? (xColor * yy - yColor * xy) / determinant : xx ? xColor / xx : 0;
    const gy = determinant > 1e-8 ? (yColor * xx - xColor * xy) / determinant : yy ? yColor / yy : 0;
    return [(color - gx * sumX - gy * sumY) / count, gx, gy];
  });
}

/** Maximum distance from visible artwork to the cut mask, in sample pixels. */
export function requiredArtworkEdgePadding(source: Uint8ClampedArray, width: number, height: number, target: Uint8ClampedArray) {
  validate(source, width, height);
  if (target.length !== source.length) throw new Error("Invalid cut mask dimensions.");
  const contour = artworkContour(source, width, height);
  if (contour.nearest[0] < 0) throw new Error("A arte está totalmente transparente. Inclua uma imagem antes de expandir.");
  let maximum = 0;
  for (let i = 0; i < contour.distance.length; i++) {
    if (target[i * 4 + 3] && contour.exterior[i]) maximum = Math.max(maximum, contour.distance[i]);
  }
  return Math.sqrt(maximum);
}
