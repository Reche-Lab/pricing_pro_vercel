// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assistantArtworkBenefit, assistantStoreGuide } from "@/domain/commerce/assistant-guide";
import { assistantSettingsSchema } from "@/domain/commerce/assistant";
import { defaultMockup } from "@/domain/commerce/artwork-options";
import type { CommerceProduct, CommerceStore } from "@/repositories/commerce";

const product = { id: "product", name: "Botton", personalized: true, geometry: { shape: "circle", widthMm: 35, heightMm: 35 }, artworkOptions: { allowTeamPreparation: true, discountFixedCents: 500, maxDiscountPercent: 10, mockup: defaultMockup() } } as CommerceProduct;
const store = { settings: { experience: { style: "studio" }, pickupEnabled: true, carrierEnabled: true }, art_library_enabled: true } as CommerceStore;
describe("authoritative assistant store guide", () => {
  it("uses configured product benefits, including both the percentage cap and the per-artwork limit", () => {
    expect(assistantArtworkBenefit(product)).toEqual({ percent: 10, limitPerArtworkCents: 500 });
    const guide = assistantStoreGuide(store, assistantSettingsSchema.parse({}), [product]);
    expect(guide.features).toMatchObject({ quotes: true, orders: true, studio: true, library: true, personalized: true, teamPreparation: true, pickup: true, delivery: true });
    expect(guide.benefits).toEqual([{ productId: "product", name: "Botton", percent: 10, limitPerArtworkCents: 500 }]);
  });
  it("never assumes that 10 percent is enabled for every product or tenant", () => {
    for (const p of [{ ...product, personalized: false }, { ...product, geometry: null }, { ...product, artworkOptions: undefined }, { ...product, artworkOptions: { ...product.artworkOptions!, discountFixedCents: 0 } }, { ...product, artworkOptions: { ...product.artworkOptions!, maxDiscountPercent: 0 } }]) expect(assistantArtworkBenefit(p)).toBeUndefined();
    expect(assistantArtworkBenefit({ ...product, artworkOptions: { ...product.artworkOptions!, maxDiscountPercent: 7 } })).toMatchObject({ percent: 7 });
  });
  it("omits unavailable features and does not include business secrets or print/pricing configuration", () => {
    const guide = assistantStoreGuide({ settings: {} } as CommerceStore, assistantSettingsSchema.parse({ allowQuotes: false, allowOrders: false }), []);
    expect(Object.values(guide.features).every(value => value === false)).toBe(true);
    expect(guide.benefits).toEqual([]);
    expect(JSON.stringify(assistantStoreGuide(store, assistantSettingsSchema.parse({}), [product]))).not.toMatch(/mockup|geometry|discountFixedCents|company|platform|curve/);
  });
  it("only offers the studio when the storefront can actually render a personalized mockup", () => {
    expect(assistantStoreGuide(store, assistantSettingsSchema.parse({}), [{ ...product, artworkOptions: undefined }]).features.studio).toBe(false);
    expect(assistantStoreGuide({ ...store, settings: { ...store.settings, experience: undefined } }, assistantSettingsSchema.parse({}), [product]).features.studio).toBe(false);
  });
  it("bounds benefit lists without claiming the rest have no benefit", () => {
    const guide = assistantStoreGuide(store, assistantSettingsSchema.parse({}), Array.from({ length: 8 }, (_, index) => ({ ...product, id: `product-${index}` })));
    expect(guide.benefits).toHaveLength(6); expect(guide.moreBenefits).toBe(true);
  });
});
