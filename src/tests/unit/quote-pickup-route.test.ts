// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH, POST } from "@/app/api/quotes/[quoteId]/pickup/route";
import { syncQuotePickup } from "@/app/api/quotes/[quoteId]/pickup/_sync";
import { POST as invoice } from "@/app/api/quotes/[quoteId]/olist/invoice/route";

const mocks = vi.hoisted(() => ({ session: vi.fn(), billing: vi.fn(), detail: vi.fn(), remove: vi.fn(), confirm: vi.fn(), load: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/lib/billing/guard", () => ({ requireWritableBilling: mocks.billing }));
vi.mock("@/repositories/quotes", () => ({ getQuoteDetail: mocks.detail }));
vi.mock("@/repositories/quote-shipping", () => ({ setQuotePickup: mocks.remove, confirmQuoteShippingOlistSync: mocks.confirm }));
vi.mock("@/app/api/quotes/[quoteId]/olist/_shared", () => ({ loadQuoteOlistContext: mocks.load, sendOlistQuoteOperation: mocks.send, olistOperationErrorResponse: () => ({ ok: false, error: "Reconecte Olist", code: "olist_oauth_invalid", reconnectRequired: true }) }));
const quoteId = "00000000-0000-4000-8000-000000000001";
const quote = { id: quoteId, status: "draft", delivery_method: "pickup", shipping_total: "0", grand_total: "180", external_olist_order_id: "123", shipping_olist_sync_pending: true };
const request = (data = { confirmed: true, expectedShippingTotal: 30, reason: "Retirar no local" }) => new Request("https://app.test/api/quotes/pickup", { method: "PATCH", body: JSON.stringify(data) });
const context = { params: Promise.resolve({ quoteId }) };
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.session.mockResolvedValue({ userId: "user", tenantId: "tenant" });
  mocks.billing.mockResolvedValue(null);
  mocks.detail.mockResolvedValue({ quote });
  mocks.remove.mockResolvedValue({ shippingTotal: 0, grandTotal: 180, olistPending: true });
  mocks.load.mockResolvedValue({ session: { userId: "user", tenantId: "tenant" }, detail: { quote }, settings: { pickup_forma_envio_id: "42" }, credentials: {} });
  mocks.send.mockResolvedValue({ result: { situacao: 0, valorFrete: 30, observacoesInternas: "Preservar" } });
});
describe("pickup endpoints and ERP verification", () => {
  it("blocks invoice creation while the Olist freight correction is pending", async () => {
    const response = await invoice(request(), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Conferir no Olist") });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not complete pickup without a configured pickup shipping-form ID", async () => {
    mocks.load.mockResolvedValue({ session: { userId: "user", tenantId: "tenant" }, detail: { quote }, settings: {}, credentials: {} });
    mocks.send.mockResolvedValue({ result: { situacao: 0, valorFrete: 0 } });
    expect((await syncQuotePickup(quoteId)).pending).toBe(true);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("saves the quote first and annotates the existing order without pretending unsupported valorFrete was changed", async () => {
    const response = await PATCH(request(), context);
    expect(await response.json()).toMatchObject({ ok: true, pending: true, message: expect.stringContaining("zere o frete") });
    expect(mocks.remove).toHaveBeenCalledWith("user", "tenant", quoteId, expect.objectContaining({ expectedShippingTotal: 30 }));
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    expect(mocks.send.mock.calls[1][0]).toMatchObject({ method: "PUT", path: "/pedidos/123", payload: { observacoesInternas: expect.stringContaining("Preservar") } });
    expect(mocks.send.mock.calls[1][0].payload).not.toHaveProperty("valorFrete");
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("keeps the saved removal pending and signals OAuth reconnect after an upstream failure", async () => {
    mocks.send.mockRejectedValue(new Error("invalid_grant"));
    const response = await PATCH(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, pending: true, reconnectRequired: true, code: "olist_oauth_invalid" });
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("verifies freight zero and updates pickup dispatch using the configured ID before clearing pending", async () => {
    mocks.send.mockResolvedValue({ result: { situacao: 0, valorFrete: 0 } });
    const result = await syncQuotePickup(quoteId);
    expect(result.pending).toBe(false);
    expect(mocks.send.mock.calls[2][0]).toMatchObject({ method: "PUT", path: "/pedidos/123/despacho", payload: { formaEnvio: { id: 42 }, fretePagoEmpresa: 0, codigoRastreamento: "", urlRastreamento: "" } });
    expect(mocks.confirm).toHaveBeenCalledWith("user", "tenant", quoteId, "123");
  });
  it.each([null, undefined, "", "invalid"])("does not interpret unknown upstream freight %s as zero", async freight => {
    mocks.send.mockResolvedValue({ result: { situacao: 0, valorFrete: freight } });
    expect((await syncQuotePickup(quoteId)).pending).toBe(true);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("does not clear pending when dispatch fails even if the monetary freight was corrected", async () => {
    mocks.send.mockResolvedValueOnce({ result: { situacao: 0, valorFrete: 0 } }).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("invalid_grant"));
    expect((await syncQuotePickup(quoteId)).pending).toBe(true);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("does not change closed or unrecognized remote orders", async () => {
    mocks.send.mockResolvedValue({ result: { situacao: 2, valorFrete: 0 } });
    expect((await syncQuotePickup(quoteId)).pending).toBe(true);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("rechecks pending without removing freight or duplicating the local audit", async () => {
    expect((await POST(request(), context)).status).toBe(200);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("does not contact Olist for a quote without an existing order", async () => {
    mocks.remove.mockResolvedValue({ olistPending: false });
    expect(await (await PATCH(request(), context)).json()).toMatchObject({ ok: true, pending: false });
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated, unconfirmed and read-only requests before mutation", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await PATCH(request(), context)).status).toBe(401);
    expect((await PATCH(request({ confirmed: false, expectedShippingTotal: 30, reason: "Retirar" }), context)).status).toBe(400);
    mocks.billing.mockResolvedValue(new Response("blocked", { status: 402 }));
    expect((await PATCH(request(), context)).status).toBe(402);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
