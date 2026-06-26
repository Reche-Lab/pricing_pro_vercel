import { describe, expect, it } from "vitest";
import { canTransitionQuoteStatus, createQuoteCalculationSnapshot } from "@/domain/quotes/quotes";

describe("quotes domain", () => {
  it("allows only valid quote status transitions", () => {
    expect(canTransitionQuoteStatus("draft", "sent")).toBe(true);
    expect(canTransitionQuoteStatus("sent", "accepted")).toBe(true);
    expect(canTransitionQuoteStatus("accepted", "cancelled")).toBe(false);
  });

  it("creates versioned calculation snapshots", () => {
    const snapshot = createQuoteCalculationSnapshot({
      request: { quantity: 100 },
      product: { name: "Botton" },
      platform: { name: "Venda direta" },
      calculation: {
        quantity: 100,
        baseUnitPrice: 2,
        finalUnitPrice: 2,
        subtotal: 200,
        commissionTotal: 0,
        fixedFeeTotal: 0,
        sellerShippingTotal: 0,
        costOfGoodsTotal: 80,
        totalCost: 80,
        profit: 120,
        marginPercent: 60
      }
    });

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.createdAt).toEqual(expect.any(String));
    expect(snapshot.calculation.marginPercent).toBe(60);
  });
});
