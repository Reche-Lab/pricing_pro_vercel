import type { PlatformRule, PricingAnchors } from "./types";

export type DemoProductVariant = {
  id: string;
  productName: string;
  variantName: string;
  anchors: PricingAnchors;
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
    anchors: { 1: 6.9, 10: 2.9, 50: 1.85, 100: 1.55, 500: 1.18, 1000: 0.98 }
  },
  {
    id: "demo-tag-premium",
    productName: "Tag Personalizada Demo",
    variantName: "Premium",
    unitCost: 0.88,
    unitWeightKg: 0.006,
    anchors: { 1: 9.9, 10: 4.2, 50: 2.95, 100: 2.48, 500: 2.08, 1000: 1.74 }
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
