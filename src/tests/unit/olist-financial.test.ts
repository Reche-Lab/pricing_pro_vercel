import { describe, expect, it } from "vitest";
import { financialAccessMessage, parseOlistFinancialPage } from "@/services/finance/integrations/olist-financial";

describe("olist financial integration", () => {
  it("reads the official paginated response", () => {
    const page = parseOlistFinancialPage({
      itens: [{ id: 101, valor: 120.5 }, { id: 102, valor: 80 }],
      paginacao: { total: 245, limit: 100, offset: 0 }
    });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ id: 101, valor: 120.5 });
    expect(page.total).toBe(245);
  });

  it("accepts direct records and malformed empty responses safely", () => {
    expect(parseOlistFinancialPage({ id: 7, valor: 10 }).items).toEqual([{ id: 7, valor: 10 }]);
    expect(parseOlistFinancialPage({ mensagem: "sem registros" })).toEqual({ items: [], total: null });
  });

  it("explains authentication and module permission failures", () => {
    expect(financialAccessMessage("Contas a receber", 403, "fallback")).toContain("permissão de leitura");
    expect(financialAccessMessage("Contas a pagar", 401, "fallback")).toContain("refaça o OAuth");
  });
});
