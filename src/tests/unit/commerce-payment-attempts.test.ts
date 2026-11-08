// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
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
describe("persisted payment attempts", () => {
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
});
