// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/quotes/[quoteId]/edit/route";

const mocks = vi.hoisted(() => ({ session: vi.fn(), detail: vi.fn(), update: vi.fn(), variants: vi.fn(), load: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/lib/billing/guard", () => ({ requireWritableBilling: async () => null }));
vi.mock("@/repositories/quotes", () => ({ getQuoteDetail: mocks.detail, updateQuoteEditable: mocks.update }));
vi.mock("@/repositories/products", () => ({ listProductVariants: mocks.variants }));
vi.mock("@/app/api/quotes/[quoteId]/olist/_shared", () => ({ loadQuoteOlistContext: mocks.load, sendOlistQuoteOperation: mocks.send, olistOperationErrorResponse: () => ({ ok: false, error: "Falha Olist" }) }));
const quoteId = "00000000-0000-4000-8000-000000000001";
const itemId = "00000000-0000-4000-8000-000000000002";
const variantId = "00000000-0000-4000-8000-000000000003";
const original = { id: itemId, productVariantId: variantId, quantity: 2, unitPrice: 10 };
const added = { productVariantId: variantId, quantity: 3, unitPrice: 8, artworkName: "Arte nova" };
const body = { expectedItemIds: [itemId], items: [original, added], shippingTotal: 0, discountType: "none", discountValue: 0, reason: "Inclusão" };
const call = (data = body) => PATCH(new Request("http://localhost/api/quotes/test/edit", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }), { params: Promise.resolve({ quoteId }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.session.mockResolvedValue({ userId: "actor", tenantId: "tenant" });
  mocks.detail.mockResolvedValue({ quote: { id: quoteId, status: "draft", discount_total: "0", external_olist_order_id: "123" }, items: [{ id: itemId, unit_price: "10" }] });
  mocks.variants.mockResolvedValue([{ variant_id: variantId, product_name: "Botton", variant_name: "35 mm", sku: "BT35", external_olist_product_id: "321" }]);
  mocks.load.mockResolvedValue({ session: { userId: "actor", tenantId: "tenant" }, settings: {}, credentials: {} });
  mocks.send.mockResolvedValue({ result: { situacao: 0 } });
  mocks.update.mockResolvedValue({ id: quoteId });
});
afterEach(() => vi.restoreAllMocks());

describe("quote edit endpoint", () => {
  it("sends the complete item list to the existing Olist update flow before saving locally", async () => {
    expect((await call()).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][0]).toMatchObject({ method: "PUT", path: "/pedidos/123/itens", payload: { itens: expect.any(Array) } });
    expect(mocks.send.mock.calls[1][0].payload.itens).toHaveLength(2);
    expect(mocks.update).toHaveBeenCalledWith("actor", "tenant", quoteId, expect.objectContaining({ items: body.items, syncedOlistOrderId: "123" }));
    expect(mocks.send.mock.invocationCallOrder[1]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
  });

  it("rejects duplicated IDs before any external mutation", async () => {
    expect((await call({ ...body, items: [original, original] })).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not change the local quote when Olist fails", async () => {
    mocks.send.mockResolvedValueOnce({ result: { situacao: 0 } }).mockRejectedValueOnce(Object.assign(new Error("Unavailable"), { debugId: "test" }));
    expect((await call()).status).toBe(502);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("blocks closed orders, missing products and unauthenticated requests", async () => {
    mocks.send.mockResolvedValue({ result: { situacao: 2 } });
    expect((await call()).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.send.mockClear();
    mocks.variants.mockResolvedValue([]);
    expect((await call()).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.session.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });
});
