import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreBuyerOrders } from "@/components/commerce/StoreBuyerOrders";
import { storeRequest } from "@/components/commerce/store-http";
import { buyerOrder } from "../fixtures/commerce-buyer-order";
vi.mock("@/components/commerce/store-http", async original => ({ ...await original<typeof import("@/components/commerce/store-http")>(), storeRequest: vi.fn() }));
vi.mock("@/components/commerce/CommerceOrderArtworks", () => ({ CommerceOrderArtworks: ({ endpoint }: { endpoint: string }) => <section aria-label="Minhas artes" data-endpoint={endpoint}/> }));
vi.mock("next/dynamic", () => ({ default: () => () => <section aria-label="Pagamento seguro simulado"/> }));
const pending = { ...buyerOrder, id: "bbbbbbbb-0000-4000-8000-000000000001", payment_status: "pending", fulfillment_status: "received", total_cents: 21000, created_at: "2026-11-12T12:00:00Z" };
beforeEach(() => vi.mocked(storeRequest).mockReset());
afterEach(cleanup);
const props = { api: "/api/store/shop", base: "/loja/shop", buyerId: "buyer", instructions: "Faça o pagamento combinado com a loja.", products: [] };
describe("buyer purchases and order detail", () => {
  it("lists real totals and separate payment/production states, with filters and private detail links", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ orders: [buyerOrder, pending] });
    render(<StoreBuyerOrders {...props}/>);
    expect(screen.queryByText("Nenhum pedido por aqui ainda")).not.toBeInTheDocument();
    const cards = await screen.findAllByRole("article"); expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole("link", { name: "Abrir pedido BBBBBBBB" })).toHaveAttribute("href", "/loja/shop/pedidos/" + pending.id);
    fireEvent.change(screen.getByRole("combobox", { name: "Pagamento" }), { target: { value: "paid" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Em produção")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "não existe" } });
    expect(screen.getByText("Nenhum pedido corresponde à busca")).toBeInTheDocument();
    expect(vi.mocked(storeRequest).mock.calls.every(args => args.length === 1)).toBe(true);
  });
  it("shows a clear saved-order overview without mounting payment controls for a paid order", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ orders: [buyerOrder] });
    render(<StoreBuyerOrders {...props} orderId={buyerOrder.id}/>);
    await screen.findByRole("heading", { name: "Seu pedido" });
    expect(screen.getByRole("region", { name: "Andamento do pedido" })).toHaveTextContent("Produção");
    expect(screen.queryByRole("region", { name: "Pagamento seguro simulado" })).not.toBeInTheDocument();
    expect(screen.getByText("Dados de faturamento e recebimento").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "Baixar condições aceitas" })).toHaveAttribute("href", `${props.api}/orders/${buyerOrder.id}/conditions`);
    expect(screen.getByRole("link", { name: "Voltar aos meus pedidos" })).toHaveAttribute("href", "/loja/shop/pedidos");
  });
  it("keeps test orders and refunded orders distinct from a real production timeline", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ orders: [{ ...buyerOrder, payment_environment: "test" }] });
    const view = render(<StoreBuyerOrders {...props} orderId={buyerOrder.id}/>);
    await screen.findByText(/Pedido de teste · sem produção ou envio/);
    expect(screen.queryByRole("region", { name: "Andamento do pedido" })).not.toBeInTheDocument();
    view.unmount(); vi.mocked(storeRequest).mockResolvedValue({ orders: [{ ...buyerOrder, payment_status: "refunded" }] });
    render(<StoreBuyerOrders {...props} orderId={buyerOrder.id}/>);
    await screen.findByText("Pagamento estornado", { selector: "span" });
    expect(screen.queryByRole("region", { name: "Andamento do pedido" })).not.toBeInTheDocument();
  });
  it("only mounts the established payment flow for a pending Mercado Pago order", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ orders: [{ ...pending, provider: "mercado_pago" }] });
    render(<StoreBuyerOrders {...props} orderId={pending.id}/>);
    expect(await screen.findByRole("region", { name: "Pagamento seguro simulado" })).toBeInTheDocument();
    expect(storeRequest).toHaveBeenCalledTimes(1);
    expect(storeRequest).toHaveBeenCalledWith("/api/store/shop/orders");
  });
  it("retries failures and only declares a missing order after a successful private lookup", async () => {
    vi.mocked(storeRequest).mockRejectedValueOnce(new Error("Falha de conexão"));
    render(<StoreBuyerOrders {...props} orderId={buyerOrder.id}/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha de conexão");
    expect(screen.queryByText("Pedido não encontrado nesta conta")).not.toBeInTheDocument();
    vi.mocked(storeRequest).mockResolvedValueOnce({ orders: [] }); fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Pedido não encontrado nesta conta")).toBeInTheDocument();
  });
  it("discards late results from a different signed-in buyer", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(storeRequest).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ orders: [] });
    const view = render(<StoreBuyerOrders {...props}/>);
    view.rerender(<StoreBuyerOrders {...props} buyerId="other"/>);
    await screen.findByText("Nenhum pedido por aqui ainda");
    await act(async () => finish({ orders: [buyerOrder] }));
    await waitFor(() => expect(screen.queryByRole("article")).not.toBeInTheDocument());
  });
});
