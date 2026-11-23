import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceOrderShipping } from "@/components/commerce/CommerceOrderShipping";
import { MELHOR_ENVIO_CONNECTED_EVENT } from "@/lib/melhor-envio/browser-request";

const endpoint = "/api/commerce/admin/orders/order-1/shipping";
const baseShipping = { id: "shipping-1", status: "quoted", service_name: "PAC", tracking_code: null, tracking_url: null, label_url: null, quoted_cents: 2500, purchase_cents: null, last_error: null, parcels: [] };
const base = { shipping: baseShipping, readiness: { eligible: true, reason: null }, contracted: { name: "PAC", priceCents: 2500 }, fiscal: { invoiceKey: null, senderStateRegister: null, productionReady: true }, notifications: { pending: 0, failed: 0 } };
const review = { serviceName: "PAC", contractedCents: 2500, currentCents: 2500, changed: false, recipient: { name: "João Silva", document: "12345678901", phone: "11999999999", postalCode: "01001000", address: "Praça da Sé", number: "10", complement: "Sala 2", district: "Sé", city: "São Paulo", state: "SP" }, sender: { name: "Gráfica São José", postalCode: "12212650" }, volumes: [{ width: 20, height: 10, length: 30, weight: 1.5 }] };
let fetcher: ReturnType<typeof vi.fn>;
const response = (body: unknown, status = 200) => Response.json(body, { status });
const next = (body: unknown, status = 200) => fetcher.mockResolvedValueOnce(response(body, status));
const posts = () => fetcher.mock.calls.filter(([, options]) => options?.method === "POST").map(([, options]) => JSON.parse(options.body));
async function mount(state: unknown = base, canManage = true) {
  next(state);
  const view = render(<CommerceOrderShipping orderId="order-1" canManage={canManage} />);
  await screen.findByText("Contratado");
  return view;
}
async function startReview(value = review) {
  next({ ...base, review: value });
  fireEvent.click(screen.getByRole("button", { name: "Revisar envio" }));
  return screen.findByRole("dialog", { name: "Revisar envio" });
}
beforeEach(() => {
  fetcher = vi.fn().mockRejectedValue(new Error("Unexpected unmocked request"));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("CommerceOrderShipping", () => {
  it("reviews recipient, sender and volumes before adding a strictly scoped cart", async () => {
    await mount();
    expect(screen.getByRole("button", { name: "Carrinho" })).toBeDisabled();
    const dialog = await startReview();
    expect(within(dialog).getByText(/João Silva/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Gráfica São José/)).toBeInTheDocument();
    expect(within(dialog).getByText(/20 × 10 × 30 cm · 1.5 kg/)).toBeInTheDocument();
    next({ ...base, shipping: { ...baseShipping, status: "cart", purchase_cents: 2700 } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar ao carrinho" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(posts()).toEqual([{ action: "review", productionReady: true }, { action: "cart", productionReady: true, expectedCostCents: 2500 }]);
    expect(screen.getByRole("button", { name: "Carrinho" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pagar etiqueta" })).toBeEnabled();
  });

  it("confirms the actual cart charge, requires explicit changed-cost consent, then generates and prints", async () => {
    await mount({ ...base, shipping: { ...baseShipping, status: "cart", purchase_cents: 2800, quoted_cents: 2600 } });
    fireEvent.click(screen.getByRole("button", { name: "Pagar etiqueta" }));
    const dialog = screen.getByRole("dialog", { name: "Confirmar cobrança da etiqueta" });
    expect(within(dialog).getByText(/28,00/)).toBeInTheDocument();
    expect(posts()).toEqual([]);
    expect(within(dialog).getByRole("button", { name: "Confirmar cobrança" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Aceito a diferença/ }));
    next({ ...base, shipping: { ...baseShipping, status: "purchased", purchase_cents: 2800 } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar cobrança" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(posts()).toEqual([{ action: "checkout", expectedCostCents: 2800, acceptCostChange: true }]);
    expect(screen.getByRole("button", { name: "Pagar etiqueta" })).toBeDisabled();
    next({ ...base, shipping: { ...baseShipping, status: "label_ready", purchase_cents: 2800 } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar etiqueta" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Imprimir etiqueta" })).toBeEnabled());
    next({ ...base, shipping: { ...baseShipping, status: "label_ready", purchase_cents: 2800, label_url: "https://www.melhorenvio.com.br/private/label" } });
    fireEvent.click(screen.getByRole("button", { name: "Imprimir etiqueta" }));
    expect(await screen.findByRole("link", { name: "Abrir etiqueta para impressão" })).toHaveAttribute("href", "https://www.melhorenvio.com.br/private/label");
    expect(screen.getByRole("button", { name: "Gerar etiqueta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Imprimir etiqueta" })).toBeDisabled();
    expect(posts().slice(1)).toEqual([{ action: "generate" }, { action: "print" }]);
  });

  it("does not send cost-change consent when costs match, including zero", async () => {
    await mount({ ...base, contracted: { name: "PAC", priceCents: 0 }, shipping: { ...baseShipping, status: "cart", purchase_cents: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Pagar etiqueta" }));
    expect(screen.queryByRole("checkbox", { name: /Aceito/ })).not.toBeInTheDocument();
    next({ ...base, shipping: { ...baseShipping, status: "purchased", purchase_cents: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cobrança" }));
    await waitFor(() => expect(posts()).toEqual([{ action: "checkout", expectedCostCents: 0 }]));
  });

  it("requires production confirmation and submits manual fiscal fields only on review and cart", async () => {
    await mount({ ...base, shipping: null, fiscal: { invoiceKey: null, senderStateRegister: null, productionReady: false } });
    expect(screen.getByRole("button", { name: "Revisar envio" })).toBeDisabled();
    fireEvent.click(screen.getByText("Documento fiscal e produção"));
    fireEvent.change(screen.getByLabelText("Chave da NF-e"), { target: { value: "1".repeat(44) } });
    fireEvent.change(screen.getByLabelText("Inscrição estadual do remetente"), { target: { value: "ISENTO" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "A produção está concluída e o pedido está pronto para embalar" }));
    const dialog = await startReview();
    next({ ...base, shipping: { ...baseShipping, status: "cart", purchase_cents: 2500 } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar ao carrinho" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()).toEqual([
      { action: "review", productionReady: true, invoiceKey: "1".repeat(44), senderStateRegister: "ISENTO" },
      { action: "cart", productionReady: true, invoiceKey: "1".repeat(44), senderStateRegister: "ISENTO", expectedCostCents: 2500 }
    ]);
    expect(JSON.stringify(posts())).not.toContain("noncommercial");
  });

  it("validates a malformed invoice locally inside the modal", async () => {
    await mount();
    fireEvent.click(screen.getByText("Documento fiscal e produção"));
    fireEvent.change(screen.getByLabelText("Chave da NF-e"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Revisar envio" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("exatamente 44 dígitos");
    expect(posts()).toEqual([]);
  });

  it("shows backend human-readable missing fields inside an actionable error modal", async () => {
    await mount();
    next({ error: "Confira os dados fiscais.", missingFields: ["invoiceKey", "Inscrição estadual do remetente", "CEP do destinatário"] }, 422);
    fireEvent.click(screen.getByRole("button", { name: "Revisar envio" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Chave da NF-e; Inscrição estadual do remetente; CEP do destinatário");
    expect(within(dialog).getByRole("button", { name: "Atualizar envio" })).toBeEnabled();
  });

  it.each(["review", "processing", "exception", "unknown"])("never offers repurchase for %s, shows last_error and permits safe reconciliation", async status => {
    await mount({ ...base, shipping: { ...baseShipping, status, last_error: "Resultado de pagamento ainda não confirmado." } });
    expect(screen.getByRole("alert")).toHaveTextContent("Resultado de pagamento ainda não confirmado.");
    for (const name of ["Revisar envio", "Carrinho", "Pagar etiqueta", "Gerar etiqueta"]) expect(screen.getByRole("button", { name })).toBeDisabled();
    next({ ...base, shipping: { ...baseShipping, status: "purchased", purchase_cents: 2500 } });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar envio" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar etiqueta" })).toBeEnabled());
    expect(posts()).toEqual([{ action: "refresh" }]);
  });

  it("blocks a timed-out charge and only reconciles on explicit refresh without retrying purchase", async () => {
    await mount({ ...base, shipping: { ...baseShipping, status: "cart", purchase_cents: 2500 } });
    fireEvent.click(screen.getByRole("button", { name: "Pagar etiqueta" }));
    fetcher.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cobrança" }));
    const dialog = await screen.findByRole("dialog", { name: "Não foi possível concluir o envio" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Não repita a compra");
    expect(screen.getByRole("button", { name: "Pagar etiqueta" })).toBeDisabled();
    next({ ...base, shipping: { ...baseShipping, status: "review", last_error: "Compra em conferência" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Atualizar envio" }));
    await screen.findByText("Compra em conferência");
    expect(screen.getByRole("button", { name: "Pagar etiqueta" })).toBeDisabled();
    expect(posts()).toEqual([{ action: "checkout", expectedCostCents: 2500 }, { action: "refresh" }]);
  });

  it("handles stale cart costs without automatically accepting or retrying", async () => {
    await mount();
    const dialog = await startReview();
    next({ error: "O custo mudou. Revise o envio novamente.", shipping: { ...baseShipping, quoted_cents: 3000 } }, 409);
    fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar ao carrinho" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O custo mudou");
    expect(screen.getByRole("button", { name: "Pagar etiqueta" })).toBeDisabled();
    expect(posts()).toHaveLength(2);
  });

  it("opens the existing reconnect flow for provider auth errors and never replays after reconnection", async () => {
    await mount();
    next({ code: "melhor_envio_oauth_invalid", reconnectRequired: true, error: "Unauthenticated." }, 502);
    fireEvent.click(screen.getByRole("button", { name: "Revisar envio" }));
    expect(await screen.findByRole("dialog", { name: "Reconectar Melhor Envio" })).toBeVisible();
    next(base);
    act(() => window.dispatchEvent(new Event(MELHOR_ENVIO_CONNECTED_EVENT)));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(posts()).toEqual([{ action: "review", productionReady: true }]);
  });

  it("keeps read-only access GET-only, hides fiscal mutations and private labels but permits tracking copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await mount({ ...base, shipping: { ...baseShipping, status: "label_ready", tracking_code: "BR123", tracking_url: "https://tracking.test/BR123", label_url: "https://label.test/private", parcels: [{ id: "parcel-1", status: "posted", trackingCode: "BR456", trackingUrl: "https://tracking.test/BR456", labelUrl: "https://label.test/parcel" }] } }, false);
    expect(screen.getByText("Somente leitura")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pagar etiqueta" })).not.toBeInTheDocument();
    expect(screen.queryByText("Documento fiscal e produção")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir etiqueta para impressão" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copiar rastreamento BR456" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("BR456"));
    next(base);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar envio" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(posts()).toEqual([]);
  });

  it("renders each parcel's label and safe tracking links, rejecting executable URLs", async () => {
    await mount({ ...base, shipping: { ...baseShipping, status: "label_ready", tracking_url: "javascript:alert(1)", parcels: [{ id: "1", status: "posted", trackingCode: "BR123", trackingUrl: "https://tracking.test/1", labelUrl: "https://label.test/1" }, { id: "2", status: "delivered", trackingCode: "BR456", trackingUrl: null, labelUrl: "https://label.test/2" }] } });
    expect(screen.getAllByRole("link", { name: "Abrir etiqueta para impressão" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Acompanhar entrega" })).toHaveAttribute("href", "https://tracking.test/1");
    expect(screen.getByText("Volume 2 · Entregue")).toBeInTheDocument();
  });

  it("recovers from GET failure without posting and displays readiness with no shipping", async () => {
    fetcher.mockRejectedValueOnce(new TypeError("Offline"));
    render(<CommerceOrderShipping orderId="order-1" canManage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Verifique a conexão");
    next({ ...base, shipping: null, readiness: { eligible: false, reason: "Aguardando pagamento confirmado" } });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar envio" }));
    await screen.findByText("Aguardando pagamento confirmado");
    expect(posts()).toEqual([]);
    expect(screen.getByRole("button", { name: "Carrinho" })).toBeDisabled();
  });

  it("retries notification delivery without replaying any shipping action", async () => {
    await mount({ ...base, notifications: { pending: 2, failed: 1 } });
    next({ ...base, notifications: { pending: 3, failed: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Reenviar notificações" }));
    await screen.findByText("Notificações: 3 pendente(s) · 0 com falha");
    expect(posts()).toEqual([{ action: "retry_notifications" }]);
  });

  it("ignores a previous order's late GET and does not leak confirmation state", async () => {
    let resolveOld!: (response: Response) => void;
    fetcher.mockReturnValueOnce(new Promise<Response>(resolve => { resolveOld = resolve; }));
    const view = render(<CommerceOrderShipping orderId="order-1" canManage />);
    next({ ...base, contracted: { name: "SEDEX", priceCents: 5000 }, shipping: null });
    view.rerender(<CommerceOrderShipping orderId="order-2" canManage />);
    await screen.findByText("SEDEX");
    await act(async () => resolveOld(response(base)));
    expect(screen.queryByText("PAC")).not.toBeInTheDocument();
    expect(fetcher.mock.calls[0][0]).toBe(endpoint);
    expect(fetcher.mock.calls[1][0]).toBe("/api/commerce/admin/orders/order-2/shipping");
  });

  it("requires cart consent at the reviewed price and resets it before confirming the recalculated charge", async () => {
    await mount();
    const dialog = await startReview({ ...review, currentCents: 2700, changed: true });
    expect(within(dialog).getByRole("button", { name: "Adicionar ao carrinho" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Aceito a diferença da cotação/ }));
    next({ ...base, shipping: { ...baseShipping, status: "cart", purchase_cents: 2900 } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Adicionar ao carrinho" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(posts()[1]).toEqual({ action: "cart", productionReady: true, expectedCostCents: 2700, acceptCostChange: true });
    fireEvent.click(screen.getByRole("button", { name: "Pagar etiqueta" }));
    expect(screen.getByRole("checkbox", { name: /Aceito a diferença de custo/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Confirmar cobrança" })).toBeDisabled();
    expect(within(screen.getByRole("dialog")).getByText(/29,00/)).toBeInTheDocument();
  });

  it("prevents double submission while a charge is in flight", async () => {
    await mount({ ...base, shipping: { ...baseShipping, status: "cart", purchase_cents: 2500 } });
    let finish!: (response: Response) => void;
    fetcher.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Pagar etiqueta" }));
    const confirm = screen.getByRole("button", { name: "Confirmar cobrança" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fechar janela" })).toBeDisabled();
    expect(posts()).toEqual([{ action: "checkout", expectedCostCents: 2500 }]);
    await act(async () => finish(response({ ...base, shipping: { ...baseShipping, status: "purchased", purchase_cents: 2500 } })));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("loads correctly under Strict Mode effect replay", async () => {
    next(base); next(base);
    render(<React.StrictMode><CommerceOrderShipping orderId="order-1" canManage /></React.StrictMode>);
    await screen.findByText("Contratado");
    expect(screen.getByRole("button", { name: "Revisar envio" })).toBeEnabled();
    expect(posts()).toEqual([]);
  });

  it("closes a pending confirmation when manage permission is revoked", async () => {
    const view = await mount({ ...base, shipping: { ...baseShipping, status: "cart", purchase_cents: 2500 } });
    fireEvent.click(screen.getByRole("button", { name: "Pagar etiqueta" }));
    next(base);
    view.rerender(<CommerceOrderShipping orderId="order-1" canManage={false} />);
    await screen.findByText("Somente leitura");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts()).toEqual([]);
  });

  it("does not misclassify a platform-session 401 as provider OAuth", async () => {
    await mount();
    next({ error: "Unauthorized" }, 401);
    fireEvent.click(screen.getByRole("button", { name: "Revisar envio" }));
    const dialog = await screen.findByRole("dialog", { name: "Não foi possível concluir o envio" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Sua sessão expirou");
    expect(screen.queryByRole("dialog", { name: "Reconectar Melhor Envio" })).not.toBeInTheDocument();
  });
});
