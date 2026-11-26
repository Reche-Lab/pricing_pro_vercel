import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CommerceOrderOlist } from "@/components/commerce/CommerceOrderOlist";
import { CommerceOlistSettings } from "@/components/commerce/CommerceOlistSettings";
import { commerceOlistSettingsSchema } from "@/domain/commerce/olist";
import { storeRequest } from "@/components/commerce/store-http";
import { CommerceOlistCustomerReview } from "@/components/commerce/CommerceOlistCustomerReview";
import { OLIST_RECONNECT_EVENT } from "@/lib/olist/browser-request";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn() }));
vi.mock("@/components/olist/OlistReconnectBoundary", () => ({ OlistReconnectBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const state = { configured: true, enabled: true, autoInvoice: true, autoDispatch: true, job: { status: "waiting", customer_id: "11", sales_order_id: "22", invoice_id: null, production_completed_at: null } };
beforeEach(() => { vi.mocked(storeRequest).mockResolvedValue(state); HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.setAttribute("open", ""); }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe("commerce Olist UI", () => {
  it("offers customer review and retry inside the guided details even when another step owns the main action", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ ...state, job: { ...state.job, status: "review", customer_id: null, sales_order_id: null, last_error: "Uma chamada anterior pode ter sido concluída.", error_code: "olist_review_required" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ customers: [], billingDocument: "52998224725" })));
    render(<CommerceOrderOlist orderId="test" canManage paid production guided={{ target: null, action: null }}/>);
    fireEvent.click(await screen.findByRole("button", { name: "Conferir cliente Olist" }));
    expect(await screen.findByRole("dialog", { name: "Conferir cliente Olist" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conferir e retomar" })).toBeInTheDocument();
  });
  it("requires an explicit choice and reason, disables inactive contacts and submits the selected ID only once", async () => {
    const customers = [{ id: "11", name: "Cadastro principal", document: "529.982.247-25", email: "buyer@example.test", phone: "11999999999", city: "São Paulo", state: "SP", inactive: false }, { id: "12", name: "Cadastro antigo", document: "529.982.247-25", inactive: true }];
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ customers, billingDocument: "52998224725" })).mockResolvedValueOnce(Response.json({ ...state, ok: true }));
    vi.stubGlobal("fetch", fetcher);
    const linked = vi.fn(); render(<CommerceOlistCustomerReview endpoint="/test/olist" onClose={vi.fn()} onLinked={linked}/>);
    const dialog = screen.getByRole("dialog", { name: "Conferir cliente Olist" });
    const radio = await within(dialog).findByRole("radio", { name: /Cadastro principal/ });
    expect(radio).not.toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Cadastro antigo/ })).toBeDisabled();
    const confirm = within(dialog).getByRole("button", { name: "Vincular cliente e continuar" });
    expect(confirm).toBeDisabled(); fireEvent.click(radio); expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Motivo da escolha"), { target: { value: "Cadastro correto confirmado" } });
    expect(confirm).toBeEnabled(); fireEvent.submit(radio.closest("form")!);
    await waitFor(() => expect(linked).toHaveBeenCalledWith(expect.objectContaining({ ok: true })));
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "customer_link", customerId: "11", note: "Cadastro correto confirmado" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("shows review errors within the modal and offers another query without inventing a contact", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Conexão temporariamente indisponível." }, { status: 503 })));
    render(<CommerceOlistCustomerReview endpoint="/test/olist" onClose={vi.fn()} onLinked={vi.fn()}/>);
    const error = await screen.findByRole("alert"); expect(error.closest("dialog")).toBeTruthy();
    expect(error).toHaveTextContent("Conexão temporariamente indisponível.");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar novamente" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Vincular cliente e continuar" })).toBeDisabled();
  });
  it("requests OAuth reconnection instead of leaving a failed contact selection open", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ reconnectRequired: true, code: "olist_oauth_invalid", error: "Reconecte o Olist." }, { status: 409 })));
    const close = vi.fn(), reconnect = vi.fn(); window.addEventListener(OLIST_RECONNECT_EVENT, reconnect);
    try {
      render(<CommerceOlistCustomerReview endpoint="/test/olist" onClose={close} onLinked={vi.fn()}/>);
      await waitFor(() => expect(close).toHaveBeenCalledOnce());
      expect(reconnect).toHaveBeenCalledOnce();
    } finally { window.removeEventListener(OLIST_RECONNECT_EVENT, reconnect); }
  });
  it("keeps customer recovery read-only without the manage permission", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ ...state, job: { ...state.job, status: "review", customer_id: null, sales_order_id: null, last_error: "Mais de um cadastro encontrado.", error_code: "olist_customer_ambiguous" } });
    render(<CommerceOrderOlist orderId="test" canManage={false} paid production guided={{ target: null, action: null }}/>);
    await screen.findByText("Mais de um cadastro encontrado.");
    expect(screen.queryByRole("button", { name: "Conferir cliente Olist" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conferir e retomar" })).not.toBeInTheDocument();
  });
  it("does not show Olist controls for an unconfigured tenant", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ ...state, configured: false });
    render(<CommerceOrderOlist orderId="test" canManage paid production/>);
    await waitFor(() => expect(storeRequest).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Integração do pedido com Olist" })).not.toBeInTheDocument();
  });
  it("requires a production completion reason and keeps API errors inside its modal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Confira as dimensões da caixa." }, { status: 409 })));
    render(<CommerceOrderOlist orderId="test" canManage paid production/>);
    fireEvent.click(await screen.findByRole("button", { name: "Concluir produção" }));
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Observação"), { target: { value: "Produção conferida" } });
    fireEvent.submit(screen.getByLabelText("Observação").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Confira as dimensões da caixa.");
    expect(screen.getByRole("alert").closest("dialog")).toBeTruthy();
  });
  it("does not offer administrative mutations to a reader or real operations for test orders", async () => {
    const view = render(<CommerceOrderOlist orderId="test" canManage={false} paid production/>);
    await screen.findByRole("region", { name: "Integração do pedido com Olist" });
    expect(screen.queryByRole("button", { name: "Concluir produção" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conferir e retomar" })).not.toBeInTheDocument();
    view.rerender(<CommerceOrderOlist orderId="test" canManage paid production test/>);
    expect(screen.getByText(/Pedido de teste:/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Concluir produção" })).not.toBeInTheDocument();
  });
  it("shows fiscal authorization, requested email and tracking without claiming delivery", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ ...state, job: { ...state.job, invoice_id: "33", invoice_status: 6, invoice_number: "7", invoice_link: "https://erp.tiny.com.br/doc", email_requested_at: "now", expedition_id: "44", tracking_code: "AB123BR" } });
    render(<CommerceOrderOlist orderId="test" canManage paid production/>);
    expect(await screen.findByRole("link", { name: "Abrir nota fiscal" })).toHaveAttribute("href", "https://erp.tiny.com.br/doc");
    expect(screen.getByText(/Envio da NF-e por e-mail solicitado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AB123BR" })).toBeInTheDocument();
  });
  it("keeps payment mappings explicit and saves only this tenant's automation settings", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ configured: true, settings: commerceOlistSettingsSchema.parse({}), options: [{ kind: "receiving_method", external_id: "101", name: "Pix recebido" }] });
    render(<CommerceOlistSettings/>);
    const select = await screen.findByLabelText("Pix da loja");
    expect(select).toHaveValue("");
    fireEvent.change(select, { target: { value: "101" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Sincronizar pedidos pagos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar integração" }));
    await waitFor(() => expect(storeRequest).toHaveBeenCalledWith("/api/commerce/admin/olist", "PUT", expect.objectContaining({ enabled: true, pixReceivingId: "101" })));
  });
});
