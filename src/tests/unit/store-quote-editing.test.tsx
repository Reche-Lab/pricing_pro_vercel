import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreQuoteOverview } from "@/components/commerce/StoreQuoteOverview";
import { StoreBuyerQuotes } from "@/components/commerce/StoreBuyerQuotes";
import { StoreQuoteQuantity } from "@/components/commerce/StoreQuoteQuantity";
import { storeRequest } from "@/components/commerce/store-http";
import { quoteCart, quoteProduct, savedBuyerQuote } from "../fixtures/commerce-quote";
import type { CartLine } from "@/domain/commerce/schemas";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/commerce/store-http", async original => ({ ...await original<typeof import("@/components/commerce/store-http")>(), storeRequest: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function() { this.setAttribute("open", ""); } }); Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function() { this.removeAttribute("open"); } }); });
afterEach(cleanup);
describe("quote editing journey", () => {
  it("retries a failed list query without showing an empty account or making changes", async () => {
    vi.mocked(storeRequest).mockRejectedValueOnce(new Error("Não foi possível carregar seus orçamentos."))
      .mockResolvedValueOnce({ quotes: [savedBuyerQuote] });
    render(<StoreBuyerQuotes api="/api/store/test" base="/loja/test" revision={7} hasCart={false} onRestored={vi.fn()}/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(screen.queryByText("Seu próximo projeto começa aqui")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("link", { name: /Abrir orçamento/ })).toHaveAttribute("href", `/loja/test/orcamentos/${savedBuyerQuote.id}`);
    expect(storeRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(storeRequest).mock.calls.every(args => args.length === 1 && args[0] === "/api/store/test/quotes")).toBe(true);
  });
  it("edits quantities inline, preserves groups, and restores a removed item", async () => {
    const updated = vi.fn();
    function Fixture() { const [cart, setCart] = useState(quoteCart); return <StoreQuoteOverview cart={cart} products={[quoteProduct]} base="/loja/test" storeName="Loja" busy={false} onUpdate={async lines => { updated(lines); setCart({ ...cart, lines }); }}/>; }
    render(<Fixture/>);
    const input = screen.getByRole("textbox", { name: /Quantidade de Botton/ });
    fireEvent.change(input, { target: { value: "50" } }); fireEvent.blur(input);
    await waitFor(() => expect(updated).toHaveBeenCalledWith([{ ...quoteCart.lines[0], quantity: 50 }]));
    expect(screen.queryByRole("link", { name: /Editar quantidades e artes/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Remover Botton/ }));
    await screen.findByText("Vamos começar pelos produtos?");
    fireEvent.click(screen.getByRole("button", { name: "Desfazer remoção" }));
    await screen.findByRole("textbox", { name: /Quantidade de Botton/ });
    expect(updated).toHaveBeenLastCalledWith([{ ...quoteCart.lines[0], quantity: 50 }]);
  });
  it("allows clearing quantity while typing, then refuses invalid or unsaved values", async () => {
    const commit = vi.fn(async () => false);
    render(<StoreQuoteQuantity value={30} label="Botton" disabled={false} onCommit={commit}/>);
    const input = screen.getByRole("textbox"); fireEvent.change(input, { target: { value: "" } }); expect(input).toHaveValue(""); fireEvent.blur(input);
    expect(await screen.findByRole("alert")).toHaveTextContent("maior que zero"); expect(commit).not.toHaveBeenCalled(); expect(input).toHaveValue("30");
    fireEvent.change(input, { target: { value: "50" } }); fireEvent.blur(input);
    await waitFor(() => expect(commit).toHaveBeenCalledWith(50)); await waitFor(() => expect(input).toHaveValue("30"));
  });
  it("searches and selects products in place without navigating away from the quote", async () => {
    const update = vi.fn<(lines: CartLine[]) => Promise<void>>(async () => {});
    render(<StoreQuoteOverview cart={quoteCart} products={[quoteProduct]} base="/loja/test" storeName="Loja" busy={false} onUpdate={update}/>);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar produtos ao orçamento" }));
    const dialog = screen.getByRole("dialog", { name: "Adicionar produtos ao orçamento" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Buscar produto" }), { target: { value: "botton" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Botton - 3,5 cm/ }));
    fireEvent.change(within(dialog).getByLabelText("Quantidade de produtos"), { target: { value: "20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar ao orçamento" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toHaveLength(2); expect(update.mock.calls[0][0][0]).toEqual(quoteCart.lines[0]);
  });
  it("edits a copy with explicit replacement consent, leaving the original PDF link unchanged", async () => {
    vi.mocked(storeRequest).mockImplementation(async (_url, method) => method === "POST" ? { ok: true } : { quote: savedBuyerQuote });
    const restored = vi.fn(async () => {});
    render(<StoreBuyerQuotes api="/api/store/test" base="/loja/test" quoteId={savedBuyerQuote.id} revision={7} hasCart onRestored={restored}/>);
    const pdf = await screen.findByRole("link", { name: "Baixar orçamento PDF" }); expect(pdf).toHaveAttribute("href", `/api/store/test/quotes/${savedBuyerQuote.id}/pdf`);
    expect(screen.getByText("Valores a conferir")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar uma cópia" }));
    const dialog = screen.getByRole("dialog", { name: "Editar uma cópia do orçamento" });
    expect(within(dialog).getByRole("button", { name: "Abrir cópia para editar" })).toBeDisabled();
    expect(storeRequest).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("checkbox")); fireEvent.click(within(dialog).getByRole("button", { name: "Abrir cópia para editar" }));
    await waitFor(() => expect(restored).toHaveBeenCalledWith("quote"));
    expect(storeRequest).toHaveBeenLastCalledWith(`/api/store/test/quotes/${savedBuyerQuote.id}`, "POST", { revision: 7, confirmReplace: true });
    expect(push).toHaveBeenCalledWith("/loja/test/orcamento"); expect(savedBuyerQuote.snapshot.lines).toEqual(quoteCart.lines);
  });
  it("keeps restore errors inside the confirmation modal and never starts a payment", async () => {
    vi.mocked(storeRequest).mockImplementation(async (_url, method) => { if (method === "POST") throw new Error("O carrinho mudou."); return { quote: savedBuyerQuote }; });
    render(<StoreBuyerQuotes api="/api/store/test" base="" quoteId={savedBuyerQuote.id} revision={7} hasCart={false} onRestored={vi.fn()}/>);
    fireEvent.click(await screen.findByRole("button", { name: "Continuar compra com estes produtos" }));
    const dialog = screen.getByRole("dialog", { name: "Revisar para continuar a compra" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Abrir carrinho para revisar" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("O carrinho mudou."); expect(push).not.toHaveBeenCalled();
  });
});
