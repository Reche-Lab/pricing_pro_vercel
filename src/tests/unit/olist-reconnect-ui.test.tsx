import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OlistReconnectBoundary } from "@/components/olist/OlistReconnectBoundary";
import { OlistQuoteActions } from "@/components/quotes/OlistQuoteActions";
import { QuotePaymentTermPanel } from "@/components/quotes/QuotePaymentTermPanel";
import { olistAwareFetch, requestOlistReconnect, OLIST_CONNECTED_EVENT } from "@/lib/olist/browser-request";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
class Channel {
  static instances: Channel[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  close = vi.fn();
  constructor(public name: string) { Channel.instances.push(this); }
}
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("BroadcastChannel", Channel); Channel.instances = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("shared Olist reconnect", () => {
  it("preserves the response body, opens only one modal and does not replay mutations", async () => {
    const payload = { ok: false, httpStatus: 401, error: "invalid_grant" };
    const fetcher = vi.fn().mockImplementation(async () => Response.json(payload, { status: 502 }));
    vi.stubGlobal("fetch", fetcher);
    render(<OlistReconnectBoundary><input aria-label="Rascunho" defaultValue="Arte personalizada" /></OlistReconnectBoundary>);
    let response: Response;
    await act(async () => { response = await olistAwareFetch("/api/quotes/q/olist/sales-order", { method: "POST" }); });
    expect(await response!.json()).toEqual(payload);
    act(() => requestOlistReconnect());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.getByLabelText("Rascunho")).toHaveValue("Arte personalizada");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, { ok: false }],
    [400, { ok: false, error: "UF inválida" }],
    [502, { ok: false, httpStatus: 403, error: "Permissões OAuth insuficientes" }]
  ])("keeps local/session/permission/validation failures out of reconnect (%s)", async (status, data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data, { status })));
    render(<OlistReconnectBoundary>Orçamento</OlistReconnectBoundary>);
    await act(async () => { await olistAwareFetch("/api/quotes/q/olist/customer"); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("detects an authentication failure in a partially successful payment sync", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, options: [], failures: [{ message: "invalid_grant" }] })));
    render(<OlistReconnectBoundary>Orçamento</OlistReconnectBoundary>);
    await act(async () => { await olistAwareFetch("/api/olist/payment-options/sync"); });
    expect(screen.getByRole("dialog", { name: "Reconectar Olist/Tiny" })).toBeVisible();
  });

  it("handles a blocked popup without navigating away", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<OlistReconnectBoundary>Orçamento</OlistReconnectBoundary>);
    act(() => requestOlistReconnect());
    fireEvent.click(screen.getByRole("button", { name: "Reconectar Olist/Tiny" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Permita pop-ups");
  });

  it("reconnects through a private same-origin channel even when COOP detaches the popup", async () => {
    const popup = { location: { href: "about:blank" }, closed: true, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const fetcher = vi.fn().mockResolvedValue(Response.json({ authUrl: "https://accounts.tiny.com.br/auth" }));
    vi.stubGlobal("fetch", fetcher);
    const listener = vi.fn();
    window.addEventListener(OLIST_CONNECTED_EVENT, listener);
    render(<OlistReconnectBoundary><input aria-label="Rascunho" defaultValue="Observação preservada" /></OlistReconnectBoundary>);
    act(() => requestOlistReconnect());
    fireEvent.click(screen.getByRole("button", { name: "Reconectar Olist/Tiny" }));
    await waitFor(() => expect(popup.location.href).toBe("https://accounts.tiny.com.br/auth"));
    const redirect = new URL(fetcher.mock.calls[0][0], "https://local.test").searchParams.get("redirectPath")!;
    expect(redirect).toContain(`/olist/oauth/complete?attempt=${Channel.instances[0].name.split(":")[1]}`);
    act(() => Channel.instances[0].onmessage?.({ data: "connected" }));
    expect(screen.getByRole("dialog", { name: "Olist conectado" })).toBeVisible();
    expect(listener).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao orçamento" }));
    expect(screen.getByLabelText("Rascunho")).toHaveValue("Observação preservada");
    window.removeEventListener(OLIST_CONNECTED_EVENT, listener);
  });
});

describe("quote Olist actions", () => {
  it.each([
    ["Consultar cliente", "customer/lookup"],
    ["Criar cliente Olist", "customer"],
    ["Criar assunto CRM", "crm"],
    ["Criar tarefa CRM", "crm/task"],
    ["Gerar pedido", "sales-order"],
    ["Gerar nota Olist", "invoice"],
    ["Atualizar despacho", "dispatch"],
    ["Enviar para expedição", "fulfillment"],
    ["Cancelar nota", "invoice/cancel"]
  ])("opens reconnect for %s without discarding the action form", async (label, path) => {
    const fetcher = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/integrations/olist") return Response.json({ ok: true, integrations: { olist: { configured: true, connected: true, status: "active" } } });
      if (init?.method === "POST") return Response.json({ ok: false, code: "olist_oauth_invalid", error: "invalid_grant" }, { status: 502 });
      return Response.json({ ok: true, quote: {}, items: [], payload: {}, paymentRequired: false });
    });
    vi.stubGlobal("fetch", fetcher);
    const { container } = render(<OlistReconnectBoundary><OlistQuoteActions quoteId="q" hasCustomer customerName="Cliente Teste" externalOlistId={path === "customer" || path === "customer/lookup" ? null : "123"} externalOrderId={["invoice", "dispatch", "fulfillment", "invoice/cancel"].includes(path) ? "456" : null} externalInvoiceId={["fulfillment", "invoice/cancel"].includes(path) ? "789" : null} externalCrmId={path === "crm/task" ? "321" : null} /></OlistReconnectBoundary>);
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(container.querySelector("form")).toBeInTheDocument());
    const form = container.querySelector("form")!;
    const invoiceNumber = form.elements.namedItem("numeroNota");
    if (invoiceNumber instanceof HTMLElement) fireEvent.change(invoiceNumber, { target: { value: "100" } });
    for (const name of ["description", "fulfillmentNote", "cancelReason"]) {
      const input = form.elements.namedItem(name);
      if (input instanceof HTMLElement) fireEvent.change(input, { target: { value: "Observação preenchida antes de reconectar" } });
    }
    fireEvent.submit(form);
    await screen.findByRole("dialog", { name: "Reconectar Olist/Tiny" });
    expect(fetcher.mock.calls.some(([url, init]) => url === `/api/quotes/q/olist/${path}` && init?.method === "POST")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(container.querySelector("form")).toBe(form);
  });

  it("opens reconnect from payment options synchronization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false, failures: [{ message: "invalid_grant" }] }, { status: 502 })));
    render(<OlistReconnectBoundary><QuotePaymentTermPanel quoteId="q" total={100} options={[]} initialPaymentTerm={null} defaultCategory={{ externalId: "", name: "" }} /></OlistReconnectBoundary>);
    fireEvent.click(screen.getByRole("button", { name: /Pagamento do pedido Olist/i }));
    fireEvent.click(screen.getByRole("button", { name: /Sincronizar/ }));
    expect(await screen.findByRole("dialog", { name: "Reconectar Olist/Tiny" })).toBeVisible();
  });
});
