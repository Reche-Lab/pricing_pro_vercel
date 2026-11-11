// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { generateBuyerQuotePdf } from "@/services/pdf/commerce-buyer-quote-pdf";
import { generateQuotePdf } from "@/services/pdf/quote-pdf";
import { deliveryEstimate } from "@/domain/shipping/production-lead-time";
import { testCommerceBilling } from "../fixtures/commerce-checkout";

vi.mock("@/services/pdf/quote-pdf", () => ({ generateQuotePdf: vi.fn(async () => new Uint8Array()) }));

describe("buyer quote PDF totals", () => {
  it("prints persisted shipping, insured merchandise value and the full total", async () => {
    await generateBuyerQuotePdf({
      id: "quote", tenant_id: "tenant", customer_id: "buyer", valid_until: "2027-01-01", created_at: "2026-11-11",
      subtotal_cents: 10000, shipping_cents: 2200, total_cents: 11700,
      contact: { billing: testCommerceBilling, address: null, deliveryAddressSameAsBilling: true },
      snapshot: {
        items: [], lines: [], delivery: "delivery", storeName: "Loja teste", artworkDiscountCents: 500,
        shippingOption: { id: "melhor_envio:2", name: "Correios - SEDEX", priceCents: 2200, transitDays: 2, insuranceValueCents: 9500 },
        production: deliveryEstimate(301, 2),
      },
    }, { name: "Loja teste", logo_url: null, company_document: null, company_phone: null, company_site: null });
    expect(generateQuotePdf).toHaveBeenLastCalledWith(expect.objectContaining({ quote: expect.objectContaining({
      subtotal: "100", shipping_total: "22", discount_total: "5", grand_total: "117",
      notes: expect.stringContaining("Correios - SEDEX"),
    }) }));
    expect(vi.mocked(generateQuotePdf).mock.calls[0][0].quote.notes).toContain("95,00");
  });
});
