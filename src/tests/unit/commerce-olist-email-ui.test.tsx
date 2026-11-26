import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommerceOlistEmailReview } from "@/components/commerce/CommerceOlistEmailReview";
import { CommerceOrderOlist } from "@/components/commerce/CommerceOrderOlist";
import { storeRequest } from "@/components/commerce/store-http";
import { OLIST_RECONNECT_EVENT } from "@/lib/olist/browser-request";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn() }));
vi.mock("@/components/olist/OlistReconnectBoundary", () => ({ OlistReconnectBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const review = { customerId: "11", customerName: "Cliente teste", targetEmail: "purchase@example.test", contactEmail: "old@example.test", contactNfeEmail: "old-fiscal@example.test", invoiceId: "33", invoiceNumber: "224", invoiceEmail: "old-note@example.test", contactMatches: false, invoiceMatches: false, reviewToken: "a".repeat(64), olistRecipients: ["old@example.test", "old-fiscal@example.test", "old-note@example.test"], canUseOlistEmail: true };
const state = { configured: true, enabled: true, autoInvoice: true, autoDispatch: true, job: { status: "blocked", customer_id: "11", sales_order_id: "22", invoice_id: "33", invoice_status: 1, production_completed_at: "now", last_error: "O e-mail da nota no Olist difere do e-mail de faturamento.", error_code: "olist_data_required" } };
beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.setAttribute("open", ""); }); vi.mocked(storeRequest).mockResolvedValue(state); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function consent() {
  await screen.findByText("purchase@example.test");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Motivo da atualização"), { target: { value: "E-mail informado nesta compra confirmado" } });
}
describe("Olist fiscal email correction UI", () => {
  it("offers recovery for legacy email errors even without a guided action target", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ emailReview: review })));
    render(<CommerceOrderOlist orderId="test" canManage paid production guided={{ target: null, action: null }}/>);
    fireEvent.click(await screen.findByRole("button", { name: "Conferir e-mails da nota" }));
    expect(await screen.findByText("purchase@example.test")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Conferir e-mails da nota" })).toBeInTheDocument();
  });
  it("shows the purchase, contact, fiscal and invoice emails and requires consent plus a reason", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ emailReview: review })).mockResolvedValueOnce(Response.json({ ...state, resumed: true, emailReview: { ...review, contactMatches: true, invoiceMatches: true } }));
    vi.stubGlobal("fetch", fetcher); const checked = vi.fn();
    render(<CommerceOlistEmailReview endpoint="/test/olist" onClose={vi.fn()} onChecked={checked}/>);
    await screen.findByText("purchase@example.test");
    for (const address of ["old@example.test", "old-fiscal@example.test", "old-note@example.test"]) expect(screen.getByText(address)).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Atualizar e conferir" }); expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox")); expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo da atualização"), { target: { value: "E-mail da compra conferido" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(checked).toHaveBeenCalledWith(expect.objectContaining({ resumed: true })));
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "email_update", reviewToken: review.reviewToken, confirmEmailUpdate: true, note: "E-mail da compra conferido" });
    expect(fetcher.mock.calls[1][1].body).not.toContain("purchase@example.test");
  });
  it("keeps partial success in the modal, offers Olist access and does not claim invoice issuance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ emailReview: review })).mockResolvedValueOnce(Response.json({ ...state, resumed: false, emailReview: { ...review, contactMatches: true } })));
    render(<CommerceOlistEmailReview endpoint="/test/olist" onClose={vi.fn()} onChecked={vi.fn()}/>);
    await consent(); fireEvent.click(screen.getByRole("button", { name: "Atualizar e conferir" }));
    expect(await screen.findByRole("link", { name: "Abrir Olist" })).toHaveAttribute("href", "https://erp.tiny.com.br/");
    expect(screen.getByRole("status")).toHaveTextContent("A nota pendente ainda mantém outro e-mail");
    expect(screen.getByRole("status").closest("dialog")).toBeTruthy();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("leaves failure and another query available inside the dialog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ emailReview: review })).mockResolvedValueOnce(Response.json({ error: "Olist não permitiu atualizar o contato." }, { status: 409 })));
    render(<CommerceOlistEmailReview endpoint="/test/olist" onClose={vi.fn()} onChecked={vi.fn()}/>);
    await consent(); fireEvent.click(screen.getByRole("button", { name: "Atualizar e conferir" }));
    const error = await screen.findByRole("alert"); expect(error).toHaveTextContent("Olist não permitiu atualizar"); expect(error.closest("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Consultar novamente" })).toBeEnabled();
  });
  it("requests OAuth reconnection on a failed review", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "olist_oauth_invalid", reconnectRequired: true }, { status: 409 })));
    const close = vi.fn(), listener = vi.fn(); window.addEventListener(OLIST_RECONNECT_EVENT, listener);
    try { render(<CommerceOlistEmailReview endpoint="/test/olist" onClose={close} onChecked={vi.fn()}/>); await waitFor(() => expect(close).toHaveBeenCalledOnce()); expect(listener).toHaveBeenCalledOnce(); }
    finally { window.removeEventListener(OLIST_RECONNECT_EVENT, listener); }
  });
  it("does not offer contact email changes to read-only users", async () => {
    render(<CommerceOrderOlist orderId="test" canManage={false} paid production guided={{ target: null, action: null }}/>);
    await screen.findByText(state.job.last_error);
    expect(screen.queryByRole("button", { name: "Conferir e-mails da nota" })).not.toBeInTheDocument();
  });
  it("offers an explicit existing-ERP choice without sending arbitrary addresses or approving silently", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ emailReview: review })).mockResolvedValueOnce(Response.json({ ...state, resumed: true, recipientSource: "olist", emailReview: review }));
    vi.stubGlobal("fetch", fetcher); const checked = vi.fn();
    render(<CommerceOlistEmailReview endpoint="/test/olist" onClose={vi.fn()} onChecked={checked}/>);
    await screen.findByText("purchase@example.test");
    fireEvent.click(screen.getByRole("radio", { name: /Manter os e-mails do Olist/ }));
    const confirm = screen.getByRole("button", { name: "Manter e-mails e continuar" });
    expect(confirm).toBeDisabled(); expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText("Endereços autorizados nesta decisão")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.change(screen.getByLabelText("Motivo da decisão"), { target: { value: "Cliente confirmou os e-mails do ERP" } });
    fireEvent.click(confirm); await waitFor(() => expect(checked).toHaveBeenCalledWith(expect.objectContaining({ recipientSource: "olist" })));
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "email_use_olist", reviewToken: review.reviewToken, confirmOlistEmail: true, note: "Cliente confirmou os e-mails do ERP" });
    expect(fetcher.mock.calls[1][1].body).not.toContain("@example.test");
  });
  it("resets consent when switching choices and disables keeping invalid ERP recipients", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ emailReview: review })));
    const view = render(<CommerceOlistEmailReview endpoint="/test/olist" onClose={vi.fn()} onChecked={vi.fn()}/>);
    await consent(); fireEvent.click(screen.getByRole("radio", { name: /Manter os e-mails do Olist/ }));
    expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(screen.getByRole("button", { name: "Manter e-mails e continuar" })).toBeDisabled();
    view.unmount(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ emailReview: { ...review, canUseOlistEmail: false } })));
    render(<CommerceOlistEmailReview endpoint="/test/olist" onClose={vi.fn()} onChecked={vi.fn()}/>);
    await screen.findByText("purchase@example.test"); expect(screen.getByRole("radio", { name: /Manter os e-mails do Olist/ })).toBeDisabled();
  });
});
