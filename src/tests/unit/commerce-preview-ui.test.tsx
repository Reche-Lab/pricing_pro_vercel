import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Storefront } from "@/components/commerce/Storefront";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import { storeRequest } from "@/components/commerce/store-http";
import {
  CommercePreviewProvider,
  useCommercePreview,
} from "@/components/commerce/CommercePreviewProvider";
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
  it("exposes a private cart without creating buyer sessions", () => {
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
    expect(screen.getByTitle("Carrinho")).toHaveAttribute(
      "href",
      "/commerce/ground-shop/preview/carrinho",
    );
    expect(
      screen.getByRole("link", { name: "Pesquisar produtos" }),
    ).toHaveAttribute("href", "/commerce/ground-shop/preview/catalogo");
    expect(screen.getByText("Condições de compra")).toHaveAttribute(
      "href",
      "/commerce/ground-shop/preview/condicoes",
    );
  });
  it("adds products to a temporary cart using only private pricing", async () => {
    vi.mocked(storeRequest).mockResolvedValue({
      totalCents: 100,
      items: [{ unitCents: 100 }],
    });
    render(
      <CommercePreviewProvider slug="ground-shop">
        <Storefront
          slug="ground-shop"
          settings={settings}
          products={[product]}
          path={["produto", "8c82b392-f45e-4c87-82d1-c0c3eea5da14"]}
          paused={false}
          preview
        />
      </CommercePreviewProvider>,
    );
    await waitFor(() => expect(storeRequest).toHaveBeenCalledTimes(1));
    expect(storeRequest).toHaveBeenCalledWith(
      "/api/commerce/ground-shop/preview/price",
      "POST",
      expect.objectContaining({ lines: expect.any(Array) }),
    );
    expect(
      screen.getByRole("button", { name: "Adicionar ao carrinho" }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar ao carrinho" }),
    );
    await waitFor(() =>
      expect(screen.getByTitle("Carrinho")).toHaveTextContent("1"),
    );
    expect(
      vi
        .mocked(storeRequest)
        .mock.calls.every(
          ([url]) => url === "/api/commerce/ground-shop/preview/price",
        ),
    ).toBe(true);
  });
  it("retains cart and approved artwork across client navigation without calling checkout APIs", async () => {
    vi.mocked(storeRequest).mockImplementation(async (url, _method, body) => {
      if (url.endsWith("/artworks"))
        return {
          fileName: "arte.webp",
          mimeType: "image/webp",
          fileSize: 3,
          dataUrl: "data:image/webp;base64,YWJj",
        };
      const lines = (body as { lines: { id: string; quantity: number }[] })
        .lines;
      return {
        totalCents: 100,
        items: lines.map((line) => ({
          ...line,
          name: product.name,
          totalCents: 100,
          unitCents: 100,
        })),
      };
    });
    const content = (path: string[]) => (
      <CommercePreviewProvider slug="ground-shop">
        <SeedPreview />
        <Storefront
          slug="ground-shop"
          settings={{ ...settings, pickupEnabled: true }}
          products={[product]}
          path={path}
          paused={false}
          preview
        />
      </CommercePreviewProvider>
    );
    const view = render(content(["carrinho"]));
    fireEvent.click(screen.getByRole("button", { name: "Preparar fixture" }));
    await waitFor(() =>
      expect(screen.getByTitle("Carrinho")).toHaveTextContent("1"),
    );
    view.rerender(content(["checkout"]));
    expect(screen.queryByText("Enviar código")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Concluir simulação" }));
    await screen.findByText("Simulação concluída");
    expect(
      vi
        .mocked(storeRequest)
        .mock.calls.every(([url]) =>
          url.startsWith("/api/commerce/ground-shop/preview/"),
        ),
    ).toBe(true);
    view.rerender(content(["carrinho"]));
    expect(screen.getByTitle("Carrinho")).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "Limpar simulação" }));
    expect(screen.getByTitle("Carrinho")).toHaveTextContent("0");
  });
  it("requires artwork approval before completing a personalized simulation", async () => {
    vi.mocked(storeRequest).mockResolvedValue({
      totalCents: 100,
      items: [{ id: "test", unitCents: 100 }],
    });
    const content = (path: string[]) => (
      <CommercePreviewProvider slug="ground-shop">
        <Storefront
          slug="ground-shop"
          settings={{ ...settings, pickupEnabled: true }}
          products={[product]}
          path={path}
          paused={false}
          preview
        />
      </CommercePreviewProvider>
    );
    const view = render(content(["produto", product.id]));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Adicionar ao carrinho" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar ao carrinho" }),
    );
    await waitFor(() =>
      expect(screen.getByTitle("Carrinho")).toHaveTextContent("1"),
    );
    view.rerender(content(["checkout"]));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Concluir simulação" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Envie, enquadre e aprove",
    );
    expect(screen.queryByText("Simulação concluída")).not.toBeInTheDocument();
  });
});

function SeedPreview() {
  const preview = useCommercePreview()!;
  return (
    <button
      onClick={async () => {
        const id = await preview.upload(product.id, {
          fileName: "arte.png",
          mimeType: "image/png",
          fileSize: 3,
          dataUrl: "data:image/png;base64,YWJj",
        });
        await preview.prepare(id, {
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotationDegrees: 0,
        });
        await preview.approve(id);
        await preview.update([
          {
            id: crypto.randomUUID(),
            productId: product.id,
            quantity: 1,
            artworkName: "Arte 1",
            artworkId: id,
          },
        ]);
      }}
    >
      Preparar fixture
    </button>
  );
}
