import { afterEach, describe, expect, it, vi } from "vitest";
import { storeBrandMetadata } from "@/services/commerce/store-branding";
import { storePageMetadata, storeIdentityStructuredData } from "@/services/commerce/store-seo";
import { commerceDomainRoute } from "@/domain/commerce/domains";
import { discoverySettings as settings } from "../fixtures/commerce-discovery";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
afterEach(() => vi.unstubAllEnvs());
describe("store-specific browser and search identity", () => {
  it("accepts an optional HTTPS icon without breaking existing stores or accepting unsafe schemes", () => {
    expect(storeSettingsSchema.parse(settings).faviconUrl).toBeUndefined();
    expect(storeSettingsSchema.parse({ ...settings, faviconUrl: "https://storage.test/icon.webp" }).faviconUrl).toBe("https://storage.test/icon.webp");
    for (const faviconUrl of ["javascript:alert(1)", "data:image/svg+xml,abc", "http://storage.test/icon.png"]) expect(storeSettingsSchema.safeParse({ ...settings, faviconUrl }).success).toBe(false);
  });
  it("uses explicit store icons instead of inherited platform icons, on every page", () => {
    const metadata = storePageMetadata("shop", ["catalogo"], { ...settings, faviconUrl: "https://storage.test/a.webp" }, true, "https://panel.test");
    expect(metadata.icons).toMatchObject({ icon: [{ type: "image/png", sizes: "512x512" }] });
    expect(JSON.stringify(metadata.icons)).toContain("https://panel.test/loja/shop/icon.png?v=");
    expect(JSON.stringify(metadata.icons)).not.toContain("/favicon.ico");
    expect(metadata.manifest).toBe("https://panel.test/loja/shop/site.webmanifest");
  });
  it("has a stable path and changes its cache version only after the source changes", () => {
    const first = storeBrandMetadata("shop", { ...settings, faviconUrl: "https://storage.test/one.webp" }, "https://panel.test");
    expect(storeBrandMetadata("shop", { ...settings, faviconUrl: "https://storage.test/one.webp", description: "Mudou texto" }, "https://panel.test").icons).toEqual(first.icons);
    expect(storeBrandMetadata("shop", { ...settings, faviconUrl: "https://storage.test/two.webp" }, "https://panel.test").icons).not.toEqual(first.icons);
  });
  it("keeps the full organization logo independent of the simplified favicon", () => {
    const data = storeIdentityStructuredData("shop", { ...settings, logoUrl: "https://storage.test/full.webp", faviconUrl: "https://storage.test/symbol.webp" });
    expect(data["@graph"][0]).toHaveProperty("logo", "https://storage.test/full.webp");
    expect(JSON.stringify(data)).not.toContain("symbol.webp");
  });
  it("isolates custom-domain root icons/manifest while preserving platform assets", () => {
    const domains = { "shop.test": "shop" };
    expect(commerceDomainRoute("shop.test", "/favicon.ico", domains)).toMatchObject({ type: "rewrite", path: "/loja/shop/icon.png" });
    expect(commerceDomainRoute("shop.test", "/site.webmanifest", domains)).toMatchObject({ type: "rewrite", path: "/loja/shop/site.webmanifest" });
    expect(commerceDomainRoute("shop.test", "/icon.png", domains)).toMatchObject({ type: "rewrite", path: "/loja/shop/icon.png" });
    expect(commerceDomainRoute("panel.test", "/favicon.ico", domains)).toBeNull();
    expect(commerceDomainRoute("shop.test", "/mockups/model.png", domains)).toMatchObject({ type: "next" });
    expect(commerceDomainRoute("shop.test", "/loja/other/icon.png", domains)).toMatchObject({ type: "reject" });
  });
  it("uses the own domain and clears all inherited icon slots for stores with no imagery", () => {
    vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", '{"shop.test":"shop"}');
    expect(storeBrandMetadata("shop", settings).icons).toEqual({ icon: [], shortcut: [], apple: [] });
    const meta = storeBrandMetadata("shop", { ...settings, logoUrl: "https://storage.test/full.webp" });
    expect(JSON.stringify(meta.icons)).toContain("https://shop.test/icon.png?v=");
  });
});
