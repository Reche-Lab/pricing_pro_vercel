import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommerceAnalytics } from "@/components/commerce/CommerceAnalytics";
import { storeRequest } from "@/components/commerce/store-http";
import { analyticsFixtureReport as report, analyticsFixtureSettings as settings } from "../fixtures/commerce-analytics";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn(), storeMoney: (cents: number) => `R$ ${(cents / 100).toFixed(2)}` }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("store analytics dashboard", () => {
  it("distinguishes paid revenue, pending orders, saved quotes and guest drafts without pretending to be GA4", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ settings, report });
    render(<CommerceAnalytics/>);
    expect(await screen.findByText("R$ 1234.50")).toBeInTheDocument();
    expect(screen.getByText("Rascunhos de orçamento sem login")).toBeInTheDocument();
    expect(screen.getByText(/Fonte deste painel: banco da loja/)).toBeInTheDocument();
    expect(screen.queryByText("Taxa de conversão")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "7 dias" }));
    await waitFor(() => expect(storeRequest).toHaveBeenLastCalledWith("/api/commerce/admin/analytics?days=7&environment=production"));
    fireEvent.change(screen.getByLabelText("Ambiente"), { target: { value: "test" } });
    await waitFor(() => expect(storeRequest).toHaveBeenLastCalledWith("/api/commerce/admin/analytics?days=7&environment=test"));
  });
  it("saves only analytics settings and never publishes the store or sends a Google request", async () => {
    vi.mocked(storeRequest).mockImplementation(async (url, method, body) => method === "PUT" ? { settings: body } : { settings, report });
    render(<CommerceAnalytics/>); await screen.findByText("R$ 1234.50");
    fireEvent.click(screen.getByRole("button", { name: "Configurar GA4" }));
    fireEvent.change(screen.getByLabelText("ID de medição GA4"), { target: { value: "G-ABC1234567" } });
    fireEvent.click(screen.getByLabelText("Ativar métricas opcionais do Google Analytics"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar métricas" }));
    await waitFor(() => expect(storeRequest).toHaveBeenCalledWith("/api/commerce/admin/analytics", "PUT", expect.objectContaining({ measurementId: "G-ABC1234567", enabled: true })));
    expect(document.querySelector("script[data-commerce-ga4]")).toBeNull();
    expect(vi.mocked(storeRequest).mock.calls.every(([url]) => url.startsWith("/api/commerce/admin/analytics"))).toBe(true);
  });
  it("shows a retryable failure instead of zeros when the report fails", async () => {
    vi.mocked(storeRequest).mockRejectedValue(new Error("Aplique a migration 0081_commerce_analytics.sql"));
    render(<CommerceAnalytics/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("0081");
    expect(screen.queryByText("Recebido em pedidos")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(storeRequest).toHaveBeenCalledTimes(2));
  });
});
