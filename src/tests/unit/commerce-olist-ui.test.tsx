import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommerceOrderOlist } from "@/components/commerce/CommerceOrderOlist";
import { CommerceOlistSettings } from "@/components/commerce/CommerceOlistSettings";
import { commerceOlistSettingsSchema } from "@/domain/commerce/olist";
import { storeRequest } from "@/components/commerce/store-http";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn() }));
vi.mock("@/components/olist/OlistReconnectBoundary", () => ({ OlistReconnectBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const state = { configured: true, enabled: true, autoInvoice: true, autoDispatch: true, job: { status: "waiting", customer_id: "11", sales_order_id: "22", invoice_id: null, production_completed_at: null } };
beforeEach(() => { vi.mocked(storeRequest).mockResolvedValue(state); HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.setAttribute("open", ""); }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe("commerce Olist UI", () => {
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
