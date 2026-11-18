import { describe, expect, it } from "vitest";
import { analyticsSettingsSchema, analyticsCommercePayload, analyticsPage, analyticsCartChanges, safeAnalyticsParameters } from "@/domain/commerce/analytics";

describe("commerce analytics contracts", () => {
  it("is opt-in and validates measurement/property identifiers without accepting arbitrary scripts", () => {
    expect(analyticsSettingsSchema.parse({}).enabled).toBe(false);
    expect(analyticsSettingsSchema.safeParse({ enabled: true }).success).toBe(false);
    expect(analyticsSettingsSchema.parse({ enabled: true, privacyReviewed: true, measurementId: "g-ABC1234567" }).measurementId).toBe("G-ABC1234567");
    for (const measurementId of ["https://evil.test", '<script>', "G-ABC?email=x"]) expect(analyticsSettingsSchema.safeParse({ enabled: true, measurementId }).success).toBe(false);
    expect(analyticsSettingsSchema.safeParse({ measurementId: "G-ABC1234567", secret: "credential" }).success).toBe(false);
  });
  it("redacts private IDs and query strings from measured locations", () => {
    expect(analyticsPage(["pedidos", "private-uuid"])).toEqual({ page: "order", path: "/pedidos/detalhe", title: "Seu pedido" });
    expect(analyticsPage(["orcamentos", "private-uuid"])).toMatchObject({ page: "saved_quote", path: "/orcamentos/detalhe" });
    expect(analyticsPage(["produto", "botton-3-5-cm"])).toMatchObject({ page: "product", path: "/produto/botton-3-5-cm" });
  });
  it("exports only public product data and actual discounted totals, never artwork/contact data", () => {
    const result = analyticsCommercePayload([{ productId: "product-id", name: "Botton", artworkName: "Cliente Maria", quantity: 3, unitCents: 500, totalCents: 1200, email: "private@test" }]);
    expect(result).toEqual({ currency: "BRL", value: 12, items: [{ item_id: "product-id", item_name: "Botton", price: 4, quantity: 3 }] });
    expect(JSON.stringify(result)).not.toMatch(/Maria|private|artwork|email/);
  });
  it("whitelists event parameters and rejects malformed financial data", () => {
    expect(safeAnalyticsParameters({ value: 10, currency: "BRL", transaction_id: "aaaaaaaa-0000-4000-8000-000000000001", email: "secret@test", page_location: "https://evil.test/?email=x", payment_type: "pix", customer_state: "identified" } as never)).toEqual({ value: 10, currency: "BRL", transaction_id: "aaaaaaaa-0000-4000-8000-000000000001", payment_type: "pix", customer_state: "identified" });
    expect(analyticsCommercePayload([{ productId: "id", name: "Produto", quantity: 0, totalCents: Infinity }]).items).toEqual([]);
  });
  it("tracks only successful quantity deltas, not re-sending the whole cart or changed artwork names", () => {
    const line = { id: "a", productId: "p", quantity: 50, artworkName: "A", artworkId: null };
    expect(analyticsCartChanges([line], [line, { ...line, id: "b", productId: "q", quantity: 20 }])).toEqual({ added: [{ productId: "q", quantity: 20 }], removed: [] });
    expect(analyticsCartChanges([line], [{ ...line, quantity: 30 }])).toEqual({ added: [], removed: [{ productId: "p", quantity: 20 }] });
    const renamed = { ...line, artworkName: "Novo" };
    expect(analyticsCartChanges([line], [renamed])).toEqual({ added: [], removed: [] });
  });
});
