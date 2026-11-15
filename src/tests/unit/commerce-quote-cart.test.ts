// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addQuoteProduct, changeQuoteQuantity, restoreRemovedQuoteLine, quoteCartFingerprint } from "@/domain/commerce/quote-cart";
import type { CartLine } from "@/domain/commerce/schemas";
const line: CartLine = { id: "line", productId: "p", quantity: 30, artworkName: "Campanha", artworkId: "art", preparation: "customer" };
const product = { id: "p", minQuantity: 10, maxQuantity: 100, maxArtworks: 10, personalized: true };
describe("quote draft editing", () => {
  it("changes a group quantity without losing IDs, preparation or artwork", () => {
    const next = changeQuoteQuantity([line], line.id, 50, product);
    expect(next).toEqual([{ ...line, quantity: 50 }]); expect(line.quantity).toBe(30);
    for (const quantity of [0, 2, 101, 1.5, NaN]) expect(() => changeQuoteQuantity([line], line.id, quantity, product)).toThrow();
  });
  it("validates combined product quantities, not only each group", () => {
    const other = { ...line, id: "other", quantity: 30 };
    expect(() => changeQuoteQuantity([line, other], line.id, 80, product)).toThrow();
    expect(changeQuoteQuantity([line, other], line.id, 1, product)[0].quantity).toBe(1);
  });
  it("adds explicit new artwork groups and preserves existing products", () => {
    const next = addQuoteProduct([line], product, 21, 2);
    expect(next[0]).toEqual(line); expect(next.map(item => item.quantity)).toEqual([30, 11, 10]);
    expect(next[1].artworkId).toBeNull(); expect(next[1].id).not.toBe(line.id);
    expect(() => addQuoteProduct([line], product, 90, 1)).toThrow();
    expect(() => addQuoteProduct([], product, 5, 10)).toThrow();
  });
  it("undoes only an unchanged draft and retains the original line position", () => {
    const other = { ...line, id: "other" };
    expect(restoreRemovedQuoteLine([other], { line, index: 0, after: quoteCartFingerprint([other]) })).toEqual([line, other]);
    expect(() => restoreRemovedQuoteLine([{ ...other, quantity: 45 }], { line, index: 0, after: quoteCartFingerprint([other]) })).toThrow(/mudou/);
  });
});
