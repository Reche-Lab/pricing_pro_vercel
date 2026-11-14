// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assistantCartLines } from "@/services/commerce/assistant-tools";
import { assistantProposalSchema } from "@/domain/commerce/assistant";
import type { CommerceProduct } from "@/repositories/commerce";
import type { CartLine } from "@/domain/commerce/schemas";
const a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002";
const products = [{ id: a, name: "Botton - 3,5 cm", personalized: true, maxArtworks: 10 }, { id: b, name: "Botton - 2,5 cm", personalized: true, maxArtworks: 10 }] as CommerceProduct[];
const line: CartLine = { id: "00000000-0000-4000-8000-000000000003", productId: a, quantity: 50, artworkName: "Campanha", artworkId: "00000000-0000-4000-8000-000000000004", preparation: "team" };
const input = (items: unknown[]) => assistantProposalSchema.parse({ items });
describe("assistant cart desired quantities", () => {
  it("keeps the confirmed 50 units when the model repeats them while requesting 20 of another product", () => {
    const result = assistantCartLines([line], input([{ productId: a, quantity: 50 }, { productId: b, quantity: 20 }]), products);
    expect(result).toHaveLength(2); expect(result[0]).toEqual(line);
    expect(result.map(item => item.quantity)).toEqual([50, 20]);
  });
  it("preserves unmentioned products and never mutates the source cart or artwork", () => {
    const current = [{ ...line }];
    const result = assistantCartLines(current, input([{ productId: b, quantity: 20 }]), products);
    expect(current).toEqual([line]); expect(result[0]).toEqual(line); expect(result[1].productId).toBe(b);
  });
  it("treats a revised quantity as the desired total, not another quantity to append", () => {
    const result = assistantCartLines([line], input([{ productId: a, quantity: 70 }]), products);
    expect(result).toEqual([{ ...line, quantity: 70 }]);
  });
  it("retains existing uneven artwork groups when their product total is repeated", () => {
    const other = { ...line, id: "00000000-0000-4000-8000-000000000005", quantity: 20, artworkName: "Outra arte" };
    const current = [{ ...line, quantity: 30 }, other];
    expect(assistantCartLines(current, input([{ productId: a, quantity: 50, artworks: 2 }]), products)).toEqual(current);
  });
  it("requires explicit manual editing for ambiguous regrouping instead of duplicating or discarding artwork", () => {
    const current = [line, { ...line, id: "00000000-0000-4000-8000-000000000005" }];
    expect(() => assistantCartLines(current, input([{ productId: a, quantity: 50, artworks: 1 }]), products)).toThrow(/Alterar itens/);
    expect(() => assistantCartLines(current, input([{ productId: a, quantity: 120, artworks: 2 }]), products)).toThrow(/Alterar itens/);
    expect(() => assistantCartLines([line], input([{ productId: a, quantity: 50, artworkName: "Nova arte" }]), products)).toThrow(/Alterar itens/);
  });
  it("rejects repeated product requests within one proposal instead of silently adding quantities", () => {
    expect(() => assistantCartLines([], input([{ productId: a, quantity: 50 }, { productId: a, quantity: 50 }]), products)).toThrow(/uma vez/);
  });
  it("keeps art distribution for a new product and validates availability", () => {
    expect(assistantCartLines([], input([{ productId: b, quantity: 21, artworks: 2, artworkName: "Campanha" }]), products).map(item => item.quantity)).toEqual([11, 10]);
    expect(() => assistantCartLines([], input([{ productId: b, quantity: 20 }]), [])).toThrow(/disponível/);
  });
});
