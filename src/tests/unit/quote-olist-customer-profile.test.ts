import { describe, expect, it } from "vitest";
import { extractOlistCustomerProfile } from "@/services/olist/customer-profile";

describe("Olist customer profile selected for the quote", () => {
  it("selects the requested contact instead of the first search result and maps full address", () => {
    const result = extractOlistCustomerProfile({ itens: [{ id: 1, nome: "Outro cliente" }, { id: 2, nome: "Cliente correto", cpfCnpj: "52998224725", email: "cliente@example.test", celular: "11999999999", endereco: { cep: "01001000", endereco: "Praça da Sé", numero: "10", complemento: "Sala 2", bairro: "Sé", municipio: "São Paulo", uf: "sp" } }] }, "2");
    expect(result).toEqual({ name: "Cliente correto", document: "52998224725", email: "cliente@example.test", phone: "11999999999", postalCode: "01001000", addressLine: "Praça da Sé", addressNumber: "10", addressComplement: "Sala 2", district: "Sé", city: "São Paulo", state: "SP" });
  });
  it("does not return another contact's data", () => {
    expect(extractOlistCustomerProfile({ id: 1, nome: "Outro cliente" }, "2")).toBeNull();
  });
  it("omits missing/empty values so an import cannot erase existing fields", () => {
    expect(extractOlistCustomerProfile({ data: { contato: { id: "2", nome: "Nome atualizado", celular: "", telefone: "1133334444", endereco: { numero: 0, complemento: null } } } }, "2")).toEqual({ name: "Nome atualizado", phone: "1133334444", addressNumber: "0" });
  });
});
