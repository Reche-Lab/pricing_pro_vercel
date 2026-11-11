export function artworkCoverage(pixels: Uint8Array | Uint8ClampedArray, shape: Uint8Array | Uint8ClampedArray) {
  let inspected = 0, uncovered = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if (shape[index] < 250) continue;
    inspected++;
    if (pixels[index] < 245) uncovered++;
  }
  const uncoveredPercent = inspected ? Math.round(uncovered / inspected * 10000) / 100 : 0;
  return { uncoveredPercent, warning: uncoveredPercent > 0.2 };
}
