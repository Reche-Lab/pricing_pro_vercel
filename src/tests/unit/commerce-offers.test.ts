import { describe, expect, it } from "vitest";
import { calculateCart, type PriceProduct } from "@/domain/commerce/commerce";
import { commercePriceSummary } from "@/domain/commerce/offers";
import { commerceDeliveryEstimate } from "@/domain/commerce/delivery";

const product: PriceProduct = {
  id: "product", name: "Botton", minQuantity: 10, maxQuantity: 100,
  maxArtworks: 5, pricingRule: "per_art",
  curve: { mode: "step", points: [{ quantity: 1, unitPrice: 10 }, { quantity: 50, unitPrice: 6 }, { quantity: 200, unitPrice: 1 }] },
  platform: { commissionRate: 0, fixedFee: 0, sellerShippingCost: 0, sellerShippingThreshold: 0 },
};
describe("store price references", () => {
  it("compares with one unit even when minimum purchase is higher, within published limits", () => {
    expect(commercePriceSummary(product)).toMatchObject({ originalUnitCents: 1000, maxDiscountPercent: 40, discountQuantity: 50 });
  });
  it("matches authoritative prices including fees, thresholds and non-monotonic curves", () => {
    const p = { ...product, curve: { ...product.curve, mode: "interpolated" as const, points: [{ quantity: 1, unitPrice: 12 }, { quantity: 30, unitPrice: 2 }, { quantity: 100, unitPrice: 8 }] },
      platform: { commissionRate: .12, fixedFee: 6, sellerShippingCost: 5, sellerShippingThreshold: 180 } };
    const prices = Array.from({ length: 91 }, (_, i) => calculateCart([{ id: "line", productId: p.id, quantity: i + 10, artworkName: "", artworkId: null }], [p]).items[0].unitCents);
    const summary = commercePriceSummary(p);
    expect(summary.minimumUnitCents).toBe(Math.min(...prices));
    expect(summary.discountQuantity).toBe(prices.indexOf(Math.min(...prices)) + 10);
  });
  it("does not advertise discounts for flat, rising or zero-price curves", () => {
    for (const unitPrice of [0, 10, 12]) {
      const p = { ...product, curve: { mode: "step" as const, points: [{ quantity: 1, unitPrice: unitPrice }] } };
      expect(commercePriceSummary(p).maxDiscountPercent).toBe(0);
    }
  });
});
describe("product delivery consultation", () => {
  const settings = { deliveryEnabled: true, deliveryCents: 1500, deliveryDescription: "Entrega local", pickupEnabled: true, pickupAddress: "Rua da loja, 10" };
  const lines = [{ id: "line", productId: product.id, quantity: 10, artworkName: "", artworkId: null }];
  it("does not require a working price curve to consult a configured delivery tariff", () => {
    expect(commerceDeliveryEstimate(settings, "12345678", lines, [{ ...product, curve: { mode: "step", points: [] } }]).options[0].priceCents).toBe(1500);
  });
  it("still validates quantities and artwork groups without calculating the price", () => {
    for (const quantity of [0, 9, 101, 1.5])
      expect(() => commerceDeliveryEstimate(settings, "12345678", [{ ...lines[0], quantity }], [product])).toThrow();
    expect(() => commerceDeliveryEstimate(settings, "12345678", [lines[0], lines[0]], [product])).toThrow();
    expect(() => commerceDeliveryEstimate(settings, "12345678", [lines[0], { ...lines[0], id: "other" }], [{ ...product, maxArtworks: 1 }])).toThrow();
  });
  it("uses the configured tariff and pickup without changing cart or promising transit time", () => {
    expect(commerceDeliveryEstimate(settings, "12345-678", lines, [product])).toEqual({
      postalCode: "12345678", estimated: true,
      options: [{ id: "delivery", name: "Entrega local", priceCents: 1500 }, { id: "pickup", name: "Retirada na loja", priceCents: 0, description: "Rua da loja, 10" }],
    });
  });
  it("rejects invalid CEPs and unavailable products and preserves zero-price delivery", () => {
    expect(() => commerceDeliveryEstimate(settings, "abc12345678", lines, [product])).toThrow();
    expect(() => commerceDeliveryEstimate(settings, "00000000", lines, [product])).toThrow();
    expect(() => commerceDeliveryEstimate(settings, "12345678", lines, [])).toThrow();
    expect(commerceDeliveryEstimate({ ...settings, deliveryCents: 0, pickupEnabled: false }, "12345678", lines, [product]).options[0].priceCents).toBe(0);
    expect(commerceDeliveryEstimate({ ...settings, deliveryEnabled: false, pickupEnabled: false }, "12345678", lines, [product]).options).toEqual([]);
  });
});
