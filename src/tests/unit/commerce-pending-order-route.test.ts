// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/store/[slug]/orders/[orderId]/cart/route";
import { buyerContext } from "@/services/commerce/http";
import { changePendingOrder } from "@/services/commerce/pending-order";
vi.mock("@/services/commerce/http", async original => ({ ...await original<typeof import("@/services/commerce/http")>(), buyerContext: vi.fn() }));
vi.mock("@/services/commerce/pending-order", () => ({ changePendingOrder: vi.fn() }));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn(async () => null) }));
const orderId = "674663df-1a12-4217-a05a-2475fd98ff7e";
const session = { id: "session", customer_id: "buyer", cart: [], revision: 4 };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("APP_URL", "https://app.example.test");
  vi.mocked(buyerContext).mockResolvedValue({ store: { tenant_id: "tenant" }, session } as never);
  vi.mocked(changePendingOrder).mockResolvedValue({ ok: true, quoteId: null });
});
afterEach(() => vi.unstubAllEnvs());
const call = (body: unknown, origin = "https://app.example.test", id = orderId) => POST(new Request("https://app.example.test/api/store/shop/orders/id/cart", { method: "POST", headers: { origin }, body: JSON.stringify(body) }), { params: Promise.resolve({ slug: "shop", orderId: id }) });
describe("buyer pending order boundary", () => {
  it("uses only the authenticated buyer and tenant, and sends no-store responses", async () => {
    const input = { action: "edit", revision: 4, confirm: true };
    const response = await call(input);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(changePendingOrder).toHaveBeenCalledWith("tenant", session, orderId, input);
  });
  it("rejects forged origins, invalid IDs and missing explicit confirmation", async () => {
    expect((await call({}, "https://attacker.test")).status).toBe(403);
    expect((await call({}, undefined, "hook.js")).status).toBe(404);
    expect((await call({ action: "clear", revision: 4 })).status).toBe(400);
    expect((await call({ action: "clear", revision: 4, confirm: true, tenantId: "attacker" })).status).toBe(400);
    expect(changePendingOrder).not.toHaveBeenCalled();
  });
  it("requires verified buyer login before any cancellation", async () => {
    vi.mocked(buyerContext).mockResolvedValue({ store: { tenant_id: "tenant" }, session: { ...session, customer_id: null } } as never);
    expect((await call({ action: "edit", revision: 4, confirm: true })).status).toBe(401);
    expect(changePendingOrder).not.toHaveBeenCalled();
  });
});
