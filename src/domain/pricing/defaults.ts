import type { PlatformRule, PricingCurve } from "./types";

export type DemoProductVariant = {
  id: string;
  productName: string;
  variantName: string;
  curve: PricingCurve;
  platformCurves?: Record<string, PricingCurve>;
  unitCost: number;
  unitWeightKg: number;
};

export const demoVariants: DemoProductVariant[] = [
  {
    id: "demo-sticker-round-45",
    productName: "Adesivo Redondo Demo",
    variantName: "4,5 cm",
    unitCost: 0.42,
    unitWeightKg: 0.002,
    curve: {
      mode: "interpolated",
      points: [
        { quantity: 1, unitPrice: 6.9 },
        { quantity: 10, unitPrice: 2.9 },
        { quantity: 50, unitPrice: 1.85 },
        { quantity: 100, unitPrice: 1.55 },
        { quantity: 500, unitPrice: 1.18 },
        { quantity: 1000, unitPrice: 0.98 }
      ]
    }
  },
  {
    id: "demo-tag-premium",
    productName: "Tag Personalizada Demo",
    variantName: "Premium",
    unitCost: 0.88,
    unitWeightKg: 0.006,
    curve: {
      mode: "interpolated",
      points: [
        { quantity: 1, unitPrice: 9.9 },
        { quantity: 10, unitPrice: 4.2 },
        { quantity: 50, unitPrice: 2.95 },
        { quantity: 100, unitPrice: 2.48 },
        { quantity: 500, unitPrice: 2.08 },
        { quantity: 1000, unitPrice: 1.74 }
      ]
    }
  }
];

export const platformPresets = {
  direct: {
    name: "Venda direta",
    commissionRate: 0,
    fixedFee: 0,
    sellerShippingCost: 0,
    sellerShippingThreshold: 0
  },
  marketplace_standard: {
    name: "Marketplace demo",
    commissionRate: 0.14,
    fixedFee: 4,
    sellerShippingCost: 0,
    sellerShippingThreshold: 0
  }
} satisfies Record<string, PlatformRule & { name: string }>;
