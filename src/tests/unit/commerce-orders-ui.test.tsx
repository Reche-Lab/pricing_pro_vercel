import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceOrderProduction } from "@/components/commerce/CommerceOrderProduction";
import { CommerceOrderAlerts, CommerceOrderSeen } from "@/components/commerce/CommerceOrderAlerts";
import { CommerceOrdersWorkspace } from "@/components/commerce/CommerceOrdersWorkspace";
import { storeRequest } from "@/components/commerce/store-http";
import type { OrderWorkspaceItem } from "@/domain/commerce/order-workflow";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn(), storeMoney: (c: number) => `R$ ${(c / 100).toFixed(2)}` }));
const order: OrderWorkspaceItem = { id: "11111111-1111-4111-8111-111111111111", payment_status: "paid", fulfillment_status: "received", required_artworks: 2, prepared_artworks: 2, approved_artworks: 2, provider: "manual", total_cents: 10000, customer_name: "Cliente teste", created_at: "2026-11-06T10:00:00Z", activity_at: "2026-11-06T12:00:00Z", unread: true, item_count: 2 };
const workspace = { orders: [order], total: 1, page: 1, pageSize: 20, summary: { total: 1, unread: 1, payment: 0, preparation: 0, approval: 0, ready: 1, production: 0 } };
beforeEach(() => {
  vi.stubGlobal("React", React);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async url => new Response(JSON.stringify(url === "/api/me" ? { commerce: { read: true } } : workspace), { headers: { "content-type": "application/json" } })));
});
afterEach(() => { cleanup(); Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal"); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("staff purchase and production UX", () => {
  it("provides print controls to read-only users without payment or workflow buttons", () => {
    render(<CommerceOrderProduction order={order} canManage={false} />);
    expect(screen.getByRole("link", { name: "Baixar PDF de produção" })).toHaveAttribute("href", expect.stringContaining("cutLines=1"));
    fireEvent.click(screen.getByLabelText("Incluir linhas de corte no PDF"));
    expect(screen.getByRole("link", { name: "Visualizar folhas A4" })).toHaveAttribute("href", expect.stringContaining("cutLines=0"));
    expect(screen.queryByRole("button", { name: "Iniciar produção" })).not.toBeInTheDocument();
  });
  it("withholds print and production until every artwork is approved", () => {
    render(<CommerceOrderProduction order={{ ...order, approved_artworks: 1 }} canManage />);
    expect(screen.queryByRole("link", { name: "Baixar PDF de produção" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar produção" })).toBeDisabled();
    expect(screen.getByText("1 de 2 artes aprovadas pelo cliente")).toBeInTheDocument();
  });
  it("keeps a failed workflow action visible in its confirmation modal", async () => {
    vi.mocked(storeRequest).mockRejectedValue(new Error("A arte foi alterada. Aguarde nova aprovação."));
    render(<CommerceOrderProduction order={order} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar produção" }));
    fireEvent.change(screen.getByLabelText("Observação"), { target: { value: "Conferido pela equipe" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("A arte foi alterada."));
    expect(refresh).not.toHaveBeenCalled();
  });
  it("shows purchase updates with direct navigation and supports closing with Escape", async () => {
    render(<CommerceOrderAlerts />);
    const button = await screen.findByRole("button", { name: "Alertas da loja: 1 atualização não vista" });
    fireEvent.click(button);
    expect(screen.getByRole("link", { name: /Compra #11111111/ })).toHaveAttribute("href", `/commerce/orders/${order.id}`);
    expect(screen.getByText("Pronto para produção")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
  it("hides alerts for tenants without access instead of querying private orders", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ commerce: { read: false } })));
    render(<CommerceOrderAlerts />);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: /Alertas da loja/ })).not.toBeInTheDocument();
  });
  it("marks only the displayed revision as seen and exposes failures without blocking production", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 503 }));
    render(<CommerceOrderSeen orderId={order.id} seenThrough={order.activity_at} />);
    await screen.findByText(/Não foi possível marcar este aviso como visto/);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/${order.id}/seen`), expect.objectContaining({ method: "POST", body: JSON.stringify({ seenThrough: order.activity_at }) }));
  });
  it("keeps production filters and order navigation discoverable", () => {
    render(<CommerceOrdersWorkspace data={workspace} filter="ready" />);
    expect(screen.getByRole("link", { name: "Prontos para produção" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Abrir pedido" })).toHaveAttribute("href", `/commerce/orders/${order.id}`);
    expect(screen.getByText(/2\/2 artes aprovadas/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir pedido #11111111" })).not.toBeInTheDocument();
  });
  it("offers deletion only when administrative access was granted by the server", () => {
    render(<CommerceOrdersWorkspace data={workspace} filter="ready" canDelete />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir pedido #11111111" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("EXCLUIR 11111111");
    expect(screen.getByRole("button", { name: "Excluir da gestão" })).toBeDisabled();
  });
});
