// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { commerceDomains, commerceHostSlug, commerceDomainRoute, commerceStoreUrl, commercePlatformRedirect } from "@/domain/commerce/domains";
import { mercadoPagoPaymentMethods, commercePaymentSettingsSchema } from "@/domain/commerce/payment-settings";
import { commercePublicationIssues } from "@/domain/commerce/publication";
import { checkCommerceOrigin } from "@/services/commerce/http";
import type { StoreAdminInput } from "@/domain/commerce/schemas";
import { isProductionCommerceCarrier } from "@/domain/commerce/carrier-settings";
const domains = { "groundshop.com.br": "ground-shop", "www.groundshop.com.br": "ground-shop", "outra.example.com": "other" };
afterEach(() => vi.unstubAllEnvs());
describe("store launch configuration", () => {
  it("never lets a public shipping quote call sandbox or arbitrary server addresses", () => {
    expect(isProductionCommerceCarrier({})).toBe(true);
    expect(isProductionCommerceCarrier({ api_base_url: "https://www.melhorenvio.com.br/api/v2" })).toBe(true);
    for (const settings of [{ environment: "sandbox" }, { api_base_url: "http://127.0.0.1/api/v2" }, { api_base_url: "https://www.melhorenvio.com.br.evil.test/api/v2" }, { api_base_url: "invalid" }, { api_base_url: "https://user:password@www.melhorenvio.com.br/api/v2" }]) expect(isProductionCommerceCarrier(settings)).toBe(false);
  });
  it("reports each missing publication requirement instead of an ambiguous combined error", () => {
    const input = { products: [], settings: { terms: "", pickupEnabled: false, deliveryEnabled: false } } as unknown as StoreAdminInput;
    expect(commercePublicationIssues(input)).toHaveLength(3);
    expect(commercePublicationIssues({ ...input, products: [{ active: true }] as never, settings: { ...input.settings, terms: "Condições", carrierEnabled: true } }, { carrierReady: true, carrierMessage: "Conectado", paymentReady: true, emailReady: true, httpsReady: true })).toEqual([]);
    expect(commercePublicationIssues({ ...input, settings: { ...input.settings, carrierEnabled: true } }, { carrierReady: false, carrierMessage: "Cadastre o CEP de origem.", paymentReady: false, emailReady: true, httpsReady: true })).toContain("Cadastre o CEP de origem.");
  });
  it("uses only exact operator-authorized host bindings and ignores malformed mappings", () => {
    expect(commerceDomains(JSON.stringify(domains))).toEqual(domains);
    for (const value of ['[]', 'null', '{bad', '{"https://groundshop.com.br":"ground-shop"}', '{"groundshop.com.br":"../other"}']) expect(commerceDomains(value)).toEqual({});
    for (const host of ["attacker.groundshop.com.br", "groundshop.com.br.evil.test", "constructor", "__proto__"]) expect(commerceHostSlug(host, domains)).toBeNull();
    expect(commerceHostSlug("GROUNDSHOP.COM.BR", domains)).toBe("ground-shop");
    expect(commerceStoreUrl("ground-shop", "https://panel.test", domains)).toBe("https://groundshop.com.br");
    expect(commerceStoreUrl("unmapped", "https://panel.test", domains)).toBe("https://panel.test/loja/unmapped");
  });
  it("routes public pages and SEO to the correct store, not to the admin or another tenant", () => {
    expect(commerceDomainRoute("groundshop.com.br", "/", domains)).toMatchObject({ type: "rewrite", path: "/loja/ground-shop" });
    expect(commerceDomainRoute("groundshop.com.br", "/produto/id", domains)).toMatchObject({ type: "rewrite", path: "/loja/ground-shop/produto/id" });
    expect(commerceDomainRoute("groundshop.com.br", "/sitemap.xml", domains)).toMatchObject({ type: "rewrite", path: "/loja/ground-shop/sitemap.xml" });
    for (const path of ["/api/store/other/cart", "/api/commerce/admin", "/loja/other", "/commerce/ground-shop/preview"]) expect(commerceDomainRoute("groundshop.com.br", path, domains)?.type).toBe("reject");
    expect(commerceDomainRoute("groundshop.com.br", "/api/store/ground-shop/cart", domains)?.type).toBe("next");
    expect(commerceDomainRoute("www.groundshop.com.br", "/checkout", domains)).toMatchObject({ type: "redirect", host: "groundshop.com.br", path: "/checkout" });
    expect(commercePlatformRedirect("/loja/ground-shop/checkout", domains)).toEqual({ host: "groundshop.com.br", path: "/checkout" });
    expect(commercePlatformRedirect("/commerce/ground-shop/preview", domains)).toBeNull();
  });
  it("authorizes same-origin custom-domain buyer mutations only for its mapped store", () => {
    vi.stubEnv("APP_URL", "https://panel.test"); vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", JSON.stringify(domains));
    const request = (path: string, origin = "https://groundshop.com.br") => new Request(`https://groundshop.com.br${path}`, { headers: { origin } });
    expect(() => checkCommerceOrigin(request("/api/store/ground-shop/cart"))).not.toThrow();
    expect(() => checkCommerceOrigin(new Request("http://proxy.internal:3004/api/store/ground-shop/cart", { headers: { host: "groundshop.com.br", origin: "https://groundshop.com.br" } }))).not.toThrow();
    for (const path of ["/api/store/other/cart", "/api/commerce/admin"]) expect(() => checkCommerceOrigin(request(path))).toThrow("Origem");
    expect(() => checkCommerceOrigin(request("/api/store/ground-shop/cart", "https://attacker.test"))).toThrow("Origem");
  });
  it("sends documented Checkout Pro exclusions and maximum installments", () => {
    expect(mercadoPagoPaymentMethods()).toEqual({ excluded_payment_methods: [], excluded_payment_types: [], installments: 12 });
    expect(mercadoPagoPaymentMethods({ pix: false, credit: true, debit: false, boleto: false, maxInstallments: 3 })).toEqual({ excluded_payment_methods: [{ id: "pix" }], excluded_payment_types: [{ id: "debit_card" }, { id: "ticket" }], installments: 3 });
    expect(mercadoPagoPaymentMethods({ credit: false })).toMatchObject({ excluded_payment_types: [{ id: "credit_card" }], installments: 1 });
    expect(commercePaymentSettingsSchema.safeParse({ maxInstallments: 13 }).success).toBe(false);
  });
});
