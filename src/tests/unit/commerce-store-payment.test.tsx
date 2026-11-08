import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorePayment } from "@/components/commerce/StorePayment";
import { storeRequest } from "@/components/commerce/store-http";
import { cardBrickMethods } from "@/components/commerce/mercado-pago-sdk";
import { defaultCommercePaymentSettings } from "@/domain/commerce/payment-settings";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn(), storeMoney: (cents: number) => `R$ ${(cents / 100).toFixed(2)}` }));
const initial = () => ({ enabled: true, publicKey: "public-key", amountCents: 12990, settings: defaultCommercePaymentSettings(), hosted: false, paymentStatus: "pending", attempt: null });
const onConfirmed = vi.fn().mockResolvedValue(undefined);
beforeEach(() => { vi.clearAllMocks(); vi.mocked(storeRequest).mockResolvedValue(initial()); });
afterEach(() => { cleanup(); delete window.MercadoPago; });
describe("buyer payment experience", () => {
  it("generates Pix without sending amounts and shows copy-and-paste", async () => {
    render(<StorePayment api="/api/store/shop" orderId="order" onConfirmed={onConfirmed}/>);
    await screen.findByRole("button", { name: "Gerar Pix" });
    vi.mocked(storeRequest).mockResolvedValue({ ...initial(), attempt: { id: "attempt", method: "pix", status: "pending", result: { qrCode: "000201-test-pix", message: "Aguardando confirmação" } } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar Pix" }));
    expect(await screen.findByDisplayValue("000201-test-pix")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gerar Pix" })).toBeNull();
    expect(storeRequest).toHaveBeenLastCalledWith("/api/store/shop/payment/direct", "POST", { orderId: "order", requestId: expect.any(String), payment: { method: "pix" } });
    expect(screen.queryByRole("button", { name: "Pagar no Mercado Pago" })).toBeNull();
  });
  it("restores an uncertain attempt without offering a second charge", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ ...initial(), attempt: { id: "attempt", method: "card", status: "unknown", result: { message: "Estamos verificando o pagamento." } } });
    render(<StorePayment api="/api/store/shop" orderId="order" onConfirmed={onConfirmed}/>);
    expect(await screen.findByText("Estamos verificando o pagamento.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gerar Pix" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pagar no Mercado Pago" })).toBeNull();
  });
  it("preserves hosted checkouts and does not invite a second Pix payment", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ ...initial(), hosted: true });
    render(<StorePayment api="/api/store/shop" orderId="order" onConfirmed={onConfirmed}/>);
    expect(await screen.findByRole("button", { name: "Abrir pagamento seguro" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gerar Pix" })).toBeNull();
  });
  it("shows a visible error and no payable controls when status cannot be loaded", async () => {
    vi.mocked(storeRequest).mockRejectedValue(new Error("Pagamento indisponível"));
    render(<StorePayment api="/api/store/shop" orderId="order" onConfirmed={onConfirmed}/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Pagamento indisponível");
    expect(screen.queryByRole("button", { name: "Gerar Pix" })).toBeNull();
  });
  it("refreshes the parent only after server payment confirmation", async () => {
    render(<StorePayment api="/api/store/shop" orderId="order" onConfirmed={onConfirmed}/>);
    await screen.findByRole("button", { name: "Gerar Pix" });
    vi.mocked(storeRequest).mockResolvedValue({ ...initial(), paymentStatus: "paid", attempt: { id: "attempt", method: "pix", status: "paid", result: {} } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar Pix" }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "Gerar Pix" })).toBeNull();
  });
  it("excludes disabled card types and limits installments in the official Brick", () => {
    expect(cardBrickMethods({ ...defaultCommercePaymentSettings(), credit: false })).toEqual({ types: { excluded: ["prepaid_card", "credit_card"] }, minInstallments: 1, maxInstallments: 1 });
  });
  it("uses only the official tokenized card submission and unmounts the Brick after switching methods", async () => {
    let callbacks: { onReady: () => void; onSubmit: (data: unknown, additional: unknown) => Promise<void> } | undefined;
    const unmount = vi.fn();
    const create = vi.fn(async (_type, _id, options) => { callbacks = options.callbacks; callbacks!.onReady(); return { unmount }; });
    window.MercadoPago = class { bricks() { return { create }; } } as never;
    render(<StorePayment api="/api/store/shop" orderId="order" onConfirmed={onConfirmed}/>);
    await screen.findByRole("button", { name: "Gerar Pix" });
    fireEvent.click(screen.getByRole("button", { name: /Cartão/ }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0]).toBe("cardPayment");
    expect(create.mock.calls[0][2].initialization.amount).toBe(129.9);
    await act(async () => { await callbacks!.onSubmit({ token: "secure-token-123456", payment_method_id: "visa", installments: 1, transaction_amount: 0.01, card_number: "must-never-forward" }, { paymentTypeId: "credit_card" }); });
    expect(storeRequest).toHaveBeenCalledWith("/api/store/shop/payment/direct", "POST", { orderId: "order", requestId: expect.any(String), payment: { method: "card", token: "secure-token-123456", paymentMethodId: "visa", paymentType: "credit_card", installments: 1 } });
    fireEvent.click(screen.getByRole("button", { name: /Pix/ }));
    await waitFor(() => expect(unmount).toHaveBeenCalled());
  });
});
