// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/store/[slug]/delivery/route";
import { POST as previewPOST } from "@/app/api/commerce/[slug]/preview/delivery/route";
import { getCommerceStore, commerceProducts } from "@/repositories/commerce";
import { requireCommercePreview } from "@/services/commerce/preview";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
vi.mock("@/repositories/commerce", () => ({ getCommerceStore: vi.fn(), commerceProducts: vi.fn() }));
vi.mock("@/services/commerce/preview", () => ({ requireCommercePreview: vi.fn() }));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn() }));
const store = { tenant_id: "tenant-a", settings: { deliveryEnabled: true, deliveryCents: 0, deliveryDescription: "Entrega", pickupEnabled: false } };
const product = { id: "11111111-1111-4111-8111-111111111111", name: "Produto", minQuantity: 1, maxQuantity: 100, maxArtworks: 1, pricingRule: "total", curve: { mode: "step", points: [{ quantity: 1, unitPrice: 10 }] }, platform: { commissionRate: 0, fixedFee: 0, sellerShippingCost: 0, sellerShippingThreshold: 0 } };
const body = { postalCode: "12345678", lines: [{ id: "22222222-2222-4222-8222-222222222222", productId: product.id, quantity: 10, artworkName: "", artworkId: null }] };
function request(input: unknown = body, origin = "https://shop.test") {
  return new Request("https://shop.test/api/store/shop/delivery", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(input) });
}
const context = { params: Promise.resolve({ slug: "shop" }) };
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("APP_URL", "https://shop.test");
  vi.mocked(getCommerceStore).mockResolvedValue(store as never);
  vi.mocked(requireCommercePreview).mockResolvedValue(store as never);
  vi.mocked(commerceProducts).mockResolvedValue([product] as never);
  vi.mocked(enforcePublicRateLimit).mockResolvedValue(null);
});
describe("product delivery boundary", () => {
  it("isolates store products and returns only delivery details without issuing a buyer session", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(commerceProducts).toHaveBeenCalledWith("tenant-a");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({ options: [{ priceCents: 0 }] });
  });
  it("rejects foreign origins, unavailable stores and client supplied prices", async () => {
    expect((await POST(request(body, "https://evil.test"), context)).status).toBe(403);
    expect(getCommerceStore).not.toHaveBeenCalled();
    expect((await POST(request({ ...body, priceCents: 0 }), context)).status).toBe(400);
    vi.mocked(getCommerceStore).mockResolvedValue(null);
    expect((await POST(request(), context)).status).toBe(404);
  });
  it("honors rate limiting and uses admin preview authorization for drafts", async () => {
    vi.mocked(enforcePublicRateLimit).mockResolvedValue(new Response("limited", { status: 429 }) as never);
    expect((await POST(request(), context)).status).toBe(429);
    expect(commerceProducts).not.toHaveBeenCalled();
    vi.mocked(enforcePublicRateLimit).mockResolvedValue(null);
    expect((await previewPOST(request(), context)).status).toBe(200);
    expect(requireCommercePreview).toHaveBeenCalledWith("shop");
  });
});
