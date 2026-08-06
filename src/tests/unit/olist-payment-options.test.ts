import { describe, expect, it } from "vitest";
import { extractOlistPaymentOptions } from "@/services/olist/payment-options";

describe("olist payment options", () => {
  it("extracts receiving methods from the paginated itens response", () => {
    const options = extractOlistPaymentOptions({
      itens: [
        { id: 737273263, nome: "Pix" },
        { id: 737273264, nome: "Cartão de crédito" }
      ]
    }, "receiving_method");

    expect(options).toMatchObject([
      { kind: "receiving_method", externalId: "737273263", name: "Pix" },
      { kind: "receiving_method", externalId: "737273264", name: "Cartão de crédito" }
    ]);
  });

  it("extracts nested receiving method collections", () => {
    const options = extractOlistPaymentOptions({
      data: {
        formasRecebimento: [
          { codigo: "10", descricao: "Link de pagamento", grupo: "Digital" }
        ]
      }
    }, "receiving_method");

    expect(options).toEqual([
      expect.objectContaining({
        kind: "receiving_method",
        externalId: "10",
        name: "Link de pagamento",
        groupName: "Digital"
      })
    ]);
  });

  it("ignores malformed records instead of exposing empty options", () => {
    const options = extractOlistPaymentOptions({ itens: [{ id: 1 }, { nome: "Sem ID" }] }, "category");
    expect(options).toEqual([]);
  });
});
