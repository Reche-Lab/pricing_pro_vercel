import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceOrderWorkflow } from "@/components/commerce/CommerceOrderWorkflow";
import { storeRequest } from "@/components/commerce/store-http";
import type { OrderOlistProgress } from "@/domain/commerce/order-progress";
import type { OrderWorkspaceItem } from "@/domain/commerce/order-workflow";
import type { CommerceOlistJob } from "@/domain/commerce/olist";
import { OLIST_CONNECTED_EVENT } from "@/lib/olist/browser-request";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/commerce/store-http", async original => ({ ...await original<object>(), storeRequest: vi.fn() }));
vi.mock("@/components/olist/OlistReconnectBoundary", () => ({ OlistReconnectBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/shipping/MelhorEnvioReconnectBoundary", () => ({ MelhorEnvioReconnectBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const order = { id: "00000000-0000-4000-8000-000000000001", customer_name: "Cliente teste", payment_status: "paid", payment_environment: "production", fulfillment_status: "production", provider: "manual", required_artworks: 1, prepared_artworks: 1, approved_artworks: 1, total_cents: 15000, item_count: 2 } as OrderWorkspaceItem;
const initial: OrderOlistProgress = { configured: true, enabled: true, autoInvoice: true, autoDispatch: true,
  job: { status: "waiting", customer_id: "11", sales_order_id: "22", production_completed_at: null, invoice_status: null } as CommerceOlistJob };
const shipping = { shipping: null, readiness: { eligible: true, reason: null }, contracted: { name: "SEDEX", priceCents: 2500 }, fiscal: { invoiceKey: null, senderStateRegister: null, productionReady: true, productionSource: "olist" }, notifications: { pending: 0, failed: 0 } };
function show(options: { fact?: OrderWorkspaceItem; olist?: OrderOlistProgress; melhorEnvio?: boolean; pickup?: boolean; canManage?: boolean } = {}) {
  return render(<CommerceOrderWorkflow order={options.fact ?? order} initialOlist={options.olist ?? initial} melhorEnvio={options.melhorEnvio ?? false} pickup={options.pickup ?? false} canManage={options.canManage ?? true} shippingBlockedReason={null} summary={<h2>Resumo da compra</h2>}><section><h2>Itens e artes</h2></section></CommerceOrderWorkflow>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(storeRequest).mockResolvedValue(initial);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(shipping)));
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function() { this.setAttribute("open", ""); } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("unified staff order journey", () => {
  it("places the production completion action in the guidance band, preserving its fiscal confirmation", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: "Confira a embalagem." }, { status: 409 }));
    show();
    const band = screen.getByRole("region", { name: "Andamento e próxima ação do pedido" });
    const action = await within(band).findByRole("button", { name: "Concluir produção e liberar NF-e" });
    expect(screen.queryByRole("button", { name: "Concluir produção", exact: true })).not.toBeInTheDocument();
    fireEvent.click(action);
    const modal = screen.getByRole("dialog", { name: "Concluir produção e liberar faturamento" });
    expect(within(modal).getByRole("button", { name: "Confirmar" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(within(modal).getByLabelText("Observação"), { target: { value: "Produtos e caixa conferidos" } });
    fireEvent.submit(within(modal).getByLabelText("Observação").closest("form")!);
    expect(await within(modal).findByRole("alert")).toHaveTextContent("Confira a embalagem");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows only the current production action and keeps ERP details collapsed", async () => {
    show({ fact: { ...order, fulfillment_status: "received" } });
    const band = screen.getByRole("region", { name: "Andamento e próxima ação do pedido" });
    expect(within(band).getByRole("button", { name: "Iniciar produção" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conferir e retomar" })).not.toBeInTheDocument();
    expect((await screen.findByText("Integrações e detalhes · Olist")).closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("link", { name: "Baixar PDF de produção" })).toBeInTheDocument();
  });

  it("waits without offering another invoice while fiscal authorization is pending", async () => {
    const pending = { ...initial, job: { ...initial.job!, status: "pending" as const, production_completed_at: "now", invoice_id: "33", authorization_requested_at: "now" } };
    vi.mocked(storeRequest).mockResolvedValue(pending);
    show({ olist: pending });
    expect(screen.getByRole("heading", { name: "Aguardando autorização da NF-e" })).toBeInTheDocument();
    const band = screen.getByRole("region", { name: "Andamento e próxima ação do pedido" });
    expect(within(band).queryByRole("button")).not.toBeInTheDocument();
    expect(within(band).getByRole("status")).toHaveTextContent("Aguardando confirmação");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the shared production confirmation and does not render a second completion checkbox", async () => {
    const authorized = { ...initial, job: { ...initial.job!, production_completed_at: "now", invoice_id: "33", invoice_status: 6, expedition_id: "44" } };
    vi.mocked(storeRequest).mockResolvedValue(authorized);
    show({ olist: authorized, melhorEnvio: true });
    const band = screen.getByRole("region", { name: "Andamento e próxima ação do pedido" });
    expect(await within(band).findByRole("button", { name: "Revisar envio" })).toBeEnabled();
    expect(screen.queryByRole("checkbox", { name: /A produção está concluída/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Documento fiscal e produção"));
    expect(screen.getByText(/Confirmação reaproveitada para o envio/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar etiqueta" })).not.toBeInTheDocument();
  });

  it("requires a separate confirmation before buying a label, never charging again for the customer order", async () => {
    const authorized = { ...initial, job: { ...initial.job!, production_completed_at: "now", invoice_status: 6, expedition_id: "44" } };
    vi.mocked(storeRequest).mockResolvedValue(authorized);
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...shipping, shipping: { id: "s", status: "cart", purchase_cents: 2500, parcels: [] } }));
    show({ olist: authorized, melhorEnvio: true });
    fireEvent.click(await screen.findByRole("button", { name: "Comprar etiqueta de envio" }));
    const modal = screen.getByRole("dialog", { name: "Confirmar cobrança da etiqueta" });
    expect(within(modal).getByText(/compra real/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]).not.toHaveProperty("method", "POST");
  });

  it("offers a read-only retry instead of a permanently loading banner when shipping cannot be loaded", async () => {
    const authorized = { ...initial, job: { ...initial.job!, production_completed_at: "now", invoice_status: 6, expedition_id: "44" } };
    vi.mocked(storeRequest).mockResolvedValue(authorized);
    vi.mocked(fetch).mockRejectedValue(new TypeError("Offline"));
    show({ olist: authorized, melhorEnvio: true });
    expect(await screen.findByRole("heading", { name: "Não foi possível consultar o envio" })).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Consultar envio novamente" });
    vi.mocked(fetch).mockResolvedValue(Response.json(shipping));
    fireEvent.click(retry);
    expect(await screen.findByRole("button", { name: "Revisar envio" })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.every(([, input]) => input?.method !== "POST")).toBe(true);
  });

  it("keeps operations unavailable for a reader, and does not require ERP for manual pickup", async () => {
    show({ canManage: false });
    await waitFor(() => expect(storeRequest).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Concluir produção/ })).not.toBeInTheDocument();
    cleanup(); vi.mocked(storeRequest).mockClear();
    show({ olist: { ...initial, configured: false, enabled: false, job: null }, pickup: true });
    expect(screen.getByRole("button", { name: "Confirmar retirada" })).toBeInTheDocument();
    expect(screen.queryByText("Integrações e detalhes · Olist")).not.toBeInTheDocument();
    expect(storeRequest).not.toHaveBeenCalled();
  });

  it("offers resume rather than another OAuth loop after reconnection, without resubmitting anything", async () => {
    const blocked = { ...initial, job: { ...initial.job!, status: "blocked" as const, error_code: "olist_oauth_invalid", debug_id: "last-attempt", last_error: "Reconecte o Olist." } };
    vi.mocked(storeRequest).mockResolvedValue(blocked);
    show({ olist: blocked });
    const band = screen.getByRole("region", { name: "Andamento e próxima ação do pedido" });
    expect(await within(band).findByRole("button", { name: "Reconectar Olist" })).toBeInTheDocument();
    fireEvent(window, new Event(OLIST_CONNECTED_EVENT));
    expect(await within(band).findByRole("button", { name: "Conferir e retomar" })).toBeInTheDocument();
    expect(within(band).getByRole("heading", { name: "Conexão restabelecida" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(blocked.job.error_code).toBe("olist_oauth_invalid");
  });
});
