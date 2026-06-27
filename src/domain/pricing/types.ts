export type PricingAnchorQuantity = 1 | 10 | 50 | 100 | 500 | 1000;

export type PricingAnchors = Record<PricingAnchorQuantity, number>;

export type PricingMethod = "anchors" | "logistic";

export type PlatformRule = {
  commissionRate: number;
  fixedFee: number;
  sellerShippingCost: number;
  sellerShippingThreshold: number;
};

export type ProductVariantCost = {
  unitCost: number;
  unitWeightKg: number;
};

export type QuoteCalculationInput = {
  quantity: number;
  unitCost: number;
  method: PricingMethod;
  anchors?: PricingAnchors;
  logistic?: {
    basePrice: number;
    minPrice: number;
    q0: number;
    n: number;
  };
  platform: PlatformRule;
};

export type QuoteCalculationResult = {
  quantity: number;
  baseUnitPrice: number;
  finalUnitPrice: number;
  subtotal: number;
  commissionTotal: number;
  fixedFeeTotal: number;
  sellerShippingTotal: number;
  costOfGoodsTotal: number;
  totalCost: number;
  profit: number;
  marginPercent: number;
};

export type PricingSimulationPoint = QuoteCalculationResult & {
  label: string;
};
