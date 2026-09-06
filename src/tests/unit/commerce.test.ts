import { describe, expect, it } from "vitest";
import {
  calculateCart,
  distributeQuantity,
  validatePayment,
} from "@/domain/commerce/commerce";
import { cartLineSchema } from "@/domain/commerce/schemas";

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Botton",
  minQuantity: 1,
  maxQuantity: 1000,
  maxArtworks: 5,
  pricingRule: "per_art" as const,
  curve: {
    mode: "step" as const,
    points: [
      { quantity: 1, unitPrice: 5 },
      { quantity: 50, unitPrice: 3 },
    ],
  },
  platform: {
    commissionRate: 0,
    fixedFee: 0,
    sellerShippingCost: 0,
    sellerShippingThreshold: 0,
  },
};
const line = (id: string, quantity: number) => ({
  id,
  productId: product.id,
  quantity,
  artworkName: id,
  artworkId: null,
});
describe("commerce core", () => {
  it("distributes all units without rounding away units", () =>
    expect(distributeQuantity(100, 3)).toEqual([34, 33, 33]));
  it("prices distinct artwork groups rather than trusting the browser", () => {
    expect(
      calculateCart([line("a", 30), line("b", 30)], [product]).totalCents,
    ).toBe(30000);
    expect(
      calculateCart(
        [line("a", 30), line("b", 30)],
        [{ ...product, pricingRule: "total" }],
      ).totalCents,
    ).toBe(18000);
  });
  it("keeps a fixed channel fee at order level", () => {
    const priced = calculateCart(
      [line("a", 10), line("b", 10)],
      [{ ...product, platform: { ...product.platform, fixedFee: 10 } }],
    );
    expect(priced.totalCents).toBe(11000);
  });
  it("enforces publication availability and total quantity limits across split lines", () => {
    expect(() =>
      calculateCart([line("a", 800), line("b", 800)], [product]),
    ).toThrow();
    expect(() => calculateCart([line("a", 10)], [])).toThrow();
    expect(() => distributeQuantity(2, 3)).toThrow();
  });
  it("rejects duplicate group ids and client supplied prices", () => {
    expect(() =>
      calculateCart([line("a", 2), line("a", 2)], [product]),
    ).toThrow();
    expect(
      cartLineSchema.safeParse({
        ...line(crypto.randomUUID(), 1),
        unitPrice: 0.01,
      }).success,
    ).toBe(false);
  });
  it("requires amount, currency, seller and order to match authoritative payment", () => {
    const expected = { id: "order", total_cents: 1234, sellerId: "42" };
    const actual = {
      external_reference: "order",
      transaction_amount: 12.34,
      currency_id: "BRL",
      collector_id: 42,
      status: "approved",
    };
    expect(validatePayment(expected, actual)).toBe("paid");
    expect(() =>
      validatePayment(expected, { ...actual, transaction_amount: 12 }),
    ).toThrow();
    expect(() =>
      validatePayment(expected, { ...actual, collector_id: 99 }),
    ).toThrow();
    expect(validatePayment(expected, { ...actual, status: "pending" })).toBe(
      "pending",
    );
  });
});
