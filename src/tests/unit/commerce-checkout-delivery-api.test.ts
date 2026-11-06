// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkoutDelivery } from "@/services/commerce/checkout-delivery";
import { buyerContext } from "@/services/commerce/http";
import { commerceProducts, calculateCommerceCart, commerceTransaction } from "@/repositories/commerce";
import { publicCarrierDelivery } from "@/services/commerce/carrier-delivery";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { NextResponse } from "next/server";
vi.mock("@/services/commerce/http", async original => ({ ...await original<object>(), buyerContext: vi.fn() }));
vi.mock("@/repositories/commerce", async original => ({ ...await original<object>(), commerceProducts: vi.fn(), calculateCommerceCart: vi.fn(), commerceTransaction: vi.fn() }));
vi.mock("@/services/commerce/carrier-delivery", () => ({ publicCarrierDelivery: vi.fn() }));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn() }));
const line = { id: "11111111-1111-4111-8111-111111111111", productId: "22222222-2222-4222-8222-222222222222", quantity: 5, artworkName: "", artworkId: null };
const product = { id: line.productId, name: "Botton", minQuantity: 1, maxQuantity: 1000, maxArtworks: 5, pricingRule: "total" };
const store = { tenant_id: "tenant-a", revision: 3, settings: { carrierEnabled: true, deliveryEnabled: false, pickupEnabled: false } };
const query = vi.fn();
const request = (body: unknown = { postalCode: "01001000", revision: 2 }) => new Request("https://panel.test/api/store/shop/checkout-delivery", { method: "POST", headers: { origin: "https://panel.test" }, body: JSON.stringify(body) });
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("APP_URL", "https://panel.test");
  vi.mocked(buyerContext).mockResolvedValue({ store, session: { id: "session", cart: [line], revision: 2 } } as never);
  vi.mocked(commerceProducts).mockResolvedValue([product] as never);
  vi.mocked(calculateCommerceCart).mockResolvedValue({ totalCents: 1000 } as never);
  vi.mocked(publicCarrierDelivery).mockResolvedValue({ options: [{ id: "melhor_envio:2", name: "SEDEX", priceCents: 1500, description: "2 dias" }] });
  query.mockResolvedValue({ rows: [{ id: "quote" }] });
  vi.mocked(commerceTransaction).mockImplementation(work => work({ query } as never));
});
describe("checkout delivery boundary", () => {
  it("quotes the authoritative multi-product cart and persists only server-issued options", async () => {
    const response = await checkoutDelivery(request(), "shop");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ options: [{ id: "melhor_envio:2", priceCents: 1500, quoteId: "quote" }], expiresInSeconds: 900 });
    expect(publicCarrierDelivery).toHaveBeenCalledWith("tenant-a", "01001000", [line], [product], 1000);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("insert into commerce_shipping_quotes"), expect.arrayContaining(["tenant-a", "session", 2, 3, "01001000"]));
  });
  it("rejects client lines/prices and stale carts before any provider request", async () => {
    expect((await checkoutDelivery(request({ postalCode: "01001000", revision: 2, priceCents: 0 }), "shop")).status).toBe(400);
    expect((await checkoutDelivery(request({ postalCode: "01001000", revision: 1 }), "shop")).status).toBe(409);
    expect(publicCarrierDelivery).not.toHaveBeenCalled();
  });
  it("honors rate limits before parsing or contacting the carrier", async () => {
    vi.mocked(enforcePublicRateLimit).mockResolvedValue(NextResponse.json({ ok: false, error: "Limite" }, { status: 429 }));
    expect((await checkoutDelivery(request(), "shop")).status).toBe(429);
    expect(publicCarrierDelivery).not.toHaveBeenCalled();
  });
});
