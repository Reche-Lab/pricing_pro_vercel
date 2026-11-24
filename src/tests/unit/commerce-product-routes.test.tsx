import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StorePage, { generateMetadata } from "@/app/loja/[slug]/[[...path]]/page";
import PreviewPage from "@/app/commerce/[slug]/preview/[[...path]]/page";
import { commerceProducts, getCommerceStore } from "@/repositories/commerce";
import { requireCommercePreview } from "@/services/commerce/preview";
import { headers } from "next/headers";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import { quoteProduct } from "../fixtures/commerce-quote";
import { discoverySource } from "../fixtures/commerce-discovery";
import { commerceQuantityPricing } from "@/domain/commerce/quantity-pricing";
import { defaultBlogSettings } from "@/domain/commerce/blog-settings";
import { readPublicBlog } from "@/repositories/commerce-blog";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/repositories/commerce-blog", () => ({ readPublicBlog: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, permanentRedirect: (url: string) => { throw new Error(`308:${url}`); }, redirect: (url: string) => { throw new Error(`307:${url}`); } }));
vi.mock("@/repositories/commerce", () => ({ commerceProducts: vi.fn(), getCommerceStore: vi.fn(), publicCommerceProduct: (p: unknown) => p }));
vi.mock("@/services/commerce/preview", () => ({ requireCommercePreview: vi.fn() }));
vi.mock("@/components/commerce/Storefront", () => ({ Storefront: ({ children, path }: { children: React.ReactNode; path: string[] }) => <main data-reference={path[1]} data-has-children={Boolean(children)}>{children}</main> }));
const settings = storeSettingsSchema.parse({ name: "Loja", description: "Produtos", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "a@example.test", contactPhone: "", pickupEnabled: false, pickupAddress: "", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "Condições" });
const product = { ...quoteProduct, slug: "botton-3-5-cm" };
const props = (reference: string) => ({ params: Promise.resolve({ slug: "ground-shop", path: ["produto", reference] }) });
beforeEach(() => {
  vi.mocked(readPublicBlog).mockResolvedValue({ settings: defaultBlogSettings("other", "Loja"), articles: [] });
  vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", "");
  vi.mocked(headers).mockResolvedValue(new Headers() as Awaited<ReturnType<typeof headers>>);
  vi.mocked(getCommerceStore).mockResolvedValue({ tenant_id: "tenant-a", slug: "ground-shop", status: "published", settings } as Awaited<ReturnType<typeof getCommerceStore>>);
  vi.mocked(commerceProducts).mockResolvedValue([product] as unknown as Awaited<ReturnType<typeof commerceProducts>>);
  vi.mocked(requireCommercePreview).mockResolvedValue({ tenant_id: "tenant-a", settings } as Awaited<ReturnType<typeof requireCommercePreview>>);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe("product page routing and SEO", () => {
  it("renders a friendly URL with server JSON-LD outside storefront children (buyer session stays enabled)", async () => {
    const html = renderToStaticMarkup(await StorePage(props(product.slug)));
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("main")?.getAttribute("data-reference")).toBe(product.slug);
    expect(doc.querySelector("main")?.getAttribute("data-has-children")).toBe("false");
    const script = doc.querySelector('script[type="application/ld+json"]')!;
    const structuredProduct = JSON.parse(script.textContent!)["@graph"][0];
    expect(structuredProduct.name).toBe(product.name);
    expect(structuredProduct.offers.price).toBe((product.unitCents * product.minQuantity / 100).toFixed(2));
    expect(structuredProduct.offers.priceCurrency).toBe("BRL");
    expect(doc.querySelector("main script")).toBeNull();
    expect(commerceProducts).toHaveBeenCalledWith("tenant-a");
  });
  it.each([false, true])("includes the selected purchase price in server-rendered JSON-LD on a custom domain: %s", async customDomain => {
    if (customDomain) {
      vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", JSON.stringify({ "groundshop.com.br": "ground-shop" }));
      vi.mocked(headers).mockResolvedValue(new Headers({ host: "groundshop.com.br" }) as Awaited<ReturnType<typeof headers>>);
    }
    const pricing = commerceQuantityPricing(discoverySource);
    const pricedProduct = { ...product, minQuantity: discoverySource.minQuantity, maxQuantity: discoverySource.maxQuantity, unitCents: pricing.minimumPurchase.unitCents, quantityPricing: pricing };
    vi.mocked(commerceProducts).mockResolvedValue([pricedProduct] as unknown as Awaited<ReturnType<typeof commerceProducts>>);
    const html = renderToStaticMarkup(await StorePage({ ...props(pricedProduct.slug!), searchParams: Promise.resolve({ quantidade: "100" }) }));
    const doc = new DOMParser().parseFromString(html, "text/html");
    const data = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(data["@graph"][0].offers).toMatchObject({ "@type": "Offer", price: "300.00", priceCurrency: "BRL", eligibleQuantity: { minValue: 100, maxValue: 100 } });
    expect(data["@graph"][0].offers.price).toBe(data["@graph"][0].offers.priceSpecification.price);
  });
  it("permanently redirects old UUIDs while keeping pending artwork selections", async () => {
    await expect(StorePage({ ...props(product.id), searchParams: Promise.resolve({ arte: "library", arteEstudio: "draft" }) })).rejects.toThrow("308:/loja/ground-shop/produto/botton-3-5-cm?arte=library&arteEstudio=draft");
  });
  it("redirects within the verified custom domain, never to the platform or a request-supplied host", async () => {
    vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", JSON.stringify({ "groundshop.com.br": "ground-shop" }));
    vi.mocked(headers).mockResolvedValue(new Headers({ host: "groundshop.com.br" }) as Awaited<ReturnType<typeof headers>>);
    await expect(StorePage(props(product.id))).rejects.toThrow("308:/produto/botton-3-5-cm");
    expect((await generateMetadata(props(product.id))).alternates?.canonical).toBe("https://groundshop.com.br/produto/botton-3-5-cm");
  });
  it("returns 404/noindex for missing, inactive or other-tenant products without querying a UUID from a slug", async () => {
    vi.mocked(commerceProducts).mockResolvedValue([]);
    await expect(StorePage(props(product.slug))).rejects.toThrow("NOT_FOUND");
    expect((await generateMetadata(props(product.slug))).robots).toMatchObject({ index: false });
    await expect(StorePage(props("installHook.js.map"))).rejects.toThrow("NOT_FOUND");
  });
  it("keeps the private preview authorized, non-indexable and usable with both URL formats", async () => {
    await expect(PreviewPage({ ...props(product.id), searchParams: Promise.resolve({ arteEstudio: "saved" }) })).rejects.toThrow("307:/commerce/ground-shop/preview/produto/botton-3-5-cm?arteEstudio=saved");
    expect(requireCommercePreview).toHaveBeenCalledWith("ground-shop");
    expect(renderToStaticMarkup(await PreviewPage(props(product.slug)))).toContain('data-reference="botton-3-5-cm"');
  });
});
