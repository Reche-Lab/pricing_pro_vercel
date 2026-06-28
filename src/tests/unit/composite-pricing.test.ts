import { describe, expect, it } from "vitest";
import { calculateCompositeQuote } from "@/domain/quotes/composite-pricing";
import type { PricingCurve } from "@/domain/pricing/types";

const curve: PricingCurve = {
  mode: "step",
  points: [
    { quantity: 1, unitPrice: 8 },
    { quantity: 10, unitPrice: 4 },
    { quantity: 15, unitPrice: 3.5 },
    { quantity: 30, unitPrice: 3 },
    { quantity: 45, unitPrice: 2.75 }
  ]
};

const platform = {
  commissionRate: 0,
  fixedFee: 0,
  sellerShippingCost: 0,
  sellerShippingThreshold: 0
};

describe("composite quote pricing", () => {
  it("prices each artwork group by its own quantity", () => {
    const result = calculateCompositeQuote({
      pricingRule: "per_item",
      platform,
      items: [
        item("a", "Botton 2,5", "Arte A", 10),
        item("b", "Botton 2,5", "Arte B", 20)
      ]
    });

    expect(result.items[0].referenceQuantity).toBe(10);
    expect(result.items[0].finalUnitPrice).toBe(4);
    expect(result.items[1].referenceQuantity).toBe(20);
    expect(result.items[1].finalUnitPrice).toBe(3.5);
    expect(result.subtotal).toBe(110);
  });

  it("prices same product by average quantity per artwork", () => {
    const result = calculateCompositeQuote({
      pricingRule: "per_art_average",
      platform,
      items: [
        item("a", "Botton 2,5", "Arte A", 10),
        item("b", "Botton 2,5", "Arte B", 20)
      ]
    });

    expect(result.items[0].referenceQuantity).toBe(15);
    expect(result.items[1].referenceQuantity).toBe(15);
    expect(result.items[0].finalUnitPrice).toBe(3.5);
    expect(result.subtotal).toBe(105);
  });

  it("prices same product by aggregate total quantity", () => {
    const result = calculateCompositeQuote({
      pricingRule: "aggregate_total",
      platform,
      items: [
        item("a", "Botton 2,5", "Arte A", 10),
        item("b", "Botton 2,5", "Arte B", 20),
        item("c", "Botton 2,5", "Arte C", 15)
      ]
    });

    expect(result.items[0].referenceQuantity).toBe(45);
    expect(result.items[1].finalUnitPrice).toBe(2.75);
    expect(result.subtotal).toBe(123.75);
  });
});

function item(id: string, description: string, artworkName: string, quantity: number) {
  return {
    id,
    productVariantId: "variant-1",
    description,
    artworkName,
    quantity,
    unitCost: 1,
    curve
  };
}
