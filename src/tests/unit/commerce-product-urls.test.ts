import { afterEach, describe, expect, it, vi } from "vitest";
import { commerceProductPath, findCommerceProduct, productRedirectUrl } from "@/domain/commerce/product-urls";
import { storeProductMetadata, storeProductStructuredData } from "@/services/commerce/product-seo";
import { commerceSitemapEntries } from "@/services/commerce/sitemap";
import { serializeStructuredData } from "@/services/commerce/store-seo";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import { quoteProduct } from "../fixtures/commerce-quote";

const product = { ...quoteProduct, slug: "botton-3-5-cm" };
const settings = storeSettingsSchema.parse({ name: "Ground Shop", description: "Personalizados", contactEmail: "loja@example.test", contactPhone: "", logoUrl: "", bannerUrl: "", accent: "#047857", pickupEnabled: false, pickupAddress: "", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "Condições" });
afterEach(() => vi.unstubAllEnvs());
describe("stable tenant-scoped product URLs", () => {
  it("uses the persisted slug, including after renaming the product", () => {
    expect(commerceProductPath("", product)).toBe("/produto/botton-3-5-cm");
    expect(commerceProductPath("/loja/ground-shop", { ...product, name: "Novo nome" })).toBe("/loja/ground-shop/produto/botton-3-5-cm");
    expect(commerceProductPath("/commerce/ground-shop/preview", product)).toBe("/commerce/ground-shop/preview/produto/botton-3-5-cm");
    expect(commerceProductPath("", { id: "legacy" })).toBe("/produto/legacy");
  });
  it("resolves slug and old UUID only within the supplied tenant catalog", () => {
    expect(findCommerceProduct([product], product.slug)).toBe(product);
    expect(findCommerceProduct([product], product.id.toUpperCase())).toBe(product);
    expect(findCommerceProduct([], product.slug)).toBeUndefined();
    for (const value of [undefined, "installHook.js.map", "../conta", "%2F", "BOTTON-3-5-CM"]) expect(findCommerceProduct([product], value)).toBeUndefined();
  });
  it("preserves studio/library and repeated query parameters during legacy redirects", () => {
    expect(productRedirectUrl("", product, { arte: "image", arteEstudio: "draft", utm_source: ["a", "b"], ignored: undefined })).toBe("/produto/botton-3-5-cm?arte=image&arteEstudio=draft&utm_source=a&utm_source=b");
    expect(productRedirectUrl("/loja/shop", product, {})).toBe("/loja/shop/produto/botton-3-5-cm");
  });
  it("uses only canonical friendly URLs in sitemaps on the store's own domain", () => {
    vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", JSON.stringify({ "groundshop.com.br": "ground-shop" }));
    const entries = commerceSitemapEntries("ground-shop", [product], "https://platform.example.test");
    expect(entries.some(entry => entry.url === "https://groundshop.com.br/produto/botton-3-5-cm")).toBe(true);
    expect(entries.some(entry => entry.url.includes(product.id))).toBe(false);
  });
  it("gives each product a unique title, description, social image and canonical URL", () => {
    vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", JSON.stringify({ "groundshop.com.br": "ground-shop" }));
    const metadata = storeProductMetadata("ground-shop", product, settings, true);
    expect(metadata.title).toEqual({ absolute: "Botton - 3,5 cm | Ground Shop" });
    expect(metadata.description).toBe(product.description);
    expect(metadata.alternates?.canonical).toBe("https://groundshop.com.br/produto/botton-3-5-cm");
    expect(metadata.openGraph).toMatchObject({ title: "Botton - 3,5 cm | Ground Shop", images: [{ url: "https://groundshop.com.br/mockups/botton-25mm-v1/base-verso.png", alt: product.name }] });
    expect(storeProductMetadata("ground-shop", product, settings, false).robots).toMatchObject({ index: false });
  });
  it("publishes accurate product and breadcrumb JSON-LD without invented stock or reviews", () => {
    const data = storeProductStructuredData("ground-shop", product, settings, "https://platform.example.test");
    const item = data["@graph"][0];
    expect(item).toMatchObject({ "@type": "Product", name: product.name, category: "Bottons", offers: { "@type": "Offer", price: "5.00", priceCurrency: "BRL", eligibleQuantity: { minValue: 1, maxValue: 1000 } } });
    expect(item).not.toHaveProperty("aggregateRating");
    expect(item.offers).not.toHaveProperty("availability");
    expect(data["@graph"][1]).toMatchObject({ "@type": "BreadcrumbList", itemListElement: [{ position: 1 }, { position: 2 }, { position: 3, item: "https://platform.example.test/loja/ground-shop/produto/botton-3-5-cm" }] });
    expect(serializeStructuredData(storeProductStructuredData("ground-shop", { ...product, name: "</script><script>" }, settings))).not.toContain("<");
  });
});
