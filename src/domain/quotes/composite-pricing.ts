import { calculateCurveUnitPrice, calculatePlatformCosts, roundMoney } from "@/domain/pricing/pricing";
import type { PlatformRule, PricingCurve } from "@/domain/pricing/types";

export type CompositePricingRule = "per_item" | "per_art_average" | "aggregate_total";

export type CompositeQuoteInputItem = {
  id: string;
  productVariantId: string;
  description: string;
  artworkName: string;
  quantity: number;
  unitCost: number;
  curve: PricingCurve;
};

export type CompositeQuoteCalculatedItem = CompositeQuoteInputItem & {
  pricingRule: CompositePricingRule;
  pricingGroupKey: string;
  referenceQuantity: number;
  baseUnitPrice: number;
  finalUnitPrice: number;
  subtotal: number;
  costOfGoodsTotal: number;
  profit: number;
};

export type CompositeQuoteCalculation = {
  items: CompositeQuoteCalculatedItem[];
  baseSubtotal: number;
  subtotal: number;
  commissionTotal: number;
  fixedFeeTotal: number;
  sellerShippingTotal: number;
  costOfGoodsTotal: number;
  totalCost: number;
  profit: number;
  marginPercent: number;
};

export function calculateCompositeQuote(input: {
  items: CompositeQuoteInputItem[];
  platform: PlatformRule;
  pricingRule: CompositePricingRule;
}): CompositeQuoteCalculation {
  const sourceItems = input.items
    .map((item) => ({ ...item, quantity: Math.max(1, Math.trunc(item.quantity)) }))
    .filter((item) => item.quantity > 0);

  const baseItems = sourceItems.map((item) => {
    const referenceQuantity = getReferenceQuantity(item, sourceItems, input.pricingRule);
    const baseUnitPrice = calculateCurveUnitPrice(referenceQuantity, item.curve);
    const baseSubtotal = baseUnitPrice * item.quantity;

    return {
      ...item,
      pricingRule: input.pricingRule,
      pricingGroupKey: item.productVariantId,
      referenceQuantity,
      baseUnitPrice,
      baseSubtotal
    };
  });

  const baseSubtotal = baseItems.reduce((sum, item) => sum + item.baseSubtotal, 0);
  const targetSubtotal = roundMoney(calculateFinalSubtotal(baseSubtotal, input.platform));
  const multiplier = baseSubtotal > 0 ? targetSubtotal / baseSubtotal : 1;

  const items = baseItems.map((item) => {
    const finalUnitPrice = roundMoney(item.baseUnitPrice * multiplier);
    const subtotal = roundMoney(finalUnitPrice * item.quantity);
    const costOfGoodsTotal = item.unitCost * item.quantity;

    return {
      id: item.id,
      productVariantId: item.productVariantId,
      description: item.description,
      artworkName: item.artworkName,
      quantity: item.quantity,
      unitCost: item.unitCost,
      curve: item.curve,
      pricingRule: item.pricingRule,
      pricingGroupKey: item.pricingGroupKey,
      referenceQuantity: item.referenceQuantity,
      baseUnitPrice: item.baseUnitPrice,
      finalUnitPrice,
      subtotal,
      costOfGoodsTotal,
      profit: subtotal - costOfGoodsTotal
    };
  });

  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
  const { commissionTotal, fixedFeeTotal, sellerShippingTotal } = calculatePlatformCosts(subtotal, input.platform);
  const costOfGoodsTotal = items.reduce((sum, item) => sum + item.costOfGoodsTotal, 0);
  const totalCost = costOfGoodsTotal + commissionTotal + fixedFeeTotal + sellerShippingTotal;
  const profit = subtotal - totalCost;

  return {
    items,
    baseSubtotal,
    subtotal,
    commissionTotal,
    fixedFeeTotal,
    sellerShippingTotal,
    costOfGoodsTotal,
    totalCost,
    profit,
    marginPercent: subtotal > 0 ? (profit / subtotal) * 100 : 0
  };
}

function getReferenceQuantity(
  item: CompositeQuoteInputItem,
  allItems: CompositeQuoteInputItem[],
  pricingRule: CompositePricingRule
) {
  if (pricingRule === "per_item") return item.quantity;

  const sameVariant = allItems.filter((candidate) => candidate.productVariantId === item.productVariantId);
  const totalQuantity = sameVariant.reduce((sum, candidate) => sum + candidate.quantity, 0);

  if (pricingRule === "aggregate_total") return totalQuantity;

  const artworkCount = new Set(
    sameVariant.map((candidate) => normalizeArtworkName(candidate.artworkName || candidate.id))
  ).size;

  return Math.max(1, Math.round(totalQuantity / Math.max(artworkCount, 1)));
}

function calculateFinalSubtotal(baseSubtotal: number, platform: PlatformRule) {
  const commission = Math.max(0, platform.commissionRate);
  const fixedFee = Math.max(0, platform.fixedFee);
  const sellerShippingCost = Math.max(0, platform.sellerShippingCost);
  const sellerShippingThreshold = Math.max(0, platform.sellerShippingThreshold);
  const divisor = Math.max(1 - commission, 0.0001);
  const initialSubtotal = (baseSubtotal + fixedFee) / divisor;
  const includeSellerShipping =
    sellerShippingCost > 0 && (sellerShippingThreshold > 0 ? initialSubtotal >= sellerShippingThreshold : true);

  return (baseSubtotal + fixedFee + (includeSellerShipping ? sellerShippingCost : 0)) / divisor;
}

function normalizeArtworkName(value: string) {
  return value.trim().toLowerCase() || "sem arte";
}
