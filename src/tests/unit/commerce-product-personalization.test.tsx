import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreArtworkTools } from "@/components/commerce/StoreArtworkTools";
import { Storefront } from "@/components/commerce/Storefront";
import { CommercePreviewProvider, useCommercePreview } from "@/components/commerce/CommercePreviewProvider";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
import { storeRequest } from "@/components/commerce/store-http";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/dynamic", () => ({ default: (loader: () => unknown) => function Tools(props: React.ComponentProps<typeof StoreArtworkTools>) {
  return String(loader).includes("StoreArtworkTools") ? <StoreArtworkTools {...props} /> : null;
} }));
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn(), storeMoney: (cents: number) => `R$ ${(cents / 100).toFixed(2)}` }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const settings = storeSettingsSchema.parse({ name: "Loja teste", description: "", logoUrl: "", bannerUrl: "", accent: "#047857",
  contactEmail: "test@example.test", contactPhone: "", pickupEnabled: false, pickupAddress: "", deliveryEnabled: false,
  deliveryCents: 0, deliveryDescription: "", terms: "Condições de compra" });
const product = {
  id: "8c82b392-f45e-4c87-82d1-c0c3eea5da14", name: "Botton personalizado", description: "", category: "Bottons", imageUrl: "/produto.png",
  minQuantity: 1, maxQuantity: 100, maxArtworks: 5, personalized: true, pricingRule: "per_art" as const,
  geometry: null, margins: { bleedMm: 0, safeMarginMm: 0 }, unitCents: 100,
  offer: { originalUnitCents: 100, minimumUnitCents: 100, maxDiscountPercent: 0, discountQuantity: 1 }
};
const artwork = { id: "df970f73-c33b-43ca-8779-f63b7bdbef3b", product_id: product.id, file_name: "arte.png", crop: null, approved_at: null };
const calculation = (body: unknown) => ({ totalCents: 2000, items: (body as { lines: unknown[] }).lines.map(() => ({ unitCents: 100 })) });
function PreviewCartProbe() {
  const simulation = useCommercePreview();
  return <output aria-label="Itens simulados">{JSON.stringify(simulation?.cart.lines)}</output>;
}
function show(preview = false, personalized = true, geometry: import("@/domain/artwork/geometry").PrintGeometry | null = null) {
  const page = <Storefront slug="shop" settings={settings} products={[{ ...product, personalized, geometry }]} path={["produto", product.id]} paused={false} preview={preview} />;
  return render(preview ? <CommercePreviewProvider slug="shop">{page}<PreviewCartProbe /></CommercePreviewProvider> : page);
}

