/** Nearest visible pixel (Euclidean distance) and exterior transparency of an RGBA image. */
export function artworkContour(pixels: Uint8ClampedArray, width: number, height: number) {
  const size = width * height;
  const nearest = new Int32Array(size).fill(-1);
  const distance = new Float64Array(size).fill(Infinity);
  let maxAlpha = 0;
  for (let i = 3; i < pixels.length; i += 4) maxAlpha = Math.max(maxAlpha, pixels[i]);
  const threshold = maxAlpha || 255;
  const exterior = new Uint8Array(size);
  if (!maxAlpha) return { nearest, distance, exterior, threshold, maxAlpha };

  // Horizontal distances followed by the lower envelope of vertical parabolas.
  const horizontal = new Float64Array(size).fill(Infinity);
  const nearestX = new Int32Array(size).fill(-1);
  for (let y = 0; y < height; y++) {
    let seed = -1;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (pixels[i * 4 + 3] >= threshold) seed = x;
      if (seed >= 0) { horizontal[i] = (x - seed) ** 2; nearestX[i] = seed; }
    }
    seed = -1;
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (pixels[i * 4 + 3] >= threshold) seed = x;
      if (seed >= 0 && (x - seed) ** 2 < horizontal[i]) {
        horizontal[i] = (x - seed) ** 2; nearestX[i] = seed;
      }
    }
  }
  const rows = new Int32Array(height), intersections = new Float64Array(height + 1);
  for (let x = 0; x < width; x++) {
    let last = -1;
    for (let y = 0; y < height; y++) {
      const cost = horizontal[y * width + x];
      if (!Number.isFinite(cost)) continue;
      let crossing = -Infinity;
      while (last >= 0) {
        const previous = rows[last];
        crossing = (cost + y * y - horizontal[previous * width + x] - previous * previous) / (2 * (y - previous));
        if (crossing > intersections[last]) break;
        last--;
      }
      last++;
      rows[last] = y;
      intersections[last] = last ? crossing : -Infinity;
      intersections[last + 1] = Infinity;
    }
    if (last < 0) continue;
    let row = 0;
    for (let y = 0; y < height; y++) {
      while (row < last && intersections[row + 1] < y) row++;
      const sy = rows[row], i = y * width + x;
      nearest[i] = sy * width + nearestX[sy * width + x];
      distance[i] = horizontal[sy * width + x] + (y - sy) ** 2;
    }
  }

  // Fill only transparency connected to the exterior, preserving enclosed holes.
  const queue = new Int32Array(size);
  let head = 0, tail = 0;
  function visit(i: number) {
    if (!exterior[i] && pixels[i * 4 + 3] < threshold) {
      exterior[i] = 1; queue[tail++] = i;
    }
  }
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % width;
    if (x) visit(i - 1);
    if (x + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < size) visit(i + width);
  }
  return { nearest, distance, exterior, threshold, maxAlpha };
}
