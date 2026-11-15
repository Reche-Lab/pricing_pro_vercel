import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreBuyerQuoteList } from "@/components/commerce/StoreBuyerQuoteList";

const quotes = [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", created_at: "2026-11-14T12:00:00Z", valid_until: "2026-11-20T12:00:00Z", total_cents: 25000, shipping_cents: 2000 },
  { id: "bbbbbbbb-0000-4000-8000-000000000002", created_at: "2026-11-01T12:00:00Z", valid_until: "2026-11-10T12:00:00Z", total_cents: 50000, shipping_cents: null },
  { id: "cccccccc-0000-4000-8000-000000000003", created_at: "2026-11-12T12:00:00Z", valid_until: "2026-11-21T12:00:00Z", total_cents: 10000, shipping_cents: 0 },
];
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-15T12:00:00Z")));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function show() { render(<StoreBuyerQuoteList quotes={quotes} api="/api/store/test" base="/loja/test"/>); }
describe("my quotes list", () => {
  it("presents independent quote cards with real totals, validity and private PDF links", () => {
    show();
    const cards = screen.getAllByRole("article");
    expect(cards.map(card => within(card).getByRole("heading").textContent)).toEqual(["Orçamento AAAAAAAA", "Orçamento CCCCCCCC", "Orçamento BBBBBBBB"]);
    expect(within(cards[0]).getByText("Dentro da validade")).toBeInTheDocument();
    expect(within(cards[2]).getByText("Valores a conferir")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Frete/retirada sem custo")).toBeInTheDocument();
    expect(within(cards[2]).getByText("Frete não incluído")).toBeInTheDocument();
    expect(within(cards[0]).getByRole("link", { name: "Abrir orçamento AAAAAAAA" })).toHaveAttribute("href", "/loja/test/orcamentos/aaaaaaaa-0000-4000-8000-000000000001");
    expect(within(cards[0]).getByRole("link", { name: "Baixar PDF do orçamento AAAAAAAA" })).toHaveAttribute("href", "/api/store/test/quotes/aaaaaaaa-0000-4000-8000-000000000001/pdf");
    expect(cards[0].querySelector("a a")).toBeNull();
  });
  it("filters by code or date and sorts without mutating the original list", () => {
    show();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar orçamento" }), { target: { value: "#BBBB" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "14/11/2026" } });
    expect(screen.getByRole("heading", { name: "Orçamento AAAAAAAA" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Validade"), { target: { value: "review" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Validade"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "highest" } });
    expect(within(screen.getAllByRole("article")[0]).getByRole("heading")).toHaveTextContent("BBBBBBBB");
    expect(quotes[0].id).toMatch(/^aaaaaaaa/);
  });
  it("distinguishes an empty account from a search with no matches and resets filters", () => {
    const view = render(<StoreBuyerQuoteList quotes={[]} api="/api/store/test" base=""/>);
    expect(screen.getByRole("link", { name: "Montar meu primeiro orçamento" })).toHaveAttribute("href", "/orcamento");
    view.rerender(<StoreBuyerQuoteList quotes={quotes} api="/api/store/test" base=""/>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "não existe" } });
    expect(screen.getByText("Nenhum orçamento corresponde à busca.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
  it("does not show fake empty-state information while loading", () => {
    render(<StoreBuyerQuoteList quotes={[]} loading api="/api/store/test" base=""/>);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando seus orçamentos");
    expect(screen.queryByRole("link", { name: "Montar meu primeiro orçamento" })).not.toBeInTheDocument();
  });
});
