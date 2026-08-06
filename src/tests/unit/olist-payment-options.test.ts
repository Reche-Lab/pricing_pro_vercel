import { describe, expect, it } from "vitest";
import {
  extractOlistBankAccount,
  extractOlistOrderIds,
  extractOlistPaymentOptions
} from "@/services/olist/payment-options";

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

describe("olist bank account discovery", () => {
  it("extracts order ids from the Olist list response", () => {
    expect(extractOlistOrderIds({ itens: [{ id: 123 }, { id: "456" }, { numero: 789 }] })).toEqual(["123", "456"]);
  });

  it("extracts the bank account from an order payment", () => {
    expect(extractOlistBankAccount({ pagamento: { meioPagamento: { id: 987, nome: "Nu Bank" } } })).toEqual({
      externalId: "987",
      name: "Nu Bank"
    });
  });

  it("ignores orders without a complete bank account", () => {
    expect(extractOlistBankAccount({ pagamento: { meioPagamento: { nome: "Banco" } } })).toBeNull();
    expect(extractOlistBankAccount({ pagamento: null })).toBeNull();
  });
});