describe("product artwork and cart confirmation", () => {
  it.each([false, true])("offers the configured SVG guide before choosing quantities or uploading (preview: %s)", async preview => {
    vi.mocked(storeRequest).mockImplementation(async (url, _method, body) => url.endsWith("/price") ? calculation(body) : { revision: 0, lines: [], artworks: [], customer: null, calculation: null });
    const geometry = { shape: "circle" as const, widthMm: 35, heightMm: 35, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true };
    const view = show(preview, true, geometry);
    await act(async () => Promise.resolve());
    expect(screen.getByRole("link", { name: "Baixar guia SVG" })).toHaveAttribute("download", "guia-botton-personalizado-35x35mm.svg");
    view.unmount();
    show(preview, false, geometry);
    await act(async () => Promise.resolve());
    expect(screen.queryByRole("link", { name: "Baixar guia SVG" })).not.toBeInTheDocument();
  });

  it("uploads before adding and persists the selected artwork in the buyer cart", async () => {
    let uploaded = false;
    vi.mocked(storeRequest).mockImplementation(async (url, method, body) => {
      if (url.endsWith("/price")) return calculation(body);
      if (url.endsWith("/artworks")) { uploaded = true; return { artwork }; }
      if (method === "PUT") return { ok: true };
      return { revision: 0, lines: [], artworks: uploaded ? [artwork] : [], customer: null, calculation: null };
    });
    show();
    await waitFor(() => expect(screen.getByRole("button", { name: "Adicionar ao carrinho" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Quantidade de produtos"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar sua arte/ }));
    fireEvent.change(screen.getByLabelText("Enviar arte 1"), { target: { files: [new File(["image"], "arte.png", { type: "image/png" })] } });
    await screen.findByAltText("arte.png");
    await waitFor(() => expect(screen.getByRole("button", { name: "Adicionar ao carrinho" })).toBeEnabled());
    expect(vi.mocked(storeRequest).mock.calls.some(([, method]) => method === "PUT")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao carrinho" }));
    await screen.findByText("Produto adicionado ao carrinho");
    const call = vi.mocked(storeRequest).mock.calls.find(([, method]) => method === "PUT")!;
    expect(call[2]).toMatchObject({ lines: [{ productId: product.id, quantity: 20, artworkId: artwork.id, artworkName: "Arte 1" }] });
    expect(screen.getByLabelText("Quantidade de produtos")).toHaveValue("");
    expect(screen.getByLabelText("Quantidade de artes")).toHaveValue("");
    expect(screen.getByRole("link", { name: "Ver carrinho" })).toHaveAttribute("href", "/loja/shop/carrinho");
    fireEvent.click(screen.getByRole("button", { name: "Fechar confirmação" }));
    expect(screen.queryByText("Produto adicionado ao carrinho")).not.toBeInTheDocument();
  });

  it("keeps separate artwork assignments for multiple groups in preview", async () => {
    vi.mocked(storeRequest).mockImplementation(async (url, _method, body) => url.endsWith("/artworks")
      ? { ...(body as object), mimeType: "image/webp", dataUrl: "data:image/webp;base64,aQ==" }
      : calculation(body));
    show(true);
    fireEvent.change(screen.getByLabelText("Quantidade de produtos"), { target: { value: "21" } });
    fireEvent.change(screen.getByLabelText("Quantidade de artes"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar sua arte/ }));
    fireEvent.change(screen.getByLabelText("Enviar arte 1"), { target: { files: [new File(["image"], "primeira.png", { type: "image/png" })] } });
    await screen.findByAltText("primeira.png");
    fireEvent.change(screen.getByLabelText("Enviar arte 2"), { target: { files: [new File(["image"], "segunda.png", { type: "image/png" })] } });
    await screen.findByAltText("segunda.png");
    expect(screen.getByLabelText("Itens simulados")).toHaveTextContent("[]");
    await waitFor(() => expect(screen.getByRole("button", { name: "Adicionar ao carrinho" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao carrinho" }));
    await screen.findByText("Produto adicionado ao carrinho");
    const lines = JSON.parse(screen.getByLabelText("Itens simulados").textContent!);
    expect(lines.map((line: { quantity: number }) => line.quantity)).toEqual([11, 10]);
    expect(lines[0].artworkId).toBeTruthy();
    expect(lines[1].artworkId).toBeTruthy();
    expect(lines[0].artworkId).not.toBe(lines[1].artworkId);
    expect(vi.mocked(storeRequest).mock.calls.every(([url]) => url.startsWith("/api/commerce/shop/preview/"))).toBe(true);
  });

  it("retains the selection and never shows success when adding fails", async () => {
    vi.mocked(storeRequest).mockImplementation(async (url, method, body) => {
      if (url.endsWith("/price")) return calculation(body);
      if (method === "PUT") throw new Error("O carrinho mudou. Tente novamente.");
      return { revision: 0, lines: [], artworks: [artwork], customer: null, calculation: null };
    });
    show();
    fireEvent.change(screen.getByLabelText("Quantidade de produtos"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar sua arte/ }));
    fireEvent.change(await screen.findByLabelText("Versão da arte"), { target: { value: artwork.id } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Adicionar ao carrinho" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao carrinho" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Quantidade de produtos")).toHaveValue("20");
    expect(screen.getByLabelText("Versão da arte")).toHaveValue(artwork.id);
    expect(screen.queryByText("Produto adicionado ao carrinho")).not.toBeInTheDocument();
  });

  it("blocks duplicate cart submissions while waiting for confirmation", async () => {
    let finish!: (data: unknown) => void;
    vi.mocked(storeRequest).mockImplementation(async (url, method, body) => {
      if (url.endsWith("/price")) return calculation(body);
      if (method === "PUT") return new Promise(resolve => { finish = resolve; });
      return { revision: 0, lines: [], artworks: [], customer: null, calculation: null };
    });
    show(false, false);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adicionar ao carrinho" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: /Adicionar sua arte/ })).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Adicionar ao carrinho" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Adicionando..." })).toBeDisabled();
    expect(screen.getByLabelText("Quantidade de produtos")).toHaveValue("1");
    expect(vi.mocked(storeRequest).mock.calls.filter(([, method]) => method === "PUT")).toHaveLength(1);
    await act(async () => finish({ ok: true }));
    await screen.findByText("Produto adicionado ao carrinho");
    expect(screen.getByLabelText("Quantidade de produtos")).toHaveValue("");
  });
});
