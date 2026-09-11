import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilteredTransactionsSummary } from "@/components/finance/FilteredTransactionsSummary";
import { ComparisonWorkspace } from "@/components/finance/FinancialComparison";
import type { MonthlyFinancialPoint } from "@/domain/finance/analysis";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const point = (competence: string, value: number): MonthlyFinancialPoint => ({ competence, balanceCents: value, externalInflowsCents: Math.max(0, value), externalOutflowsCents: Math.max(0, -value), operatingResultCents: value, transactionCount: 1, pendingCount: 0 });
const comparison = { series: [point("2026-04", 0), point("2026-05", 10000)], categories: [], groups: {
  categories: [{ id: "one", name: "Alimentação", series: [point("2026-04", 0), point("2026-05", -5000)] }, { id: "two", name: "Vendas", series: [point("2026-04", 0), point("2026-05", 15000)] }],
  natures: [{ id: "personal", name: "Pessoal", series: [point("2026-04", -1000), point("2026-05", -5000)] }]
} };
describe("financial analysis UI", () => {
  it("updates the filtered totals including the empty state", () => {
    const { rerender } = render(<FilteredTransactionsSummary transactions={[{ amount_cents: "15000", direction: "inflow" }, { amount_cents: "-5000", direction: "outflow" }]} />);
    expect(screen.getByText(/100,00/)).toBeInTheDocument();
    rerender(<FilteredTransactionsSummary transactions={[]} />);
    expect(screen.getByText("0 lançamento(s)")).toBeInTheDocument();
    expect(screen.getAllByText(/0,00/)).toHaveLength(3);
  });
  it("switches category/nature, metric and period with a monthly table", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ comparison }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ComparisonWorkspace competence="2026-05" onMessage={vi.fn()} />);
    await screen.findByText("Sem base anterior");
    fireEvent.click(screen.getByRole("button", { name: "Por categoria" }));
    expect(screen.getByLabelText("Indicador da evolução")).toHaveValue("balanceCents");
    fireEvent.change(screen.getByLabelText("Categoria da evolução"), { target: { value: "two" } });
    expect(screen.getByRole("heading", { name: "Vendas" })).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Por natureza" }));
    expect(screen.getByRole("heading", { name: "Pessoal" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Indicador da evolução"), { target: { value: "externalOutflowsCents" } });
    expect(screen.getByText(/Somente saídas incluídas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "12 meses" }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("months=12"), expect.anything()));
  });
  it("removes stale results and shows a readable error after a failed request", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ comparison }) }).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Não foi possível carregar." }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ComparisonWorkspace competence="2026-05" onMessage={vi.fn()} />);
    await screen.findByText("Sem base anterior");
    fireEvent.click(screen.getByRole("button", { name: "3 meses" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar.");
    expect(screen.queryByRole("img", { name: "Gráfico de evolução financeira" })).not.toBeInTheDocument();
  });
});
