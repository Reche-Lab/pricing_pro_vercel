import { calculateFinalSubtotal } from "@/domain/quotes/composite-pricing";
import { interpolateGeometric, normalizePricingCurvePoints, roundMoney } from "@/domain/pricing/pricing";
import type { PriceProduct } from "./commerce";

export function commercePriceSummary(product: PriceProduct) {
  const points = normalizePricingCurvePoints(product.curve.points);
  if (!points.length) throw new Error("Pricing curve points are required.");
  let segment = 0;
  function unitCents(quantity: number) {
    while (segment + 1 < points.length && points[segment + 1].quantity <= quantity) segment++;
    const from = points[segment], to = points[segment + 1];
    let base = from.unitPrice;
    if (to && quantity > from.quantity && product.curve.mode !== "step") {
      base = from.unitPrice > 0 && to.unitPrice > 0
        ? interpolateGeometric(quantity, from.quantity, from.unitPrice, to.quantity, to.unitPrice)
        : from.unitPrice + (to.unitPrice - from.unitPrice) * (quantity - from.quantity) / (to.quantity - from.quantity);
    }
    // Match the cart's subtotal rounding and allocation, including the channel fee threshold.
    const subtotal = base * quantity;
    const target = roundMoney(calculateFinalSubtotal(subtotal, product.platform));
    return Math.round(roundMoney(base * (subtotal > 0 ? target / subtotal : 1)) * 100);
  }
  const originalUnitCents = unitCents(1);
  let minimumUnitCents = Infinity, discountQuantity = product.minQuantity;
  // Scan the bounded published range once: rising curves and fee thresholds can have interior minima.
  for (let quantity = product.minQuantity; quantity <= product.maxQuantity; quantity++) {
    const cents = unitCents(quantity);
    if (cents < minimumUnitCents) { minimumUnitCents = cents; discountQuantity = quantity; }
  }
  return {
    originalUnitCents, minimumUnitCents, discountQuantity,
    maxDiscountPercent: originalUnitCents > 0
      ? Math.max(0, Math.floor((originalUnitCents - minimumUnitCents) * 100 / originalUnitCents)) : 0,
  };
}
