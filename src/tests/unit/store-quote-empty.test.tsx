import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreQuoteOverview } from "@/components/commerce/StoreQuoteOverview";
import { quoteCart, quoteProduct } from "../fixtures/commerce-quote";

const emptyCart: typeof quoteCart = { ...quoteCart, lines: [], calculation: { ...quoteCart.calculation!, items: [], totalCents: 0 } };
const products = [
  { ...quoteProduct, minQuantity: 10 },
  { ...quoteProduct, id: "00000000-0000-4000-8000-000000000010", name: "Botton - 2,5 cm" },
  ...["Espelho", "Ímã", "Abridor"].map((name, index) => ({
    ...quoteProduct, id: `00000000-0000-4000-8000-00000000002${index}`, name, category: `${name}s`,
  })),
];
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function() { this.removeAttribute("open"); } });
});
afterEach(cleanup);

describe("empty quote workspace", () => {
  it("has one clear primary action, real products with category variety and no empty totals", () => {
    render(<StoreQuoteOverview cart={emptyCart} products={products} base="/loja/test" storeName="Loja" busy={false} onUpdate={vi.fn()}/>);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Sua próxima ideia começa aqui." })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Escolher produtos" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Adicionar produtos ao orçamento" })).not.toBeInTheDocument();
    const suggestions = screen.getByRole("list", { name: "Sugestões para começar seu orçamento" });
    expect(within(suggestions).getAllByRole("button")).toHaveLength(4);
    expect(within(suggestions).queryByRole("button", { name: "Orçar Botton - 2,5 cm" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meus orçamentos" })).toHaveAttribute("href", "/loja/test/orcamentos");
    expect(screen.queryByRole("complementary", { name: "Resumo do orçamento" })).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it("opens quantity and group selection for the chosen product without adding anything yet", () => {
    const update = vi.fn();
    render(<StoreQuoteOverview cart={emptyCart} products={products} base="" storeName="Loja" busy={false} onUpdate={update}/>);
    fireEvent.click(screen.getByRole("button", { name: "Orçar Botton - 3,5 cm" }));
    const dialog = screen.getByRole("dialog", { name: "Adicionar produtos ao orçamento" });
    expect(within(dialog).getByLabelText("Quantidade de produtos")).toHaveValue("10");
    expect(within(dialog).getByLabelText("Quantidade de artes / grupos")).toHaveValue("1");
    expect(within(dialog).getByRole("button", { name: /Botton - 3,5 cm/ })).toHaveAttribute("aria-pressed", "true");
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar janela" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Escolher produtos" }));
    expect(screen.queryByLabelText("Quantidade de produtos")).not.toBeInTheDocument();
  });

  it("transitions to the real quote after confirmed inclusion, preserving its existing controls", async () => {
    const update = vi.fn();
    function Fixture() {
      const [cart, setCart] = useState(emptyCart);
      return <StoreQuoteOverview cart={cart} products={products} base="/loja/test" storeName="Loja" busy={false} onUpdate={async lines => {
        update(lines);
        setCart({ ...cart, lines });
      }}/>;
    }
    render(<Fixture/>);
    fireEvent.click(screen.getByRole("button", { name: "Orçar Botton - 3,5 cm" }));
    const dialog = screen.getByRole("dialog", { name: "Adicionar produtos ao orçamento" });
    fireEvent.change(within(dialog).getByLabelText("Quantidade de produtos"), { target: { value: "20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar ao orçamento" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toEqual([expect.objectContaining({ productId: quoteProduct.id, quantity: 20, artworkId: null })]);
    expect(screen.getByRole("button", { name: "Adicionar produtos ao orçamento" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continuar para dados e entrega" })).toHaveAttribute("href", "/loja/test/orcamento?etapa=dados");
    expect(screen.queryByRole("heading", { name: "Sua próxima ideia começa aqui." })).not.toBeInTheDocument();
  });

  it("keeps failures in the picker and does not pretend a product was added", async () => {
    render(<StoreQuoteOverview cart={emptyCart} products={products} base="" storeName="Loja" busy={false} onUpdate={async () => { throw new Error("Não foi possível salvar. Tente novamente."); }}/>);
    fireEvent.click(screen.getByRole("button", { name: "Orçar Botton - 3,5 cm" }));
    const dialog = screen.getByRole("dialog", { name: "Adicionar produtos ao orçamento" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar ao orçamento" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Não foi possível salvar");
    expect(screen.getByRole("heading", { name: "Sua próxima ideia começa aqui." })).toBeInTheDocument();
  });

  it("disables starting actions during updates and handles guest or unavailable catalogs honestly", () => {
    const { rerender } = render(<StoreQuoteOverview cart={emptyCart} products={products} base="" storeName="Loja" busy onUpdate={vi.fn()}/>);
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    rerender(<StoreQuoteOverview cart={{ ...emptyCart, customer: null }} products={[]} base="" storeName="Loja" busy={false} onUpdate={vi.fn()}/>);
    expect(screen.getByRole("heading", { name: "Novas ideias estão a caminho." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher produtos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Meus orçamentos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Sugestões para começar seu orçamento" })).not.toBeInTheDocument();
  });
});
