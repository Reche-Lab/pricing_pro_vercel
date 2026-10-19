import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import StorePage, { generateMetadata } from "@/app/loja/[slug]/[[...path]]/page";
import PreviewPage from "@/app/commerce/[slug]/preview/[[...path]]/page";
import sitemap from "@/app/sitemap";
import { GET } from "@/app/loja/[slug]/sitemap.xml/route";
import { commerceProducts, getCommerceStore, publishedCommerceSitemapStores } from "@/repositories/commerce";
import { requireCommercePreview } from "@/services/commerce/preview";
import { storeSettingsSchema } from "@/domain/commerce/schemas";

vi.mock("@/repositories/commerce", () => ({ commerceProducts: vi.fn(), getCommerceStore: vi.fn(), publishedCommerceSitemapStores: vi.fn(), publicCommerceProduct: (product: unknown) => product }));
vi.mock("@/services/commerce/preview", () => ({ requireCommercePreview: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: () => { throw new Error("REDIRECT"); } }));
vi.mock("@/components/commerce/Storefront", () => ({ Storefront: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
const settings = storeSettingsSchema.parse({ name: "Ground Shop", description: "Loja", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "loja@example.test", contactPhone: "", pickupEnabled: false, pickupAddress: "", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "Condições" });
function setup(slug = "ground-shop") {
  vi.stubEnv("APP_URL", "https://shop.example.test");
  const store = { slug, tenant_id: "tenant", settings, status: "published", enabled: true, revision: 1, platform_id: "platform" };
  vi.mocked(getCommerceStore).mockResolvedValue(store);
  vi.mocked(requireCommercePreview).mockResolvedValue(store);
  vi.mocked(commerceProducts).mockResolvedValue([]);
  return store;
}
describe("institutional storefront routes", () => {
  it("includes the policy text and JSON-LD in the server HTML", async () => {
    setup();
    const params = Promise.resolve({ slug: "ground-shop", path: ["politica-de-privacidade"] });
    const html = renderToStaticMarkup(await StorePage({ params }));
    expect(html).toContain("Quem é responsável");
    expect(html).toContain("38.265.820/0001-88");
    expect(html).toContain('type="application/ld+json"');
    expect((await generateMetadata({ params })).title).toEqual({ absolute: "Política de Privacidade | Ground Shop" });
  });
  it("supports authenticated preview without publishing indexable structured URLs", async () => {
    setup();
    const html = renderToStaticMarkup(await PreviewPage({ params: Promise.resolve({ slug: "ground-shop", path: ["quem-somos"] }) }));
    expect(requireCommercePreview).toHaveBeenCalledWith("ground-shop");
    expect(html).toContain("Uma história feita de momentos");
    expect(html).not.toContain("application/ld+json");
    expect(html).toContain("/commerce/ground-shop/preview/termos-de-uso");
  });
  it("does not show another tenant the Ground Shop policies and retains real 404s", async () => {
    setup("other");
    await expect(StorePage({ params: Promise.resolve({ slug: "other", path: ["quem-somos"] }) })).rejects.toThrow("NOT_FOUND");
    expect(commerceProducts).not.toHaveBeenCalled();
    setup();
    await expect(StorePage({ params: Promise.resolve({ slug: "ground-shop", path: ["quem-somos", "anything"] }) })).rejects.toThrow("NOT_FOUND");
  });
  it("only discovers published stores and never emits preview URLs in the main sitemap", async () => {
    setup();
    vi.mocked(publishedCommerceSitemapStores).mockResolvedValue([{ slug: "ground-shop" }]);
    const entries = await sitemap();
    expect(entries).toHaveLength(8);
    expect(entries.some(item => item.url.endsWith("/politica-de-troca"))).toBe(true);
    expect(entries.every(item => !item.url.includes("preview"))).toBe(true);
  });
  it("returns XML only for an available store and a non-cacheable 404 otherwise", async () => {
    setup();
    const context = { params: Promise.resolve({ slug: "ground-shop" }) };
    const response = await GET(new Request("https://shop.example.test/loja/ground-shop/sitemap.xml"), context);
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(await response.text()).toContain("/quem-somos</loc>");
    vi.mocked(getCommerceStore).mockResolvedValue(null);
    const unavailable = await GET(new Request("https://shop.example.test"), context);
    expect(unavailable.status).toBe(404);
    expect(unavailable.headers.get("cache-control")).toBe("no-store");
  });
});
