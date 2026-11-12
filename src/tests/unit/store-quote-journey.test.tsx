import React from "react";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useQuoteJourney } from "@/components/commerce/use-quote-journey";
import { StoreQuoteJourney } from "@/components/commerce/StoreQuoteJourney";
import { StoreQuoteArtworkBenefit } from "@/components/commerce/StoreQuoteArtworkBenefit";

afterEach(() => { cleanup(); localStorage.clear(); });
describe("persistent quote journey", () => {
  it("keeps quote intent across product navigation/reloads, isolates tenants and exits explicitly", () => {
    const { result, rerender, unmount } = renderHook(({ api, view }) => useQuoteJourney(api, view, false), { initialProps: { api: "/api/store/one", view: "orcamento" } });
    expect(result.current.quoting).toBe(true);
    rerender({ api: "/api/store/one", view: "produto" }); expect(result.current.quoting).toBe(true);
    expect(Object.entries(localStorage)).toEqual([["commerce-quote-mode:/api/store/one", "quote"]]);
    unmount();
    const resumed = renderHook(() => useQuoteJourney("/api/store/one", "catalogo", false));
    expect(resumed.result.current.quoting).toBe(true);
    const other = renderHook(() => useQuoteJourney("/api/store/two", "catalogo", false));
    expect(other.result.current.quoting).toBe(false);
    act(() => resumed.result.current.setQuoteMode(false)); expect(resumed.result.current.quoting).toBe(false);
    expect(Object.entries(localStorage)).toEqual([]);
  });
  it("does not carry quote mode into checkout or private previews", () => {
    const { result, rerender } = renderHook(({ view }) => useQuoteJourney("/api/store/one", view, false), { initialProps: { view: "orcamento" } });
    rerender({ view: "checkout" }); expect(result.current.quoting).toBe(false);
    const preview = renderHook(() => useQuoteJourney("/api/commerce/one/preview", "orcamento", true));
    expect(preview.result.current.quoting).toBe(false);
    expect(localStorage.getItem("commerce-quote-mode:/api/commerce/one/preview")).toBeNull();
  });
  it("identifies the current step, draft privacy and resume action without implying an order", () => {
    render(<StoreQuoteJourney base="/loja/shop" step={2} count={3} totalCents={12000} identified={false} onPurchase={() => {}}/>);
    expect(screen.getByText("Dados e entrega")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/Rascunho neste dispositivo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver meu orçamento/ })).toHaveAttribute("href", "/loja/shop/orcamento");
  });
  it("shows a conditional, capped, tenant-specific benefit without changing totals", () => {
    render(<StoreQuoteArtworkBenefit storeName="Ground Shop" benefits={[{ productId: "product", name: "Botton", percent: 15, limitPerArtworkCents: 500, artworkGroups: 1, additionalDiscountCents: 300 }]}/>);
    expect(screen.getByText(/até 15% de desconto adicional/)).toHaveTextContent(/5,00 por arte\/grupo/);
    expect(screen.getByText(/especificações da equipe da Ground Shop/)).toBeInTheDocument();
    expect(screen.getByText(/ainda não descontado do total/)).toBeInTheDocument();
  });
});
