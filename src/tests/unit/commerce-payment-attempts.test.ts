// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDirectPayment, reconcileDirectPayment } from "@/services/commerce/transparent-payments";
import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "@/repositories/commerce";
vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
vi.mock("@/repositories/commerce", () => ({ commerceTransaction: vi.fn() }));
vi.mock("@/services/commerce/payments", () => ({ paymentCredentials: async () => ({ accessToken: "secret", webhookSecret: "secret", sellerId: "123" }) }));
const query = vi.fn(), fetcher = vi.fn();
const tenant = "tenant", buyer = "buyer", orderId = "674663df-1a12-4217-a05a-2475fd98ff7e";
const requestId = "16cd6914-a8a2-4003-a139-e889e0f99eee";
const order = { id: orderId, tenant_id: tenant, provider: "mercado_pago", payment_status: "pending", total_cents: 12990, snapshot: { customer: { email: "buyer@example.test" }, billing: { document: "52998224725" } } };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetcher);
  vi.mocked(getPool).mockReturnValue({ query } as never);
  vi.mocked(commerceTransaction).mockImplementation(work => work({ query } as never));
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("from commerce_orders")) return { rows: [order] };
    if (sql.includes("from commerce_payment_connections")) return { rows: [{ mp_enabled: true, transparent_enabled: true, public_key: "APP_USR-public", checkout_settings: {} }] };
    return { rows: [] };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("persisted payment attempts", () => {
  it("logs rejected Pix as an error with redacted provider diagnostics, not as a success", async () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    fetcher.mockResolvedValue(Response.json({ code: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES", message: "At least one policy returned UNAUTHORIZED." }, { status: 403, headers: { "x-request-id": "provider-reference" } }));
    await startDirectPayment(tenant, buyer, { orderId, requestId, payment: { method: "pix" } });
    expect(failed).toHaveBeenCalledWith("Commerce direct payment rejected.", expect.objectContaining({
      httpStatus: 403, providerCode: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES", providerRequestId: "provider-reference", providerMessages: ["At least one policy returned UNAUTHORIZED."], operation: "orders.create",
    }));
    expect(info).not.toHaveBeenCalled();
    const update = query.mock.calls.find(([sql]) => sql.startsWith("update commerce_payment_attempts") && sql.includes("status=$3"))!;
    expect(update[1][2]).toBe("failed");
    expect(JSON.parse(update[1][3]).message).toContain("habilitação");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("https://api.mercadopago.com/v1/orders");
  });
  it("blocks direct charges when an existing hosted link is payable", async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql.includes("from commerce_orders") ? [{ ...order, checkout_url: "https://www.mercadopago.com.br/checkout" }] : [] }));
    await expect(startDirectPayment(tenant, buyer, { orderId, requestId, payment: { method: "pix" } })).rejects.toThrow("carteira");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never starts a second charge while a previous outcome is unknown", async () => {
    const base = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, ...args: unknown[]) => sql.includes("from commerce_payment_attempts") ? { rows: [{ id: "attempt", status: "unknown", request_id: "other", result: {} }] } : base(sql, ...args));
    await expect(startDirectPayment(tenant, buyer, { orderId, requestId, payment: { method: "pix" } })).rejects.toThrow("andamento");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not leak an order owned by another buyer", async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(startDirectPayment(tenant, "other", { orderId, requestId, payment: { method: "pix" } })).rejects.toThrow("não encontrado");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("customer_id=$2"), [tenant, "other", orderId]);
  });
  it("retains an unknown attempt after a network timeout instead of permitting another payment", async () => {
    fetcher.mockRejectedValue(new Error("timeout"));
    await expect(startDirectPayment(tenant, buyer, { orderId, requestId, payment: { method: "pix" } })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status=$3"), expect.arrayContaining([tenant, "unknown"]));
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.total_amount).toBe("129.90");
    expect(payload.transactions.payments[0].expiration_time).toBe("PT30M");
    expect(fetcher.mock.calls[0][1].headers["X-Idempotency-Key"]).toBeTruthy();
  });
  it("rejects untrusted provider resource IDs before making a request", async () => {
    await expect(reconcileDirectPayment(tenant, "../../users/me")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("logs lookup rejection and never updates a payment based on a 403 response", async () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    fetcher.mockResolvedValue(Response.json({ error: "forbidden", message: "Application is not authorized." }, { status: 403 }));
    await expect(reconcileDirectPayment(tenant, "ORD01J49MMW3SSBK5PSV3DFR32959")).rejects.toThrow("confirmar");
    expect(failed).toHaveBeenCalledWith("Commerce direct payment lookup rejected.", expect.objectContaining({ operation: "orders.get", providerCodes: ["forbidden"], httpStatus: 403 }));
    expect(query.mock.calls.some(([sql]) => sql.startsWith("update"))).toBe(false);
  });
  it("still reconciles a successful authoritative Pix lookup without persisting its raw response", async () => {
    const id = "e4cde3b2-76ef-44c7-863a-dc10f59d11cd", providerId = "ORD01J49MMW3SSBK5PSV3DFR32959";
    const base = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, ...args: unknown[]) => sql.includes("from commerce_payment_attempts") ? { rows: [{ id, order_id: orderId, seller_id: "123", method: "pix", status: "submitting", provider_order_id: providerId }] } : base(sql, ...args));
    fetcher.mockResolvedValue(Response.json({ id: providerId, user_id: "123", country_code: "BRA", external_reference: id, total_amount: "129.90", status: "action_required", status_detail: "waiting_transfer", transactions: { payments: [{ amount: "129.90", status: "action_required", payment_method: { id: "pix", type: "bank_transfer", qr_code: "pix-copy-code", token: "must-not-persist-token" } }] } }));
    await reconcileDirectPayment(tenant, providerId);
    const update = query.mock.calls.find(([sql]) => sql.startsWith("update commerce_payment_attempts"))!;
    expect(update[1][3]).toBe("pending");
    expect(JSON.parse(update[1][4])).toMatchObject({ qrCode: "pix-copy-code", message: "Aguardando a confirmação do Mercado Pago." });
    expect(JSON.stringify(update)).not.toContain("must-not-persist-token");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("update commerce_orders"))).toBe(false);
  });
});
