// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET, POST, PATCH } from "@/app/api/store/[slug]/payment/direct/route";
import { buyerContext } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { buyerPaymentState, startDirectPayment, refreshDirectPayment } from "@/services/commerce/transparent-payments";
vi.mock("@/services/commerce/http", async original => ({ ...await original<typeof import("@/services/commerce/http")>(), buyerContext: vi.fn() }));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn() }));
vi.mock("@/services/commerce/transparent-payments", () => ({ buyerPaymentState: vi.fn(), startDirectPayment: vi.fn(), refreshDirectPayment: vi.fn() }));
const id = "674663df-1a12-4217-a05a-2475fd98ff7e";
const params = { params: Promise.resolve({ slug: "shop" }) };
const request = (method = "POST", body: unknown = { orderId: id, requestId: id, payment: { method: "pix" } }, origin = "https://panel.example.test") => new Request(`https://panel.example.test/api/store/shop/payment/direct?orderId=${id}`, { method, headers: { origin, "content-type": "application/json" }, ...(method !== "GET" ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => {
  vi.clearAllMocks(); process.env.APP_URL = "https://panel.example.test";
  vi.mocked(buyerContext).mockResolvedValue({ store: { tenant_id: "tenant" }, session: { customer_id: "buyer" } } as never);
  vi.mocked(enforcePublicRateLimit).mockResolvedValue(null);
  vi.mocked(buyerPaymentState).mockResolvedValue({ paymentStatus: "pending" } as never);
});
describe("buyer scoped payment routes", () => {
  it("requires login even when a caller knows an order UUID", async () => {
    vi.mocked(buyerContext).mockResolvedValue({ store: { tenant_id: "tenant" }, session: {} } as never);
    expect((await POST(request(), params)).status).toBe(401);
    expect(startDirectPayment).not.toHaveBeenCalled();
  });
  it("rejects foreign origins and caller-controlled prices", async () => {
    expect((await POST(request("POST", {}, "https://attacker.test"), params)).status).toBe(403);
    expect((await POST(request("POST", { orderId: id, requestId: id, payment: { method: "pix" }, totalCents: 1 }), params)).status).toBe(400);
    expect(startDirectPayment).not.toHaveBeenCalled();
  });
  it("forwards only the authenticated tenant and buyer, and honors rate limiting", async () => {
    expect((await POST(request(), params)).status).toBe(200);
    expect(startDirectPayment).toHaveBeenCalledWith("tenant", "buyer", { orderId: id, requestId: id, payment: { method: "pix" } });
    vi.mocked(enforcePublicRateLimit).mockResolvedValue(NextResponse.json({ ok: false, error: "Aguarde" }, { status: 429 }));
    expect((await PATCH(request("PATCH", { orderId: id }), params)).status).toBe(429);
    expect(refreshDirectPayment).not.toHaveBeenCalled();
  });
  it("does not turn malformed public IDs into database errors", async () => {
    const response = await GET(new Request("https://panel.example.test/api/store/shop/payment/direct?orderId=invalid"), params);
    expect(response.status).toBe(400);
    expect(buyerPaymentState).not.toHaveBeenCalled();
  });
});
