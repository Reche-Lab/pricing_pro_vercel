import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorePriceBreakdown } from "@/components/commerce/StorePriceBreakdown";
import { StoreDeliveryInquiry } from "@/components/commerce/StoreDeliveryInquiry";
import { StoreProductCard } from "@/components/commerce/StoreHome";
import { storeRequest } from "@/components/commerce/store-http";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn(), storeMoney: (cents: number) => `R$ ${(cents / 100).toFixed(2)}` }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const lines = [{ id: "item", productId: "product", quantity: 50, artworkName: "Arte 1", artworkId: null }];
describe("product offers UI", () => {
  it("explains why an invalid product selection blocks delivery", () => {
    render(<StoreDeliveryInquiry api="/api/store/shop" lines={[]} disabled disabledReason="Selecione de 10 a 100 unidades para consultar a entrega." />);
    expect(screen.getByRole("status")).toHaveTextContent("Selecione de 10 a 100 unidades");
    expect(screen.getByRole("button", { name: "Consultar" })).toBeDisabled();
  });
  it("shows original and current unit and total prices only for genuine savings", () => {
    const { container, rerender } = render(<StorePriceBreakdown originalUnitCents={1000} quantity={50} price={{ totalCents: 30000, items: [{ unitCents: 600 }] }} />);
    expect(container.querySelectorAll("del")).toHaveLength(2);
    expect(screen.getByLabelText("Preço unitário de referência")).toHaveTextContent("R$ 10.00");
    expect(screen.getByLabelText("Total sem desconto por quantidade")).toHaveTextContent("R$ 500.00");
    expect(screen.getByText(/Economia de/)).toHaveTextContent("R$ 200.00");
    rerender(<StorePriceBreakdown originalUnitCents={1000} quantity={1} price={{ totalCents: 1000, items: [{ unitCents: 1000 }] }} />);
    expect(container.querySelector("del")).toBeNull();
    expect(screen.queryByText(/Economia de/)).not.toBeInTheDocument();
  });
  it("shows unit ranges and individual artwork values without inventing a single unit price", () => {
    render(<StorePriceBreakdown originalUnitCents={1000} quantity={51} price={{ totalCents: 31000, items: [{ unitCents: 600, quantity: 50, artworkName: "Arte A" }, { unitCents: 1000, quantity: 1, artworkName: "Arte B" }] }} />);
    expect(screen.getByText("R$ 6.00 a R$ 10.00")).toBeInTheDocument();
    expect(screen.getByText("Valores por arte")).toBeInTheDocument();
    expect(screen.queryByLabelText("Preço unitário de referência")).not.toBeInTheDocument();
  });
  it("advertises achievable discounts with the quantity and single artwork condition", () => {
    render(<StoreProductCard base="/loja/shop" product={{ id: "p", name: "Produto", description: "", category: "Produtos", imageUrl: "/p.png", minQuantity: 1, maxQuantity: 100, maxArtworks: 5, personalized: true, pricingRule: "per_art", geometry: null, margins: { bleedMm: 0, safeMarginMm: 0 }, unitCents: 1000, offer: { originalUnitCents: 1000, minimumUnitCents: 600, maxDiscountPercent: 40, discountQuantity: 50 } }} />);
    expect(screen.getByText(/Até 40% de desconto/)).toHaveTextContent("em 50 un. · 1 arte");
  });
  it("consults using the active product and quantity without adding it to the cart", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ options: [{ id: "delivery", name: "Entrega local", priceCents: 1500 }] });
    render(<StoreDeliveryInquiry api="/api/store/shop" lines={lines} disabled={false} />);
    fireEvent.change(screen.getByLabelText("CEP de destino"), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    await screen.findByText("Entrega local");
    expect(storeRequest).toHaveBeenCalledWith("/api/store/shop/delivery", "POST", { postalCode: "12345-678", lines });
    expect(screen.getByText(/frete final/)).toBeInTheDocument();
    expect(screen.getByText("Tarifa de entrega da loja")).toBeInTheDocument();
  });
  it("discards outdated responses after quantity/CEP changes and presents retryable errors", async () => {
    let finish!: (data: unknown) => void;
    vi.mocked(storeRequest).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<StoreDeliveryInquiry api="/api/commerce/shop/preview" lines={lines} disabled={false} />);
    fireEvent.change(screen.getByLabelText("CEP de destino"), { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    rerender(<StoreDeliveryInquiry api="/api/commerce/shop/preview" lines={[{ ...lines[0], quantity: 60 }]} disabled={false} />);
    await act(async () => finish({ options: [{ id: "old", name: "Old delivery", priceCents: 100 }] }));
    expect(screen.queryByText("Old delivery")).not.toBeInTheDocument();
    vi.mocked(storeRequest).mockRejectedValueOnce(new Error("Aguarde e tente novamente."));
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Aguarde"));
    expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("CEP de destino"), { target: { value: "9" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar" })).toBeDisabled();
  });
});
