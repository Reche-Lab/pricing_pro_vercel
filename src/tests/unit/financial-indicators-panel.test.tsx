import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinancialIndicatorsPanel } from "@/components/finance/FinancialIndicatorsPanel";
import type { FinanceOverview } from "@/components/finance/FinanceWorkspace";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const baseId = "123e4567-e89b-42d3-a456-426614174000";
function openNew() {
  const overview = {
    competence: "2026-09", transactions: [], natures: [], categories: [], accounts: [],
    indicators: [{ id: baseId, name: "Base de comissão", unit: "currency", sort_order: 10, active: true,
      formula: { components: [] }, value: 87_500, component_results: [], is_frozen: false }]
  } as unknown as FinanceOverview;
  render(<FinancialIndicatorsPanel overview={overview} onRefresh={vi.fn().mockResolvedValue(undefined)} onMessage={vi.fn()} onDrilldown={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button", { name: /Novo indicador/ }));
  fireEvent.change(screen.getByLabelText("Nome do indicador"), { target: { value: "Comissão" } });
  fireEvent.change(screen.getByLabelText("Base do cálculo"), { target: { value: "indicator" } });
  fireEvent.change(screen.getByLabelText("Indicador-base"), { target: { value: baseId } });
}

describe("financial indicator configuration", () => {
  it("saves 15 percent of the selected existing indicator and hides transaction filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    openNew();
    fireEvent.change(screen.getByLabelText("Aplicar ao resultado completo"), { target: { value: "percentage" } });
    expect(screen.getByLabelText("Percentual (%)")).toHaveValue("15");
    expect(screen.getByText("15% × (Base de comissão)")).toBeInTheDocument();
    expect(screen.queryByText("Componentes da fórmula")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar indicador" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      name: "Comissão", unit: "currency", effectiveFrom: "2026-09",
      formula: { components: [], sourceIndicatorId: baseId, adjustment: { operation: "percentage", factor: 15 } }
    });
  });

  it("supports clearing the factor and decimal commas, and rejects division by zero before sending", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ preview: { value: 10, components: [] } }) });
    vi.stubGlobal("fetch", fetchMock);
    openNew();
    fireEvent.change(screen.getByLabelText("Aplicar ao resultado completo"), { target: { value: "divide" } });
    fireEvent.change(screen.getByLabelText("Divisor"), { target: { value: "" } });
    expect(screen.getByLabelText("Divisor")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Divisor"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Calcular prévia" }));
    expect(await screen.findByText(/divisor deve ser maior que zero/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Divisor"), { target: { value: "2,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Calcular prévia" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).formula.adjustment).toEqual({ operation: "divide", factor: 2.5 });
  });
});
