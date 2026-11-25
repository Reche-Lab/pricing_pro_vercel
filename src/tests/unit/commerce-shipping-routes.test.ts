// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/commerce/admin/orders/[orderId]/shipping/route";
import { POST as webhook } from "@/app/api/commerce/webhooks/melhor-envio/route";
import { requireCommerceOrderAccess } from "@/services/commerce/order-access";
import { commerceOrderShippingState, performCommerceOrderShipping } from "@/services/commerce/order-shipping";
import { receiveShippingWebhook, verifyShippingWebhookSignature } from "@/services/commerce/shipping-webhook";
import { CommerceError } from "@/domain/commerce/commerce";
import { MelhorEnvioRequestError } from "@/services/melhor-envio/melhor-envio";
import { createHmac } from "node:crypto";
vi.mock("@/services/commerce/order-access", () => ({ requireCommerceOrderAccess: vi.fn() }));
vi.mock("@/services/commerce/order-shipping", () => ({ commerceOrderShippingState: vi.fn(), performCommerceOrderShipping: vi.fn() }));
vi.mock("@/services/commerce/shipping-webhook", async original => ({ ...await original<object>(), receiveShippingWebhook: vi.fn() }));
vi.mock("@/services/commerce/order-notification-schedule", () => ({ scheduleCommerceOrderNotifications: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }) }));
const id = "aaaaaaaa-0000-4000-8000-000000000001", tenantId = "bbbbbbbb-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ orderId: id }) };
const request = (body: unknown, origin = "https://platform.example.test") => new Request(`https://platform.example.test/api/commerce/admin/orders/${id}/shipping`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("COMMERCE_ENABLED", "true"); vi.stubEnv("APP_URL", "https://platform.example.test");
  vi.mocked(requireCommerceOrderAccess).mockResolvedValue({ session: { tenantId, userId: id } } as never);
  vi.mocked(commerceOrderShippingState).mockResolvedValue({ shipping: null, readiness: { eligible: true, reason: null }, contracted: null, notifications: { pending: 0, failed: 0 }, fiscal: { invoiceKey: null, senderStateRegister: null, productionReady: false, productionSource: null } });
  vi.mocked(performCommerceOrderShipping).mockResolvedValue({ review: undefined });
});
describe("commerce shipping API permissions", () => {
  it("denies reads before touching another tenant's shipments", async () => {
    vi.mocked(requireCommerceOrderAccess).mockRejectedValue(new CommerceError("Entre na plataforma.", 401));
    expect((await GET(new Request("https://platform.example.test"), context)).status).toBe(401);
    expect(commerceOrderShippingState).not.toHaveBeenCalled();
  });
  it("uses the authenticated tenant, not supplied request data", async () => {
    expect((await GET(new Request(`https://platform.example.test?tenantId=${id}`), context)).status).toBe(200);
    expect(commerceOrderShippingState).toHaveBeenCalledWith(tenantId, id);
    expect((await POST(request({ action: "print", tenantId: id }), context)).status).toBe(400);
    expect(performCommerceOrderShipping).not.toHaveBeenCalled();
  });
  it("rejects forged origins, malformed IDs and unknown operation bodies", async () => {
    expect((await POST(request({ action: "checkout" }, "https://attacker.test"), context)).status).toBe(403);
    expect((await POST(request({ action: "print" }), { params: Promise.resolve({ orderId: "installHook.js.map" }) })).status).toBe(404);
    expect((await POST(request({ action: "delete" }), context)).status).toBe(400);
    expect(performCommerceOrderShipping).not.toHaveBeenCalled();
  });
  it("requires management permission for financial operations", async () => {
    vi.mocked(requireCommerceOrderAccess).mockRejectedValue(new CommerceError("Sem permissão.", 403));
    expect((await POST(request({ action: "checkout" }), context)).status).toBe(403);
    expect(requireCommerceOrderAccess).toHaveBeenCalledWith("commerce:orders:manage");
    expect(performCommerceOrderShipping).not.toHaveBeenCalled();
  });
  it("returns OAuth reconnection instructions without repeating the operation", async () => {
    vi.mocked(performCommerceOrderShipping).mockRejectedValue(new MelhorEnvioRequestError("Unauthenticated.", 401, {}));
    const response = await POST(request({ action: "cart" }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reconnectRequired: true, code: "melhor_envio_oauth_invalid" });
    expect(performCommerceOrderShipping).toHaveBeenCalledTimes(1);
  });
  it("preserves a readable error and correlation reference on local failures", async () => {
    vi.mocked(performCommerceOrderShipping).mockRejectedValue(new CommerceError("Confira a nota fiscal.", 409));
    const response = await POST(request({ action: "review" }), context);
    expect(await response.json()).toMatchObject({ error: "Confira a nota fiscal.", debugId: expect.any(String) });
  });
});
describe("commerce webhook boundary", () => {
  it("does not process notifications with the module disabled", async () => {
    vi.stubEnv("COMMERCE_ENABLED", "false");
    expect((await webhook(new Request("https://platform.example.test"))).status).toBe(404);
    expect(receiveShippingWebhook).not.toHaveBeenCalled();
  });
  it("does not leak tenant IDs in its public receipt", async () => {
    vi.mocked(receiveShippingWebhook).mockResolvedValue({ tenantId, orderId: id, duplicate: false });
    expect(await (await webhook(new Request("https://platform.example.test"))).json()).toEqual({ ok: true });
  });
  it("validates the exact raw bytes and safely rejects malformed signatures", () => {
    const raw = Buffer.from('{"event":"order.posted"}'), secret = "app-secret";
    const signature = createHmac("sha256", secret).update(raw).digest("base64");
    expect(verifyShippingWebhookSignature(raw, signature, secret)).toBe(true);
    for (const invalid of [null, "", "x", "a".repeat(44), signature.slice(1)]) expect(verifyShippingWebhookSignature(raw, invalid, secret)).toBe(false);
    expect(verifyShippingWebhookSignature(Buffer.from(raw.toString() + " "), signature, secret)).toBe(false);
    expect(verifyShippingWebhookSignature(raw, signature, "another-secret")).toBe(false);
  });
});
