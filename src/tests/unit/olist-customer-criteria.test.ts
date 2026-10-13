import { describe, expect, it } from "vitest";
import { buildOlistCustomerLookupPath, resolveOlistCustomerLookupCriteria } from "@/services/olist/customer-lookup";

describe("shared Olist customer criteria", () => {
  it.each([
    ["Angelita", "nome", "Angelita"],
    ["529.982.247-25", "cpfCnpj", "52998224725"],
    ["+55 (11) 99999-9999", "celular", "5511999999999"],
    ["cliente@example.test", "email", "cliente@example.test"]
  ])("detects an explicit search term consistently: %s", (value, mode, normalized) => {
    expect(resolveOlistCustomerLookupCriteria({ mode: "auto", value, cpfCnpj: "11111111111", nome: "Outro" })).toEqual({ mode, value: normalized });
  });

  it("only uses the selected field for explicit searches", () => {
    expect(resolveOlistCustomerLookupCriteria({ mode: "celular", celular: "(11) 99999-9999", cpfCnpj: "52998224725" })).toEqual({ mode: "celular", value: "11999999999" });
    expect(resolveOlistCustomerLookupCriteria({ mode: "codigo", codigo: "CLI123", nome: "Cliente" })).toEqual({ mode: "codigo", value: "CLI123" });
  });

  it("removes stale contact filters and pagination from a configured endpoint", () => {
    const path = buildOlistCustomerLookupPath("/contatos?cpfCnpj=antigo&nome=Outro&situacao=I&limit=1&offset=20&tipoPessoa=F", { mode: "nome", value: "Angelita" });
    const params = new URL(path, "https://example.test").searchParams;
    expect(params.getAll("nome")).toEqual(["Angelita"]);
    expect(params.has("cpfCnpj")).toBe(false);
    expect(params.has("situacao")).toBe(false);
    expect(params.get("limit")).toBe("5");
    expect(params.get("offset")).toBe("0");
    expect(params.get("tipoPessoa")).toBe("F");
  });
});
