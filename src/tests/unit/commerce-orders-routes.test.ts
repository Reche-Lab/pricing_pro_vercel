// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/commerce/admin/orders/route";
import { POST as seen } from "@/app/api/commerce/admin/orders/[orderId]/seen/route";
import { requireCommerceOrderAccess } from "@/services/commerce/order-access";
import { getOrderWorkspace, markOrderSeen } from "@/repositories/commerce-orders";
import { CommerceError } from "@/domain/commerce/commerce";
vi.mock("@/services/commerce/order-access", () => ({ requireCommerceOrderAccess: vi.fn() }));
vi.mock("@/repositories/commerce-orders", () => ({ getOrderWorkspace: vi.fn(), markOrderSeen: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://app.example.test");
  vi.mocked(requireCommerceOrderAccess).mockResolvedValue({ session: { tenantId: "tenant-a", userId: "actor" }, access: { read: true } } as Awaited<ReturnType<typeof requireCommerceOrderAccess>>);
  vi.mocked(getOrderWorkspace).mockResolvedValue({ orders: [] } as unknown as Awaited<ReturnType<typeof getOrderWorkspace>>);
  vi.mocked(markOrderSeen).mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("commerce orders HTTP boundary", () => {
  it("derives tenant and user exclusively from the session and bounds filters", async () => {
    const response = await GET(new Request("https://app.example.test/api/commerce/admin/orders?summary=1&filter=unread&tenantId=attacker"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getOrderWorkspace).toHaveBeenCalledWith("tenant-a", "actor", { filter: "unread", page: 1, pageSize: 5 });
    expect((await GET(new Request("https://app.example.test/api/commerce/admin/orders?page=-1"))).status).toBe(400);
  });
  it("denies unauthenticated requests before fetching orders", async () => {
    vi.mocked(requireCommerceOrderAccess).mockRejectedValue(new CommerceError("Entre na plataforma.", 401));
    expect((await GET(new Request("https://app.example.test/api/commerce/admin/orders"))).status).toBe(401);
    expect(getOrderWorkspace).not.toHaveBeenCalled();
  });
  it("rejects forged origins, malformed IDs and timestamps before marking any order", async () => {
    const request = (origin: string, body: unknown) => new Request("https://app.example.test/api/seen", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
    const params = { params: Promise.resolve({ orderId: id }) };
    expect((await seen(request("https://attacker.test", { seenThrough: "2026-11-06T12:00:00Z" }), params)).status).toBe(403);
    expect((await seen(request("https://app.example.test", { seenThrough: "invalid" }), params)).status).toBe(400);
    expect((await seen(request("https://app.example.test", {}), { params: Promise.resolve({ orderId: "hook.js" }) })).status).toBe(404);
    expect(markOrderSeen).not.toHaveBeenCalled();
  });
  it("persists the displayed revision for only the authenticated user's order", async () => {
    const response = await seen(new Request("https://app.example.test/api/seen", { method: "POST", headers: { origin: "https://app.example.test" }, body: JSON.stringify({ seenThrough: "2026-11-06T12:00:00Z" }) }), { params: Promise.resolve({ orderId: id }) });
    expect(response.status).toBe(200);
    expect(markOrderSeen).toHaveBeenCalledWith("tenant-a", "actor", id, "2026-11-06T12:00:00Z");
  });
});
