import { describe, expect, it } from "vitest";
import { evaluateFinancialIndicator, type FinancialIndicatorFormula } from "@/domain/finance/indicators";

describe("custom financial indicators", () => {
  it("calculates the Ground Shop commission base as sales minus freight", () => {
    const result = evaluateFinancialIndicator(formula([
      component("sales", "Vendas", "add", { directions: ["inflow"], categoryIds: ["sales"] }),
      component("freight", "Fretes", "subtract", { categoryIds: ["freight"] })
    ]), [
      transaction("sale-1", 100_000, { direction: "inflow", categoryId: "sales" }),
      transaction("freight-1", -12_500, { direction: "outflow", categoryId: "freight" }),
      transaction("software-1", -5_000, { direction: "outflow", categoryId: "software" })
    ]);

    expect(result.value).toBe(87_500);
    expect(result.components[0]).toMatchObject({ matchedCount: 1, value: 100_000, contribution: 100_000 });
    expect(result.components[1]).toMatchObject({ matchedCount: 1, value: 12_500, contribution: -12_500 });
  });

  it("ignores confirmed internal transfers unless the component explicitly includes them", () => {
    const transfers = [
      transaction("out", -20_000, { internalTransferConfirmed: true }),
      transaction("in", 20_000, { direction: "inflow", internalTransferConfirmed: true })
    ];
    expect(evaluateFinancialIndicator(formula([component("cash", "Caixa")]), transfers).value).toBe(0);
    expect(evaluateFinancialIndicator(formula([
      component("cash", "Caixa", "add", { includeInternalTransfers: true }, "signed")
    ]), transfers).value).toBe(0);
  });

  it("supports count and average with the same deterministic filters", () => {
    const rows = [transaction("a", 10_000), transaction("b", 20_001)];
    const count = { ...component("count", "Vendas"), aggregation: "count" as const };
    const average = { ...component("average", "Ticket médio"), aggregation: "average" as const };
    expect(evaluateFinancialIndicator(formula([count]), rows).value).toBe(2);
    expect(evaluateFinancialIndicator(formula([average]), rows).value).toBe(15_000.5);
  });

  it("matches a selected category when it is stored as the transaction subcategory", () => {
    const result = evaluateFinancialIndicator(
      formula([component("freight", "Fretes", "add", { categoryIds: ["freight"] })]),
      [transaction("freight-1", -3_500, { categoryId: "expenses", subcategoryId: "freight" })]
    );
    expect(result.value).toBe(3_500);
  });
});

function formula(components: FinancialIndicatorFormula["components"]): FinancialIndicatorFormula {
  return { components };
}

function component(
  id: string,
  label: string,
  operation: "add" | "subtract" = "add",
  filters: FinancialIndicatorFormula["components"][number]["filters"] = {},
  amountMode: "absolute" | "signed" = "absolute"
): FinancialIndicatorFormula["components"][number] {
  return { id, label, operation, aggregation: "sum", amountMode, filters };
}

function transaction(id: string, amountCents: number, override: Record<string, unknown> = {}) {
  return {
    id, amountCents, direction: amountCents >= 0 ? "inflow" as const : "outflow" as const,
    nature: amountCents >= 0 ? "operating_revenue" : "operating_expense",
    categoryId: null, subcategoryId: null, accountId: "account", sourceType: "generic",
    reviewStatus: "reviewed", ...override
  };
}
