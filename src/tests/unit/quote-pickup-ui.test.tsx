import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuotePickupAction } from "@/components/quotes/QuotePickupAction";
import { MelhorEnvioQuoteLabelActions } from "@/components/quotes/MelhorEnvioQuoteLabelActions";
import type { QuoteDetail } from "@/repositories/quotes";
import type { ShipmentRow } from "@/repositories/shipments";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const quote = { id: "quote", status: "draft", shipping_total: "30", subtotal: "200", discount_total: "20", grand_total: "210" } as QuoteDetail;
beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("pickup confirmation", () => {
  it.each([false, true])("offers the same removal action inside the label quote area, with a linked shipment: %s", async linked => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ ok: true, pending: false, message: "Frete removido" }));
    vi.stubGlobal("fetch", fetch);
    const props = {
      quoteId: quote.id,
      quoteShippingTotal: 30,
      shipments: linked ? [{ id: "shipment", provider: "melhor_envio", status: "quoted", service_name: "SEDEX", shipping_amount: "30" } as ShipmentRow] : [],
      pickupAction: <QuotePickupAction quote={quote} />
    };
    const { container } = render(<MelhorEnvioQuoteLabelActions {...props} />);
    expect(screen.getByText("7. Etiqueta Melhor Envio")).toBeInTheDocument();
    fireEvent.click(within(container).getByRole("button", { name: /Retirar frete/ }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveTextContent("180,00");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar retirada" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/quotes/quote/pickup");
  });
  it("keeps the label-area shortcut disabled when the quote has an invoice", () => {
    const props = { quoteId: quote.id, quoteShippingTotal: 30, shipments: [], pickupAction: <QuotePickupAction quote={{ ...quote, external_olist_invoice_id: "123" }} /> };
    render(<MelhorEnvioQuoteLabelActions {...props} />);
    expect(screen.getByRole("button", { name: /Retirar frete/ })).toBeDisabled();
  });
  it("shows the new total and saves only after confirmation", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, pending: false, message: "Frete removido" })));
    vi.stubGlobal("fetch", fetch);
    render(<QuotePickupAction quote={quote} />);
    fireEvent.click(screen.getByRole("button", { name: /Retirar frete/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("180,00");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar retirada" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ confirmed: true, expectedShippingTotal: 30 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Retirada no local · sem frete/)).toBeInTheDocument();
  });
  it("keeps errors visible in the modal and permits trying again", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: false, error: "O frete mudou" }), { status: 409 })));
    render(<QuotePickupAction quote={quote} />);
    fireEvent.click(screen.getByRole("button", { name: /Retirar frete/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar retirada" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O frete mudou");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("shows the persistent ERP warning and check action after reopening a quote", () => {
    render(<QuotePickupAction quote={{ ...quote, delivery_method: "pickup", shipping_total: "0", shipping_olist_sync_pending: true }} />);
    expect(screen.getByRole("button", { name: "Conferir no Olist" })).toBeInTheDocument();
    expect(screen.getByText(/nota fiscal ficará bloqueada/)).toBeInTheDocument();
  });
  it("disables removal for a quote with an invoice", () => {
    render(<QuotePickupAction quote={{ ...quote, external_olist_invoice_id: "123" }} />);
    expect(screen.getByRole("button", { name: /Retirar frete/ })).toBeDisabled();
  });
});
