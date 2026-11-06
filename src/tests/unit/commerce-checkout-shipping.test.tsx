import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreCheckout } from "@/components/commerce/StoreCheckout";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import { storeRequest } from "@/components/commerce/store-http";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn(), storeMoney: (cents: number) => `R$ ${(cents / 100).toFixed(2)}` }));
const settings = storeSettingsSchema.parse({ name: "Loja teste", description: "", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "store@example.test", contactPhone: "", pickupEnabled: false, pickupAddress: "", deliveryEnabled: false, carrierEnabled: true, deliveryDescription: "", deliveryCents: 0, terms: "Condições" });
const cart = { revision: 2, lines: [], artworks: [], customer: null, payments: { manual_enabled: true }, calculation: { totalCents: 10000, items: [] } };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("checkout carrier selection", () => {
  it("requires a quote, offers PAC/SEDEX and includes the selected server quote in the total", async () => {
    const submit = vi.fn(async () => {});
    vi.mocked(storeRequest).mockResolvedValue({ options: [{ id: "melhor_envio:1", name: "Correios - PAC", priceCents: 1500, quoteId: "11111111-1111-4111-8111-111111111111" }, { id: "melhor_envio:2", name: "Correios - SEDEX", priceCents: 2200, quoteId: "22222222-2222-4222-8222-222222222222" }] });
    render(<StoreCheckout cart={cart as never} settings={settings} base="/commerce/shop/preview" api="/api/commerce/shop/preview" preview disabled={false} onSubmit={submit}/>);
    fireEvent.click(screen.getByRole("button", { name: "Preencher dados de teste" }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Concluir simulação" })).toBeDisabled();
    expect(screen.getByText("A calcular")).toBeInTheDocument();
    expect(screen.getByText("Total parcial")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calcular frete do carrinho" }));
    await screen.findByText(/Correios - SEDEX/);
    expect(storeRequest).toHaveBeenCalledWith("/api/commerce/shop/preview/checkout-delivery", "POST", expect.objectContaining({ postalCode: "01001000", revision: 2 }));
    fireEvent.click(screen.getByLabelText(/Correios - SEDEX/));
    fireEvent.click(screen.getByRole("button", { name: "Concluir simulação" }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ shippingQuoteId: "22222222-2222-4222-8222-222222222222", expectedTotalCents: 12200 }));
    fireEvent.change(screen.getByLabelText("CEP de faturamento"), { target: { value: "20040020" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Concluir simulação" })).toBeDisabled());
    expect(screen.queryByText(/Correios - SEDEX/)).not.toBeInTheDocument();
  });
  it("shows quote failures in place without allowing an unquoted free delivery", async () => {
    vi.mocked(storeRequest).mockRejectedValue(new Error("Frete indisponível"));
    render(<StoreCheckout cart={cart as never} settings={settings} base="/commerce/shop/preview" api="/api/commerce/shop/preview" preview disabled={false} onSubmit={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: "Preencher dados de teste" }));
    fireEvent.click(screen.getByRole("button", { name: "Calcular frete do carrinho" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Frete indisponível");
    expect(screen.getByRole("button", { name: "Concluir simulação" })).toBeDisabled();
  });
});
