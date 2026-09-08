// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/store/[slug]/delivery/route";
import { POST as previewPOST } from "@/app/api/commerce/[slug]/preview/delivery/route";
import { getCommerceStore, commerceProducts } from "@/repositories/commerce";
import { requireCommercePreview } from "@/services/commerce/preview";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { getCurrentSession } from "@/lib/auth/session";
import { previewCarrierDelivery } from "@/services/commerce/preview-delivery";
import { CommerceError } from "@/domain/commerce/commerce";
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/services/commerce/preview-delivery", () => ({ previewCarrierDelivery: vi.fn() }));
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
  vi.mocked(getCurrentSession).mockResolvedValue({ userId: "admin", tenantId: "tenant-a" } as never);
  vi.mocked(previewCarrierDelivery).mockResolvedValue(null);
});
describe("product delivery boundary", () => {
  it("isolates store products and returns only delivery details without issuing a buyer session", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(commerceProducts).toHaveBeenCalledWith("tenant-a");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({ options: [{ priceCents: 0 }] });
    expect(previewCarrierDelivery).not.toHaveBeenCalled();
  });
  it("quotes an active tenant carrier in preview even with fixed delivery and pickup disabled", async () => {
    vi.mocked(requireCommercePreview).mockResolvedValue({ ...store, settings: { ...store.settings, deliveryEnabled: false } } as never);
    vi.mocked(previewCarrierDelivery).mockResolvedValue({ options: [{ id: "melhor_envio:1", name: "Correios - PAC", priceCents: 1250, description: "Melhor Envio" }] });
    const response = await previewPOST(request(), context);
    expect(await response.json()).toMatchObject({ previewCarrier: true, options: [{ priceCents: 1250 }] });
    expect(previewCarrierDelivery).toHaveBeenCalledWith("admin", "tenant-a", "12345678", body.lines, [product]);
  });
  it("does not use another tenant's identity and explains failures without hiding existing pickup/delivery", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ userId: "admin", tenantId: "other" } as never);
    expect((await previewPOST(request(), context)).status).toBe(401);
    expect(previewCarrierDelivery).not.toHaveBeenCalled();
    vi.mocked(getCurrentSession).mockResolvedValue({ userId: "admin", tenantId: "tenant-a" } as never);
    vi.mocked(previewCarrierDelivery).mockRejectedValue(new CommerceError("Cadastre uma embalagem.", 409));
    expect(await (await previewPOST(request(), context)).json()).toMatchObject({ options: [{ id: "delivery" }], warnings: ["Cadastre uma embalagem."] });
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
