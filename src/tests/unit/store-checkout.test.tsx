import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreCheckout } from "@/components/commerce/StoreCheckout";
import { StoreOrderContactDetails } from "@/components/commerce/StoreOrderContactDetails";
import { fetchCepAddress } from "@/lib/cep";
import type { cartView } from "@/repositories/commerce";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import { testCommerceBilling } from "../fixtures/commerce-checkout";
vi.mock("@/lib/cep", async original => ({ ...await original<typeof import("@/lib/cep")>(), fetchCepAddress: vi.fn() }));
const settings = storeSettingsSchema.parse({ name: "Loja teste", description: "", logoUrl: "", bannerUrl: "", accent: "#047857", contactEmail: "store@example.test", contactPhone: "", pickupEnabled: true, pickupAddress: "Rua da loja, 10", deliveryEnabled: true, deliveryDescription: "Entrega local", deliveryCents: 1200, terms: "Condições" });
const cart = { revision: 1, lines: [], artworks: [], customer: { id: "buyer", name: "Comprador", email: "login@example.test" }, payments: { mp_enabled: false, manual_enabled: true, manual_instructions: "Pagar na loja" }, calculation: { totalCents: 9500, baseSubtotalCents: 10000, artworkDiscountCents: 500, items: [] } } as Awaited<ReturnType<typeof cartView>>;
beforeEach(() => { vi.mocked(fetchCepAddress).mockResolvedValue(null); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function show() {
  const submit = vi.fn(async () => {});
  render(<StoreCheckout cart={cart} settings={settings} base="/preview/shop" preview disabled={false} onSubmit={submit}/>);
  fireEvent.click(screen.getByRole("button", { name: "Preencher dados de teste" }));
  return submit;
}
function submitForm() { fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Concluir simulação" })); }
describe("checkout billing and recipient experience", () => {
  it("shows the selected shipping service beside the delivery details for buyers and staff", () => {
    render(<StoreOrderContactDetails address={{ ...testCommerceBilling, attention: "" }} shippingOption={{ name: "Correios - SEDEX", description: "Prazo estimado: 3 dias úteis" }}/>);
    expect(screen.getByRole("region", { name: "Dados de entrega do pedido" })).toHaveTextContent("Correios - SEDEX");
    expect(screen.getByText("Prazo estimado: 3 dias úteis")).toBeInTheDocument();
  });
  it("requires fiscal details for pickup without inventing a delivery address", () => {
    const submit = show(); submitForm();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ delivery: "pickup", address: null, billing: expect.objectContaining({ document: "52998224725" }), expectedTotalCents: 9500 }));
  });
  it("uses the current billing details for delivery without duplicating the form", () => {
    const submit = show();
    fireEvent.click(screen.getByLabelText(/Entrega ·/));
    expect(screen.getByRole("button", { name: "Usar dados do faturamento" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Nome do destinatário")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Número"), { target: { value: "777" } });
    expect(screen.getByLabelText("Entrega com os dados do faturamento")).toHaveTextContent("777");
    submitForm();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ deliveryAddressSameAsBilling: true, address: null, billing: expect.objectContaining({ number: "777" }), expectedTotalCents: 10700 }));
  });
  it("retains a different recipient and attention when switching back and forth", () => {
    const submit = show(); fireEvent.click(screen.getByLabelText(/Entrega ·/));
    fireEvent.click(screen.getByRole("button", { name: "Outro destinatário ou endereço" }));
    fireEvent.change(screen.getByLabelText("Nome do destinatário"), { target: { value: "Recebedor" } });
    fireEvent.change(screen.getByLabelText("Aos cuidados de (opcional)"), { target: { value: "Portaria" } });
    fireEvent.click(screen.getByRole("button", { name: "Usar dados do faturamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Outro destinatário ou endereço" }));
    expect(screen.getByLabelText("Nome do destinatário")).toHaveValue("Recebedor");
    submitForm();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ deliveryAddressSameAsBilling: false, billing: expect.objectContaining({ name: "Cliente de teste" }), address: expect.objectContaining({ name: "Recebedor", attention: "Portaria" }) }));
  });
  it("validates fiscal identification before submitting and recognizes a company", () => {
    const submit = show();
    fireEvent.change(screen.getByLabelText("CPF/CNPJ para faturamento"), { target: { value: "11111111111" } });
    submitForm(); expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText("Informe um CPF ou CNPJ válido para faturamento.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("CPF/CNPJ para faturamento"), { target: { value: "11222333000181" } });
    expect(screen.getByText("Pessoa jurídica")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Concluir simulação" }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ billing: expect.objectContaining({ document: "11222333000181" }) }));
  });
  it("does not overwrite a manually changed field when a CEP request completes", async () => {
    let resolve!: (data: Awaited<ReturnType<typeof fetchCepAddress>>) => void;
    vi.mocked(fetchCepAddress).mockImplementation(() => new Promise(done => { resolve = done; }));
    show(); fireEvent.click(screen.getByRole("button", { name: "Buscar CEP de faturamento" }));
    fireEvent.change(screen.getByLabelText("Endereço"), { target: { value: "Rua editada manualmente" } });
    await act(async () => resolve({ cep: "01001000", street: "Rua da API", district: "Bairro novo", city: "São Paulo", state: "SP" }));
    expect(screen.getByLabelText("Endereço")).toHaveValue("Rua editada manualmente");
    expect(screen.getByLabelText("Bairro")).toHaveValue("Bairro novo");
  });
  it("keeps billing and delivery CEP results independent", async () => {
    vi.mocked(fetchCepAddress).mockResolvedValue({ cep: "20040020", street: "Rua da entrega", district: "Centro", city: "Rio de Janeiro", state: "RJ" });
    show(); fireEvent.click(screen.getByLabelText(/Entrega ·/)); fireEvent.click(screen.getByRole("button", { name: "Outro destinatário ou endereço" }));
    fireEvent.change(screen.getByLabelText("CEP de entrega"), { target: { value: "20040020" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar CEP de entrega" }));
    const delivery = screen.getByRole("region", { name: "2. Como deseja receber?" });
    await waitFor(() => expect(within(delivery).getByLabelText("Cidade")).toHaveValue("Rio de Janeiro"));
    expect(screen.getByLabelText("CEP de faturamento")).toHaveValue("01001-000");
    await waitFor(() => expect(screen.getByRole("button", { name: "Buscar CEP de entrega" })).toBeEnabled());
  });
  it("shows both addresses on the saved order while keeping old orders readable", () => {
    const billing = { ...testCommerceBilling, personType: "F" as const };
    const address = { ...testCommerceBilling, name: "Recebedor", attention: "Portaria" };
    const view = render(<StoreOrderContactDetails billing={billing} address={address}/>);
    expect(screen.getByRole("region", { name: "Dados de faturamento do pedido" })).toHaveTextContent("fiscal@example.test");
    expect(screen.getByRole("region", { name: "Dados de entrega do pedido" })).toHaveTextContent("Recebedor");
    view.rerender(<StoreOrderContactDetails address={null}/>);
    expect(screen.queryByRole("region", { name: "Dados de faturamento do pedido" })).not.toBeInTheDocument();
    expect(screen.getByText("Retirada pessoalmente.")).toBeInTheDocument();
  });
});
