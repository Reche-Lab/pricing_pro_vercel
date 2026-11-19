// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revokePendingPayment } from "@/services/commerce/payment-revocation";
vi.mock("@/services/commerce/payments", () => ({ paymentCredentials: vi.fn(async () => ({ accessToken: "private-token", sellerId: "123", webhookSecret: "private" })) }));
const query = vi.fn(), fetcher = vi.fn();
const providerId = "ORD01J49MMW3SSBK5PSV3DFR32959", attemptId = "674663df-1a12-4217-a05a-2475fd98ff7e";
const order = { id: "order", tenant_id: "tenant", provider: "mercado_pago", total_cents: 1000 };
const attempt = { id: attemptId, seller_id: "123", method: "pix", status: "pending", provider_order_id: providerId };
const provider = (status = "action_required") => ({ id: providerId, user_id: "123", country_code: "BRA", external_reference: attemptId, total_amount: "10.00", status, transactions: { payments: [{ amount: "10.00", status, payment_method: { id: "pix", type: "bank_transfer" } }] } });
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetcher); query.mockResolvedValue({ rows: [] }); });
afterEach(() => vi.unstubAllGlobals());
const revoke = (changes = {}) => revokePendingPayment({ query } as never, { ...order, ...changes } as never);
describe("revoking unpaid checkout safely", () => {
  it("does not contact the provider when no payment was issued", async () => { await revoke(); expect(fetcher).not.toHaveBeenCalled(); });
  it("blocks an uncertain submission without inventing a cancellation", async () => {
    query.mockResolvedValue({ rows: [{ ...attempt, status: "unknown", provider_order_id: null }] });
    await expect(revoke()).rejects.toMatchObject({ status: 409 }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("cancels an unpaid Pix with an idempotent request and verifies it with GET", async () => {
    query.mockResolvedValue({ rows: [attempt] });
    fetcher.mockResolvedValueOnce(Response.json(provider())).mockResolvedValueOnce(Response.json({ status: "canceled" })).mockResolvedValueOnce(Response.json(provider("canceled")));
    await revoke();
    expect(fetcher.mock.calls.map(([url, input]) => [url.split(".com")[1], input.method])).toEqual([[`/v1/orders/${providerId}`, "GET"], [`/v1/orders/${providerId}/cancel`, "POST"], [`/v1/orders/${providerId}`, "GET"]]);
    expect(fetcher.mock.calls[1][1].headers["X-Idempotency-Key"]).toBeTruthy();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='failed'"), ["tenant", attemptId, expect.not.stringContaining("private-token")]);
  });
  it("never trusts a cancellation POST without confirming the final status", async () => {
    query.mockResolvedValue({ rows: [attempt] }); fetcher.mockImplementation(async () => Response.json(provider()));
    await expect(revoke()).rejects.toMatchObject({ status: 409 });
    expect(query.mock.calls.some(([sql]) => sql.startsWith("update"))).toBe(false);
  });
  it("does not cancel another seller's transaction", async () => {
    query.mockResolvedValue({ rows: [attempt] }); fetcher.mockResolvedValue(Response.json({ ...provider(), user_id: "999" }));
    await expect(revoke()).rejects.toThrow("não correspondem"); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("expires a hosted link and searches for existing payments before releasing the cart", async () => {
    const preference = { collector_id: "123", external_reference: "order", expires: true, expiration_date_to: "2020-01-01T00:00:00Z" };
    fetcher.mockResolvedValueOnce(Response.json(preference)).mockResolvedValueOnce(Response.json(preference)).mockResolvedValueOnce(Response.json(preference)).mockResolvedValueOnce(Response.json({ paging: { total: 0 }, results: [] }));
    await revoke({ checkout_url: "https://www.mercadopago.com.br/checkout", provider_preference_id: "preference-123" });
    expect(fetcher.mock.calls[1][1].method).toBe("PUT");
    expect(fetcher.mock.calls[3][0]).toContain("/v1/payments/search?external_reference=order");
  });
  it("does not discard a purchase with an outstanding hosted payment, even after link expiry", async () => {
    const preference = { collector_id: "123", external_reference: "order", expires: true, expiration_date_to: "2020-01-01T00:00:00Z" };
    fetcher.mockResolvedValueOnce(Response.json(preference)).mockResolvedValueOnce(Response.json(preference)).mockResolvedValueOnce(Response.json(preference)).mockResolvedValueOnce(Response.json({ paging: { total: 1 }, results: [{ collector_id: "123", external_reference: "order", status: "pending" }] }));
    await expect(revoke({ checkout_url: "https://www.mercadopago.com.br/checkout", provider_preference_id: "preference-123" })).rejects.toMatchObject({ status: 409 });
  });
});
