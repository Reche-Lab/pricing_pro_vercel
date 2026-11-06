import type { CartLine } from "./schemas";

/** Reads cents returned by pricing, never estimates a reward from the advertised maximum. */
export function artworkDiscountForLines(
  calculation: { items: { id: string; artworkDiscountCents?: number }[] } | null,
  lines: readonly CartLine[],
  productId: string,
  artworkId: string,
): number | null {
  if (!calculation) return null;
  const ids = new Set(lines.filter(line => line.productId === productId && line.artworkId === artworkId && line.preparation !== "team").map(line => line.id));
  let total = 0;
  for (const id of ids) {
    const item = calculation.items.find(item => item.id === id);
    if (!item || !Number.isSafeInteger(item.artworkDiscountCents) || item.artworkDiscountCents! < 0) return null;
    total += item.artworkDiscountCents!;
  }
  return total;
}
