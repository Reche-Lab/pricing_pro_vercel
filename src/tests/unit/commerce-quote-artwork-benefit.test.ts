import { describe, expect, it } from "vitest";
import { quoteArtworkBenefits } from "@/domain/commerce/quote-artwork-benefit";

const product = { id: "product", name: "Botton", personalized: true, artworkOptions: { allowTeamPreparation: true, discountFixedCents: 500, maxDiscountPercent: 10 } };
const line = { id: "line", productId: "product", quantity: 20, artworkName: "Arte 1", artworkId: null, preparation: "team" as const };
const priced = { id: "line", totalCents: 2000, artworkDiscountCents: 0 };
describe("conditional quote artwork benefits", () => {
  it("limits the possible benefit by both percentage and the configured fixed amount per artwork", () => {
    expect(quoteArtworkBenefits([line], [product], { items: [priced] })[0]).toMatchObject({ percent: 10, limitPerArtworkCents: 500, additionalDiscountCents: 200, artworkGroups: 1 });
    expect(quoteArtworkBenefits([line], [product], { items: [{ ...priced, totalCents: 10000 }] })[0].additionalDiscountCents).toBe(500);
  });
  it("does not advertise an already applied benefit as an additional discount", () => {
    expect(quoteArtworkBenefits([line], [product], { items: [{ ...priced, totalCents: 1800, artworkDiscountCents: 200 }] })).toEqual([]);
  });
  it("groups shared artwork once and treats unattached artwork groups separately", () => {
    const second = { ...line, id: "second" };
    const prices = { items: [{ ...priced, totalCents: 10000 }, { ...priced, id: "second", totalCents: 10000 }] };
    expect(quoteArtworkBenefits([line, second], [product], prices)[0]).toMatchObject({ artworkGroups: 2, additionalDiscountCents: 1000 });
    expect(quoteArtworkBenefits([{ ...line, artworkId: "art" }, { ...second, artworkId: "art" }], [product], prices)[0]).toMatchObject({ artworkGroups: 1, additionalDiscountCents: 500 });
  });
  it("excludes other products, disabled benefits and non-personalized items, without adding freight", () => {
    expect(quoteArtworkBenefits([line], [{ ...product, personalized: false }], { items: [priced] })).toEqual([]);
    expect(quoteArtworkBenefits([line], [{ ...product, artworkOptions: { ...product.artworkOptions, maxDiscountPercent: 0 } }], { items: [priced] })).toEqual([]);
    expect(quoteArtworkBenefits([line], [{ ...product, id: "other" }], { items: [priced] })).toEqual([]);
    expect(quoteArtworkBenefits([line], [product], null)).toEqual([]);
  });
});
