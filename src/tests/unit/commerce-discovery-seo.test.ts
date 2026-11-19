import { afterEach, describe, expect, it, vi } from "vitest";
import { commerceMerchantFeed, merchantFeedEligible } from "@/services/commerce/merchant-feed";
import { storeProductMetadata, storeProductStructuredData } from "@/services/commerce/product-seo";
import { commerceMerchantSchema } from "@/domain/commerce/merchant";
import { productQuestions } from "@/domain/commerce/product-questions";
import { publicCommerceProduct } from "@/repositories/commerce";
import { STORE_PRIVATE_PATHS, PLATFORM_PRIVATE_PATHS, publicCrawlerRules, storeRobotsText } from "@/domain/commerce/robots";
import { storeIdentityStructuredData } from "@/services/commerce/store-seo";
import { discoveryProduct as product, discoverySettings as settings, discoverySource } from "../fixtures/commerce-discovery";
const enabled = { enabled: true, identifiersAbsent: true, brand: "", gtin: "", mpn: "" };
afterEach(() => vi.unstubAllEnvs());
describe("discoverable real price conditions", () => {
  it("states the lowest unit price, its quantity, minimum total and discount in metadata", () => {
    const metadata = storeProductMetadata("shop", product, settings, true);
    expect(metadata.title).toEqual({ absolute: "Botton - 3,5 cm com desconto por quantidade | Ground Shop" });
    expect(metadata.description).toContain("2,00/un. em 1.000 unidades com uma mesma arte");
    expect(metadata.description).toContain("60%");
    expect(metadata.description).toContain("10 un. por R$");
    expect(metadata.description).toContain("50,00");
  });
  it("identifies the real store with only its public contact data", () => {
    const data = storeIdentityStructuredData("shop", settings, "https://platform.example.test");
    expect(data["@graph"][0]).toMatchObject({ "@type": "Organization", name: settings.name, email: settings.contactEmail });
    expect(data["@graph"][1]).toMatchObject({ "@type": "WebSite", url: "https://platform.example.test/loja/shop" });
    expect(JSON.stringify(data)).not.toMatch(/rating|award|openingHours|password|token/);
  });
  it("marks up the minimum purchasable total, never the cheapest conditional unit price", () => {
    const item = storeProductStructuredData("shop", product, settings)["@graph"][0];
    expect(item.offers.priceSpecification.price).toBe("50.00");
    expect(item.offers).toHaveProperty("price", "50.00");
    expect(item.offers).toHaveProperty("priceCurrency", "BRL");
    expect(item.offers.eligibleQuantity).toMatchObject({ minValue: 10, maxValue: 10 });
    expect(item.offers.priceSpecification.referenceQuantity).toMatchObject({ value: 10, valueReference: { value: 1 } });
    expect(item.offers).not.toHaveProperty("availability");
    expect(item).not.toHaveProperty("aggregateRating");
  });
  it("matches the selected published quantity while canonical stays the product URL", () => {
    const item = storeProductStructuredData("shop", product, settings, "https://platform.example.test", "100")["@graph"][0];
    expect(item.offers.priceSpecification.price).toBe("300.00");
    expect(item.offers).toHaveProperty("price", "300.00");
    expect(item.offers.url).toBe("https://platform.example.test/loja/shop/produto/botton-3-5-cm?quantidade=100");
    expect(item.url).toBe("https://platform.example.test/loja/shop/produto/botton-3-5-cm");
    expect(storeProductStructuredData("shop", product, settings, undefined, "101")["@graph"][0].offers.priceSpecification.price).toBe("50.00");
    expect(storeProductStructuredData("shop", product, settings, undefined, "101")["@graph"][0].offers).toHaveProperty("price", "50.00");
  });
  it("provides a direct positive offer price for every published quantity, matching its pricing specification", () => {
    for (const row of product.quantityPricing!.rows) {
      const { offers } = storeProductStructuredData("shop", product, settings, undefined, String(row.quantity))["@graph"][0];
      expect(offers).toHaveProperty("price", (row.totalCents / 100).toFixed(2));
      expect(offers).toHaveProperty("price", offers.priceSpecification.price);
      expect(Number(Reflect.get(offers, "price"))).toBeGreaterThan(0);
      expect(offers.priceCurrency).toBe("BRL");
      expect(offers.eligibleQuantity.minValue).toBe(row.quantity);
    }
  });
  it("keeps a direct decimal price for legacy products without a published quantity table", () => {
    const { offers } = storeProductStructuredData("shop", { ...product, quantityPricing: undefined, unitCents: 499 }, settings)["@graph"][0];
    expect(offers).toHaveProperty("price", "49.90");
    expect(offers.priceSpecification.referenceQuantity.value).toBe(10);
  });
  it("publishes only configured factual benefits and production rules", () => {
    const withBenefit = publicCommerceProduct({ ...discoverySource, artworkOptions: { discountFixedCents: 1500, maxDiscountPercent: 10 } as typeof discoverySource.artworkOptions });
    const text = productQuestions(withBenefit, settings).map(item => item.answer).join(" ");
    expect(text).toContain("15,00"); expect(text).toContain("10%"); expect(text).toContain("não são simplesmente somados");
    expect(text).toContain("10 dias úteis");
    expect(text).toContain("quantidade de cada arte");
    expect(productQuestions(product, settings).some(item => item.question.includes("benefício"))).toBe(false);
    expect(productQuestions({ ...product, personalized: false }, settings).some(item => item.question.includes("arte"))).toBe(false);
  });
  it("cannot leak caller mutations through the public cache and updates prices/settings immediately", () => {
    const first = publicCommerceProduct(discoverySource);
    first.quantityPricing!.rows[0].totalCents = -1; first.name = "alterado";
    const second = publicCommerceProduct(discoverySource);
    expect(second.name).toBe(discoverySource.name); expect(second.quantityPricing!.minimumPurchase.totalCents).toBe(5000);
    const changed = publicCommerceProduct({ ...discoverySource, platform: { ...discoverySource.platform, fixedFee: 10 } });
    expect(changed.quantityPricing!.minimumPurchase.totalCents).not.toBe(second.quantityPricing!.minimumPurchase.totalCents);
    expect(publicCommerceProduct({ ...discoverySource, merchant: { ...enabled, token: "never public" } as typeof enabled }).merchant).toBeUndefined();
    expect(publicCommerceProduct({ ...discoverySource, merchant: enabled }).merchant?.enabled).toBe(true);
    expect(publicCommerceProduct(discoverySource).merchant).toBeUndefined();
  });
});
describe("opt-in Google Merchant catalog", () => {
  it("requires real identifiers or explicit absence, validates check digits and rejects contradictory claims", () => {
    expect(commerceMerchantSchema.safeParse({ ...enabled, identifiersAbsent: false }).success).toBe(false);
    expect(commerceMerchantSchema.safeParse({ ...enabled, identifiersAbsent: false, gtin: "7894900011517" }).success).toBe(true);
    expect(commerceMerchantSchema.safeParse({ ...enabled, identifiersAbsent: false, gtin: "7894900011518" }).success).toBe(false);
    expect(commerceMerchantSchema.safeParse({ ...enabled, mpn: "known" }).success).toBe(false);
    expect(commerceMerchantSchema.safeParse({ ...enabled, identifiersAbsent: false, brand: "Fabricante", mpn: "ABC" }).success).toBe(true);
    expect(commerceMerchantSchema.safeParse({ ...enabled, token: "secret" }).success).toBe(false);
  });
  it("does not invent availability or identifiers for legacy products", () => {
    expect(merchantFeedEligible(product)).toBe(false);
    const doc = new DOMParser().parseFromString(commerceMerchantFeed("shop", settings, [product]), "application/xml");
    expect(doc.querySelectorAll("item")).toHaveLength(0);
    expect(merchantFeedEligible({ ...product, merchant: enabled, imageUrl: "http://insecure.test/image" })).toBe(false);
    expect(merchantFeedEligible({ ...product, merchant: enabled, quantityPricing: undefined })).toBe(false);
  });
  it("exports the actual minimum total and units on the correct domain with no confidential fields", () => {
    vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", '{"groundshop.com.br":"ground-shop"}');
    const xml = commerceMerchantFeed("ground-shop", settings, [{ ...product, merchant: enabled }]);
    const doc = new DOMParser().parseFromString(xml, "application/xml"), ns = "http://base.google.com/ns/1.0";
    expect(doc.querySelector("parsererror")).toBeNull();
    const field = (name: string) => doc.getElementsByTagNameNS(ns, name)[0]?.textContent;
    expect(field("price")).toBe("50.00 BRL"); expect(field("unit_pricing_measure")).toBe("10ct");
    expect(field("link")).toBe("https://groundshop.com.br/produto/botton-3-5-cm?quantidade=10");
    expect(field("availability")).toBe("in_stock"); expect(field("identifier_exists")).toBe("no");
    expect(xml).not.toMatch(/curve|commissionRate|fixedFee|password|customer_id|token/);
    expect(storeProductStructuredData("ground-shop", { ...product, merchant: enabled }, settings)["@graph"][0].offers).toHaveProperty("availability", "https://schema.org/InStock");
  });
  it("escapes XML injection and removes forbidden characters", () => {
    const doc = new DOMParser().parseFromString(commerceMerchantFeed("shop", { ...settings, name: "A & B" }, [{ ...product, name: 'A < B & "C"', description: "hello\u0000world", merchant: enabled }]), "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull(); expect(doc.querySelectorAll("item")).toHaveLength(1);
    expect(doc.querySelector("title")?.textContent).toBe("A & B");
  });
});
describe("crawler boundaries", () => {
  it("shares every exclusion with search bots, including quotes; does not change training consent", () => {
    for (const rules of [publicCrawlerRules(STORE_PRIVATE_PATHS), publicCrawlerRules(PLATFORM_PRIVATE_PATHS)]) {
      expect(rules.map(rule => rule.userAgent)).toEqual(["*", "OAI-SearchBot"]);
      expect(rules[0].disallow).toEqual(rules[1].disallow);
      expect(rules[1].disallow).toContain("/api/");
    }
    const text = storeRobotsText("https://shop.example.test");
    expect(text.match(/Disallow: \/orcamentos/g)).toHaveLength(2);
    expect(text).not.toContain("GPTBot");
    expect(text).toContain("Sitemap: https://shop.example.test/sitemap.xml");
  });
});
