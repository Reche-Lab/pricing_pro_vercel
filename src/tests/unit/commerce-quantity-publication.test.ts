import { describe, expect, it } from "vitest";
import { calculateCart, type PriceProduct } from "@/domain/commerce/commerce";
import { commerceQuantityPricing, quantitySelection } from "@/domain/commerce/quantity-pricing";

const product: PriceProduct = { id: "product", name: "Botton", minQuantity: 10, maxQuantity: 1000, maxArtworks: 10, personalized: true, pricingRule: "per_art", curve: { mode: "step", points: [{ quantity: 1, unitPrice: 5 }, { quantity: 100, unitPrice: 3 }, { quantity: 1000, unitPrice: 2 }] }, platform: { commissionRate: 0, fixedFee: 0, sellerShippingCost: 0, sellerShippingThreshold: 0 } };
describe("public quantity pricing uses authoritative cart amounts", () => {
  it("publishes real rows, the minimum purchasable total and the qualified lowest unit price", () => {
    const pricing = commerceQuantityPricing(product);
    expect(pricing.minimumPurchase).toMatchObject({ quantity: 10, unitCents: 500, totalCents: 5000 });
    expect(pricing.bestPrice).toMatchObject({ quantity: 1000, unitCents: 200, totalCents: 200000, discountPercent: 60 });
    expect(pricing.originalUnitCents).toBe(500);
    expect(pricing.rows.some(row => row.quantity === 1)).toBe(false);
    expect(pricing.rows.map(row => row.quantity)).toEqual([...new Set(pricing.rows.map(row => row.quantity))].sort((a, b) => a - b));
  });
  it.each(["step", "interpolated"] as const)("matches the cart in %s mode including fees, thresholds and non-monotonic prices", mode => {
    const p = { ...product, minQuantity: 17, maxQuantity: 347, curve: { mode, points: [{ quantity: 1, unitPrice: 9 }, { quantity: 101, unitPrice: 2 }, { quantity: 500, unitPrice: 5 }] }, platform: { commissionRate: .15, fixedFee: 5.7, sellerShippingCost: 9.2, sellerShippingThreshold: 190 } };
    const pricing = commerceQuantityPricing(p);
    for (const row of pricing.rows) {
      const actual = calculateCart([{ id: "line", productId: p.id, quantity: row.quantity, artworkName: "", artworkId: null }], [p]);
      expect(row.unitCents).toBe(actual.items[0].unitCents); expect(row.totalCents).toBe(actual.totalCents);
      expect(row.savingsCents).toBe(Math.max(0, pricing.originalUnitCents * row.quantity - actual.totalCents));
    }
    expect(pricing.rows.length).toBeLessThanOrEqual(12);
    expect(pricing.rows.some(row => row.quantity === pricing.bestPrice.quantity)).toBe(true);
  });
  it("separates approved-art benefits from unconditional quantity prices", () => {
    const pricing = commerceQuantityPricing({ ...product, artworkOptions: { discountFixedCents: 10000, maxDiscountPercent: 10 } as PriceProduct["artworkOptions"] });
    expect(pricing.bestPrice.totalCents).toBe(200000);
    expect(pricing.bestPrice.discountPercent).toBe(60);
  });
  it("does not fabricate discounts on flat/rising/zero curves or outside the published range", () => {
    for (const unitPrice of [0, 5]) {
      const pricing = commerceQuantityPricing({ ...product, curve: { mode: "step", points: [{ quantity: 1, unitPrice }] } });
      expect(pricing.bestPrice.discountPercent).toBe(0);
    }
    const pricing = commerceQuantityPricing({ ...product, minQuantity: 1000, maxQuantity: 1000 });
    expect(pricing.rows).toHaveLength(1);
  });
  it("uses a bounded table for dense curves without exposing curve/cost internals", () => {
    const pricing = commerceQuantityPricing({ ...product, curve: { mode: "step", points: Array.from({ length: 300 }, (_, i) => ({ quantity: i + 1, unitPrice: 4 - i / 100 })) } });
    expect(pricing.rows.length).toBeLessThanOrEqual(12);
    expect(JSON.stringify(pricing)).not.toMatch(/commissionRate|fixedFee|curve|unitCost/);
  });
  it("does not advertise quantities beyond the actual cart total limit", () => {
    const p = { ...product, maxQuantity: 500, curve: { mode: "interpolated" as const, points: [{ quantity: 1, unitPrice: 10000 }, { quantity: 500, unitPrice: 3000 }] } };
    const pricing = commerceQuantityPricing(p);
    expect(pricing.bestPrice.quantity).toBeLessThan(500);
    expect(pricing.rows.some(row => row.quantity === 500)).toBe(false);
    for (const row of pricing.rows) expect(() => calculateCart([{ id: "line", productId: p.id, quantity: row.quantity, artworkName: "", artworkId: null }], [p])).not.toThrow();
    expect(pricing.bestPrice.totalCents).toBeLessThanOrEqual(100000000);
  });
});
describe("quantity deep links", () => {
  it("accepts only integer purchasable quantities, otherwise uses the real minimum", () => {
    for (const value of [null, "", "0", "9", "1001", "1.5", "1e2", "Infinity", "-100"]) expect(quantitySelection(value, product)).toBe(10);
    expect(quantitySelection("100", product)).toBe(100);
    expect(quantitySelection("1000", product)).toBe(1000);
  });
});
