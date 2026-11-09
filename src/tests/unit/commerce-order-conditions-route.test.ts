// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/store/[slug]/orders/[orderId]/conditions/route";
import { buyerContext } from "@/services/commerce/http";
import { buyerOrderConditions } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
vi.mock("@/services/commerce/http", async original => ({ ...await original<typeof import("@/services/commerce/http")>(), buyerContext: vi.fn() }));
vi.mock("@/repositories/commerce", () => ({ buyerOrderConditions: vi.fn() }));
const id = "674663df-1a12-4217-a05a-2475fd98ff7e";
const context = (orderId = id) => ({ params: Promise.resolve({ slug: "shop", orderId }) });
const request = new Request("https://panel.test/api/store/shop/orders/conditions");
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buyerContext).mockResolvedValue({ store: { tenant_id: "session-tenant" }, session: { customer_id: "session-buyer" } } as never);
  vi.mocked(buyerOrderConditions).mockResolvedValue("Condições antigas, exatamente como registradas.");
});
afterEach(() => vi.restoreAllMocks());
describe("download accepted order conditions", () => {
  it("uses the authenticated tenant and buyer and sends a non-cacheable plain text attachment", async () => {
    const response = await GET(request, context());
    expect(response.status).toBe(200);
    expect(buyerOrderConditions).toHaveBeenCalledWith("session-tenant", "session-buyer", id);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(await response.text()).toBe("Condições antigas, exatamente como registradas.");
  });
  it("requires buyer login even if the order ID is known", async () => {
    vi.mocked(buyerContext).mockResolvedValue({ store: { tenant_id: "tenant" }, session: {} } as never);
    expect((await GET(request, context())).status).toBe(401);
    expect(buyerOrderConditions).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs before querying and preserves not-found ownership failures", async () => {
    expect((await GET(request, context("installHook.js.map"))).status).toBe(404);
    expect(buyerOrderConditions).not.toHaveBeenCalled();
    vi.mocked(buyerOrderConditions).mockRejectedValue(new CommerceError("Pedido não encontrado.", 404));
    expect((await GET(request, context())).status).toBe(404);
  });
});
