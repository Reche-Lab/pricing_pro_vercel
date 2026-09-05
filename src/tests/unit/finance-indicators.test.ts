import { describe, expect, it } from "vitest";
import { createFinancialIndicatorResolver, evaluateFinancialIndicator, validateFinancialIndicatorVersions, type FinancialIndicatorFormula, type FinancialIndicatorDefinition } from "@/domain/finance/indicators";
import { indicatorFormulaSchema } from "@/app/api/finance/indicators/_schema";

describe("custom financial indicators", () => {
  const commissionBase: FinancialIndicatorDefinition = { id: "base", name: "Base de comissão", unit: "currency", versionId: "base-v1", formula: formula([
    component("sales", "Vendas", "add", { directions: ["inflow"] }),
    component("freight", "Fretes", "subtract", { categoryIds: ["freight"] })
  ]) };
  const entries = [transaction("sales", 100_000), transaction("freight", -12_500, { categoryId: "freight" })];

  it("applies 15 percent to the entire sales-minus-freight calculation", () => {
    const result = evaluateFinancialIndicator({ ...commissionBase.formula, adjustment: { operation: "percentage", factor: 15 } }, entries);
    expect(result.value).toBe(13_125);
    expect(result.components.map((item) => item.contribution)).toEqual([100_000, -12_500]);
  });

  it("resolves referenced indicators independently of list order and preserves traceability", () => {
    const resolve = createFinancialIndicatorResolver([
      { id: "commission", name: "Comissão", unit: "currency", formula: { components: [], sourceIndicatorId: "base", adjustment: { operation: "percentage", factor: 15 } } },
      commissionBase,
      { id: "split", name: "Divisão", unit: "currency", formula: { components: [], sourceIndicatorId: "commission", adjustment: { operation: "divide", factor: 3 } } }
    ], entries);
    expect(resolve("commission").value).toBe(13_125);
    expect(resolve("commission").components[0]).toMatchObject({ sourceIndicatorId: "base", sourceVersionId: "base-v1", value: 87_500, transactionIds: ["sales", "freight"] });
    expect(resolve("split").value).toBe(4_375);
  });

  it("supports decimal multipliers, zero percentages and negative calculation bases", () => {
    expect(evaluateFinancialIndicator({ ...commissionBase.formula, adjustment: { operation: "multiply", factor: 0.15 } }, entries).value).toBe(13_125);
    expect(evaluateFinancialIndicator({ ...commissionBase.formula, adjustment: { operation: "percentage", factor: 0 } }, entries).value).toBe(0);
    expect(evaluateFinancialIndicator({ ...commissionBase.formula, adjustment: { operation: "percentage", factor: 15 } }, entries.slice(1)).value).toBe(-1_875);
    expect(() => evaluateFinancialIndicator({ ...commissionBase.formula, adjustment: { operation: "divide", factor: 0 } }, entries)).toThrow("divisor");
  });

  it("rejects cycles, missing tenant references and incompatible units", () => {
    const dependent: FinancialIndicatorDefinition = { id: "other", name: "Outro", unit: "currency", formula: { components: [], sourceIndicatorId: "base" } };
    expect(() => createFinancialIndicatorResolver([{ ...commissionBase, formula: { components: [], sourceIndicatorId: "base" } }], entries)("base")).toThrow("circular");
    expect(() => createFinancialIndicatorResolver([dependent, { ...commissionBase, formula: { components: [], sourceIndicatorId: "other" } }], entries)("base")).toThrow("circular");
    expect(() => createFinancialIndicatorResolver([dependent], entries)("other")).toThrow("não está disponível");
    expect(() => createFinancialIndicatorResolver([commissionBase, { ...dependent, unit: "number" }], entries)("other")).toThrow("mesmo formato");
  });

  it("uses frozen values and calculation memory without evaluating newer formulas", () => {
    const resolve = createFinancialIndicatorResolver([
      { ...commissionBase, formula: { components: [], sourceIndicatorId: "no-longer-available" }, frozen: { value: 50_000, components: [] } },
      { id: "commission", name: "Comissão", unit: "currency", formula: { components: [], sourceIndicatorId: "base", adjustment: { operation: "percentage", factor: 15 } } }
    ], entries);
    expect(resolve("commission").value).toBe(7_500);
  });

  it("validates dependencies at future effective dates and rejects a base that starts too late", () => {
    const base = { ...commissionBase, version: 1, effective_from: "2026-07-01" };
    const other = { ...commissionBase, id: "other", version: 1, effective_from: "2026-07-01", formula: { components: [], sourceIndicatorId: "base" } };
    expect(() => validateFinancialIndicatorVersions([base, other])).not.toThrow();
    expect(() => validateFinancialIndicatorVersions([base, other, { ...base, version: 2, effective_from: "2026-09-01", formula: { components: [], sourceIndicatorId: "other" } }])).toThrow("circular");
    expect(() => validateFinancialIndicatorVersions([{ ...base, effective_from: "2026-08-01" }, other])).toThrow("não está disponível");
    expect(() => validateFinancialIndicatorVersions([base, other, { ...other, version: 2, effective_from: "2026-08-01", formula: base.formula }, { ...base, version: 2, effective_from: "2026-09-01", formula: { components: [], sourceIndicatorId: "other" } }])).not.toThrow();
  });

  it("accepts legacy formulas and validates the new structured payloads", () => {
    const linked = { components: [], sourceIndicatorId: "123e4567-e89b-42d3-a456-426614174000", adjustment: { operation: "percentage", factor: 15 } };
    expect(indicatorFormulaSchema.safeParse(formula([component("sales", "Vendas")])).success).toBe(true);
    expect(indicatorFormulaSchema.safeParse(linked).success).toBe(true);
    expect(indicatorFormulaSchema.safeParse({ ...linked, components: commissionBase.formula.components }).success).toBe(false);
    expect(indicatorFormulaSchema.safeParse({ components: [] }).success).toBe(false);
    expect(indicatorFormulaSchema.safeParse({ ...linked, adjustment: { operation: "divide", factor: 0 } }).success).toBe(false);
    expect(indicatorFormulaSchema.safeParse({ ...linked, adjustment: { operation: "multiply", factor: Infinity } }).success).toBe(false);
  });
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
