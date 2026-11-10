import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  LibraryArtworkPicker,
  StoreLibrary,
} from "@/components/commerce/StoreLibrary";
import { CommerceLibraryAdmin } from "@/components/commerce/CommerceLibraryAdmin";
import {
  CommercePreviewProvider,
  useCommercePreview,
} from "@/components/commerce/CommercePreviewProvider";
import { storeRequest } from "@/components/commerce/store-http";
import type { LibraryResult } from "@/domain/commerce/library";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
const artId = "11111111-1111-4111-8111-111111111111",
  productId = "22222222-2222-4222-8222-222222222222";
const data: LibraryResult = {
  enabled: true,
  categories: [],
  campaigns: [],
  total: 1,
  page: 1,
  pageSize: 24,
  artworks: [
    {
      id: artId,
      title: "Flores da campanha",
      description: "Flores para personalizar",
      tags: [],
      category_id: null,
      status: "published",
      editable: true,
      version: "version",
      revision: 1,
      file_name: "flores.webp",
      width: 900,
      height: 900,
      campaign_ids: [],
      product_ids: [productId],
      license_note: "Arte própria de teste",
    },
  ],
};
beforeEach(() => {
  vi.mocked(storeRequest).mockResolvedValue(data);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe("art library customer and administration UX", () => {
  it("asks for explicit confirmation before copying a selected artwork", async () => {
    const selected = vi.fn().mockResolvedValue(undefined),
      close = vi.fn();
    vi.mocked(storeRequest).mockImplementation(async (_url, method) =>
      method === "POST" ? { artwork: { id: "session-art" } } : data,
    );
    render(
      <LibraryArtworkPicker
        slug="test"
        preview={false}
        productId={productId}
        onSelect={selected}
        onClose={close}
      />,
    );
    fireEvent.click(await screen.findByTitle("Ver Flores da campanha"));
    expect(
      vi.mocked(storeRequest).mock.calls.filter((call) => call[1] === "POST"),
    ).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Usar esta arte" }));
    await waitFor(() =>
      expect(selected).toHaveBeenCalledWith(
        "session-art",
        "Flores da campanha",
      ),
    );
    expect(storeRequest).toHaveBeenCalledWith(
      "/api/store/test/library/select",
      "POST",
      { artworkId: artId, productId },
    );
  });
  it("keeps selection errors in the same modal and preserves the chosen artwork", async () => {
    vi.mocked(storeRequest).mockImplementation(async (_url, method) => {
      if (method === "POST")
        throw new Error("Arte indisponível. Escolha outra opção.");
      return data;
    });
    render(
      <LibraryArtworkPicker
        slug="test"
        preview={false}
        productId={productId}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTitle("Ver Flores da campanha"));
    fireEvent.click(screen.getByRole("button", { name: "Usar esta arte" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Arte indisponível",
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Flores da campanha",
    );
    expect(
      screen.getByRole("button", { name: "Usar esta arte" }),
    ).toBeEnabled();
  });
  it("finds the exact artwork from a collection even if it is not on the first gallery page", async () => {
    render(
      <LibraryArtworkPicker
        slug="test"
        preview={false}
        productId={productId}
        initialArtworkId={artId}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await screen.findByTitle("Ver Flores da campanha");
    expect(
      new URL(
        `https://example.test${vi.mocked(storeRequest).mock.calls[0][0]}`,
      ).searchParams.get("artwork"),
    ).toBe(artId);
    fireEvent.click(screen.getByRole("button", { name: "Ver todas as artes" }));
    await waitFor(() =>
      expect(vi.mocked(storeRequest).mock.calls.length).toBe(2),
    );
    expect(
      new URL(
        `https://example.test${vi.mocked(storeRequest).mock.calls[1][0]}`,
      ).searchParams.has("artwork"),
    ).toBe(false);
  });
  it("keeps product links inside the private preview and never approves automatically", async () => {
    render(
      <StoreLibrary
        slug="test"
        base="/commerce/test/preview"
        preview
        initial={data}
        products={[
          {
            id: productId,
            name: "Botton 35 mm",
            description: "",
            category: "Bottons",
            imageUrl: "",
            unitCents: 500,
            offer: {
              originalUnitCents: 500,
              minimumUnitCents: 300,
              maxDiscountPercent: 40,
              discountQuantity: 10,
            },
            minQuantity: 1,
            maxQuantity: 1000,
            maxArtworks: 10,
            personalized: true,
            pricingRule: "per_art",
            geometry: null,
            margins: { bleedMm: 2, safeMarginMm: 2 },
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByTitle("Ver Flores da campanha"));
    expect(screen.getByRole("link", { name: "Botton 35 mm" })).toHaveAttribute(
      "href",
      `/commerce/test/preview/produto/${productId}?arte=${artId}`,
    );
    expect(
      vi.mocked(storeRequest).mock.calls.some((call) => call[1] === "POST"),
    ).toBe(false);
  });
  it("offers compact management tabs and upload instructions without URL fields", async () => {
    render(<CommerceLibraryAdmin products={[]} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enviar artes" }),
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Enviar artes para a biblioteca",
    );
    expect(screen.getByLabelText("Imagens da coleção")).toHaveAttribute(
      "multiple",
    );
    expect(screen.getByText(/3 MB por imagem/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enviar como rascunho" }),
    ).toBeDisabled();
    expect(screen.queryByLabelText(/URL/)).not.toBeInTheDocument();
  });
  it("copies library images only into temporary preview memory until the buyer approves", async () => {
    vi.mocked(storeRequest).mockResolvedValue({
      fileName: "flores.webp",
      mimeType: "image/webp",
      fileSize: 3,
      dataUrl: "data:image/webp;base64,YWJj",
      initialCrop: { scale: 0.8, offsetX: 0, offsetY: 0, rotationDegrees: 0 },
      editingAllowed: false,
    });
    function PreviewProbe() {
      const preview = useCommercePreview()!;
      return (
        <>
          <button onClick={() => void preview.chooseLibrary(artId, productId)}>
            Escolher
          </button>
          <output>{JSON.stringify(preview.cart.artworks)}</output>
        </>
      );
    }
    render(
      <CommercePreviewProvider slug="test">
        <PreviewProbe />
      </CommercePreviewProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Escolher" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("flores.webp"),
    );
    expect(screen.getByRole("status")).toHaveTextContent('"approved_at":null');
    expect(screen.getByRole("status")).toHaveTextContent(
      '"editing_allowed":false',
    );
    expect(storeRequest).toHaveBeenCalledWith(
      "/api/commerce/test/preview/library/select",
      "POST",
      { artworkId: artId, productId },
    );
  });
});
