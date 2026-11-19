import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreCartControls } from "@/components/commerce/StoreCartControls";
import { storeRequest } from "@/components/commerce/store-http";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn() }));
const props = { api: "/api/store/shop", base: "/loja/shop", revision: 3, orderId: "order", onChanged: vi.fn(async () => {}) };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(storeRequest).mockResolvedValue({ ok: true }); });
afterEach(cleanup);
describe("pending cart controls", () => {
  it("asks for confirmation before cancelling and reopening the saved purchase", async () => {
    render(<StoreCartControls {...props}/>); fireEvent.click(screen.getByRole("button", { name: "Editar itens" }));
    expect(storeRequest).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Editar os itens da compra" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Liberar itens para edição" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/loja/shop/carrinho"));
    expect(storeRequest).toHaveBeenCalledWith("/api/store/shop/orders/order/cart", "POST", { action: "edit", revision: 3, confirm: true, confirmReplace: false });
  });
  it("keeps provider errors inside the modal without navigating or losing the cart", async () => {
    vi.mocked(storeRequest).mockRejectedValue(new Error("Pagamento ainda em processamento"));
    render(<StoreCartControls {...props}/>); fireEvent.click(screen.getByRole("button", { name: "Limpar carrinho" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar limpeza" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pagamento ainda em processamento");
    expect(push).not.toHaveBeenCalled(); expect(props.onChanged).not.toHaveBeenCalled();
  });
  it("opens the saved quote only after a successful conversion", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ ok: true, quoteId: "quote" });
    render(<StoreCartControls {...props}/>); fireEvent.click(screen.getByRole("button", { name: "Salvar como orçamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar orçamento e encerrar compra" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/loja/shop/orcamentos/quote"));
  });
  it("clears a normal cart using its revision without creating an order", async () => {
    render(<StoreCartControls {...props} orderId={undefined}/>); fireEvent.click(screen.getByRole("button", { name: "Limpar carrinho" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar limpeza" }));
    await waitFor(() => expect(storeRequest).toHaveBeenCalledWith("/api/store/shop/cart", "PUT", { revision: 3, lines: [], intent: "purchase" }));
  });
});
