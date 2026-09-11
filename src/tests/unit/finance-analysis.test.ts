import { describe, expect, it } from "vitest";
import { summarizeFilteredTransactions, buildMonthlyGroups } from "@/domain/finance/analysis";

describe("filtered financial analysis", () => {
  it("sums only the provided movements, excluding informative rows", () => {
    expect(summarizeFilteredTransactions([{ amount_cents: "15000", direction: "inflow" }, { amount_cents: "-5000", direction: "outflow" }, { amount_cents: "99000", direction: "neutral" }])).toEqual({ inflowsCents: 15000, outflowsCents: 5000, balanceCents: 10000, informativeCount: 1 });
    expect(summarizeFilteredTransactions([]).balanceCents).toBe(0);
  });
  it("preserves group identity and fills missing months without mixing categories with natures", () => {
    const row = { competence: "2026-05-01", group_name: "Vendas", balance_cents: "-500", external_inflows_cents: "0", external_outflows_cents: "500", operating_result_cents: "-500", transaction_count: "1", pending_count: "0" };
    const groups = buildMonthlyGroups(["2026-04", "2026-05", "2026-06"], [
      { ...row, dimension: "category", group_id: "one" },
      { ...row, dimension: "category", group_id: "two" },
      { ...row, dimension: "nature", group_id: "personal" }
    ]);
    expect(groups.categories).toHaveLength(2);
    expect(groups.natures).toHaveLength(1);
    expect(groups.categories[0].series.map(s => s.balanceCents)).toEqual([0, -500, 0]);
    expect(groups.categories[0].series[1].externalOutflowsCents).toBe(500);
  });
});
