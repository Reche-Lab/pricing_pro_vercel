import { describe, expect, it } from "vitest";
import { calculateQuoteDiscount, quoteDiscountLabel } from "@/domain/quotes/discount";

describe("quote discounts", () => {
  it("calculates percentage over product subtotal", () => {
    expect(calculateQuoteDiscount(250, "percent", 10)).toEqual({ type: "percent", value: 10, total: 25 });
  });

  it("limits fixed discounts to the product subtotal", () => {
    expect(calculateQuoteDiscount(100, "fixed", 150)).toEqual({ type: "fixed", value: 100, total: 100 });
  });

  it("builds a customer-facing percentage label", () => {
    expect(quoteDiscountLabel("percent", 7.5, 15)).toBe("Desconto (7,5%)");
  });
});
