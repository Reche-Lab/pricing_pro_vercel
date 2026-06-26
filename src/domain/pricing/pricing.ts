import type {
  PlatformRule,
  PricingAnchors,
  QuoteCalculationInput,
  QuoteCalculationResult
} from "./types";

const ANCHOR_QUANTITIES = [1, 10, 50, 100, 500, 1000] as const;

export function clampQuantity(quantity: number, min = 1, max = 50000): number {
  if (!Number.isFinite(quantity)) return min;
  return Math.max(min, Math.min(max, Math.trunc(quantity)));
}

export function calculateLogisticUnitPrice(
  quantity: number,
  minPrice: number,
  basePrice: number,
  q0: number,
  n: number
): number {
  const q = clampQuantity(quantity);
  if (q >= 1000) return minPrice;
  const denominator = 1 + Math.pow(q / q0, n);
  return minPrice + (basePrice - minPrice) / denominator;
}

export function interpolateGeometric(
  quantity: number,
  q1: number,
  p1: number,
  q2: number,
  p2: number
): number {
  const t = (Math.log(quantity) - Math.log(q1)) / (Math.log(q2) - Math.log(q1));
  return p1 * Math.pow(p2 / p1, t);
}

export function calculateAnchoredUnitPrice(quantity: number, anchors: PricingAnchors): number {
  const q = clampQuantity(quantity);
  if (q <= 1) return anchors[1];
  if (q >= 1000) return anchors[1000];

  for (let i = 0; i < ANCHOR_QUANTITIES.length - 1; i += 1) {
    const q1 = ANCHOR_QUANTITIES[i];
    const q2 = ANCHOR_QUANTITIES[i + 1];
    if (q >= q1 && q <= q2) {
      return interpolateGeometric(q, q1, anchors[q1], q2, anchors[q2]);
    }
  }

  return anchors[1000];
}

export function recomputeIntermediateAnchors(anchors: PricingAnchors): PricingAnchors {
  const base = anchors[1];
  const min = anchors[1000];
  const output = { ...anchors };
  const logDenominator = Math.log(1000) - Math.log(1);

  for (const quantity of [10, 50, 100, 500] as const) {
    const weight = (Math.log(quantity) - Math.log(1)) / logDenominator;
    output[quantity] = base * Math.pow(min / base, weight);
  }

  return output;
}

export function calculateFinalUnitPrice(
  quantity: number,
  baseUnitPrice: number,
  platform: PlatformRule
): number {
  const q = clampQuantity(quantity);
  const commission = Math.max(0, platform.commissionRate);
  const fixedFee = Math.max(0, platform.fixedFee);
  const sellerShippingCost = Math.max(0, platform.sellerShippingCost);
  const sellerShippingThreshold = Math.max(0, platform.sellerShippingThreshold);
  const divisor = Math.max(1 - commission, 0.0001);

  const initialPrice = (baseUnitPrice + fixedFee / q) / divisor;

  let includeSellerShipping = false;
  if (sellerShippingCost > 0) {
    if (sellerShippingThreshold > 0) {
      includeSellerShipping = initialPrice * q >= sellerShippingThreshold;
    } else {
      includeSellerShipping = true;
    }
  }

  if (!includeSellerShipping) return initialPrice;

  return (baseUnitPrice + (fixedFee + sellerShippingCost) / q) / divisor;
}

export function calculatePlatformCosts(orderTotal: number, platform: PlatformRule) {
  const commissionTotal = Math.max(0, platform.commissionRate) * orderTotal;
  const fixedFeeTotal = Math.max(0, platform.fixedFee);
  const threshold = Math.max(0, platform.sellerShippingThreshold);
  const ship = Math.max(0, platform.sellerShippingCost);
  const sellerShippingTotal = ship > 0 ? (threshold > 0 ? (orderTotal >= threshold ? ship : 0) : ship) : 0;

  return { commissionTotal, fixedFeeTotal, sellerShippingTotal };
}

export function calculateQuote(input: QuoteCalculationInput): QuoteCalculationResult {
  const quantity = clampQuantity(input.quantity);
  const baseUnitPrice =
    input.method === "anchors"
      ? calculateAnchoredUnitPrice(quantity, requireAnchors(input.anchors))
      : calculateLogisticUnitPrice(
          quantity,
          requireLogistic(input.logistic).minPrice,
          requireLogistic(input.logistic).basePrice,
          requireLogistic(input.logistic).q0,
          requireLogistic(input.logistic).n
        );

  const finalUnitPrice = calculateFinalUnitPrice(quantity, baseUnitPrice, input.platform);
  const subtotal = finalUnitPrice * quantity;
  const { commissionTotal, fixedFeeTotal, sellerShippingTotal } = calculatePlatformCosts(
    subtotal,
    input.platform
  );
  const costOfGoodsTotal = input.unitCost * quantity;
  const totalCost = costOfGoodsTotal + commissionTotal + fixedFeeTotal + sellerShippingTotal;
  const profit = subtotal - totalCost;
  const marginPercent = subtotal > 0 ? (profit / subtotal) * 100 : 0;

  return {
    quantity,
    baseUnitPrice,
    finalUnitPrice,
    subtotal,
    commissionTotal,
    fixedFeeTotal,
    sellerShippingTotal,
    costOfGoodsTotal,
    totalCost,
    profit,
    marginPercent
  };
}

function requireAnchors(anchors: PricingAnchors | undefined): PricingAnchors {
  if (!anchors) throw new Error("Pricing anchors are required for anchored pricing.");
  return anchors;
}

function requireLogistic(logistic: QuoteCalculationInput["logistic"]) {
  if (!logistic) throw new Error("Logistic parameters are required for logistic pricing.");
  return logistic;
}
