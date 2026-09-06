import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Storefront } from "@/components/commerce/Storefront";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import { storeRequest } from "@/components/commerce/store-http";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/commerce/store-http", () => ({
  storeRequest: vi.fn(),
  storeMoney: (value: number) => `R$ ${value / 100}`,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const settings = storeSettingsSchema.parse({
  name: "Loja teste",
  description: "",
  logoUrl: "",
  bannerUrl: "",
  accent: "#047857",
  contactEmail: "test@example.test",
  contactPhone: "",
  pickupEnabled: false,
  pickupAddress: "",
  deliveryEnabled: false,
  deliveryCents: 0,
  deliveryDescription: "",
  terms: "Condições salvas",
});
const product = {
  id: "8c82b392-f45e-4c87-82d1-c0c3eea5da14",
  name: "Produto teste",
  description: "Produto publicado no rascunho",
  category: "Teste",
  imageUrl: "https://example.test/product.png",
  minQuantity: 1,
  maxQuantity: 100,
  maxArtworks: 5,
  personalized: true,
  pricingRule: "per_art" as const,
  geometry: null,
  margins: { bleedMm: 0, safeMarginMm: 0 },
  unitCents: 100,
};
describe("preview storefront navigation", () => {
  it("does not create buyer sessions or expose checkout links", () => {
    render(
      <Storefront
        slug="ground-shop"
        settings={settings}
        products={[]}
        path={[]}
        paused={false}
        preview
      />,
    );
    expect(screen.getByText("Pré-visualização privada")).toBeInTheDocument();
    expect(storeRequest).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Minha conta")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Carrinho")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Pesquisar produtos" }),
    ).toHaveAttribute("href", "/commerce/ground-shop/preview/catalogo");
    expect(screen.getByText("Condições de compra")).toHaveAttribute(
      "href",
      "/commerce/ground-shop/preview/condicoes",
    );
  });
  it("uses only the private price endpoint and keeps purchasing disabled", async () => {
    vi.mocked(storeRequest).mockResolvedValue({
      totalCents: 100,
      items: [{ unitCents: 100 }],
    });
    render(
      <Storefront
        slug="ground-shop"
        settings={settings}
        products={[product]}
        path={["produto", "8c82b392-f45e-4c87-82d1-c0c3eea5da14"]}
        paused={false}
        preview
      />,
    );
    await waitFor(() => expect(storeRequest).toHaveBeenCalledTimes(1));
    expect(storeRequest).toHaveBeenCalledWith(
      "/api/commerce/ground-shop/preview/price",
      "POST",
      expect.objectContaining({ lines: expect.any(Array) }),
    );
    expect(
      screen.getByRole("button", { name: "Compras desativadas na prévia" }),
    ).toBeDisabled();
  });
});
