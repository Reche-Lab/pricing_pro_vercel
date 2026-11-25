import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreItemThumbnail } from "@/components/commerce/StoreItemThumbnail";
import { cartItemPreview, itemArtworkUrl, type StoreItemPreview } from "@/domain/commerce/item-preview";
import { drawProductMockup } from "@/components/commerce/StoreProductMockup";
import { useCommercePreview } from "@/components/commerce/CommercePreviewProvider";

vi.mock("@/components/commerce/StoreProductMockup", () => ({ drawProductMockup: vi.fn() }));
vi.mock("@/components/commerce/CommercePreviewProvider", () => ({ useCommercePreview: vi.fn() }));
const preview: StoreItemPreview = {
  imageUrl: "https://cdn.example.test/product.png", geometry: { shape: "circle", widthMm: 35, heightMm: 35, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true },
  margins: { safeMarginMm: 2, bleedMm: 3 }, artwork: { id: "art", approved: true, version: "version1" },
};
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(useCommercePreview).mockReturnValue(null);
  vi.mocked(drawProductMockup).mockImplementation(async canvas => { canvas.width = 160; canvas.height = 160; });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("cart and quote thumbnails", () => {
  it("renders the approved front with the shared model at thumbnail resolution, hiding the original", async () => {
    render(<StoreItemThumbnail name="Botton" preview={preview} api="/api/store/shop"/>);
    const canvas = await screen.findByRole("img", { name: "Produto com arte aprovada: Botton" });
    expect(canvas.tagName).toBe("CANVAS"); expect(canvas).toBeVisible();
    expect(drawProductMockup).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), expect.stringContaining("prepared=1"), preview.geometry, preview.margins, expect.anything(), "front", undefined, false, 160);
    expect(screen.getByAltText("Produto com arte aprovada: Botton")).not.toBeVisible();
  });
  it("uses the original before approval and falls back to the product photo if it is unavailable", () => {
    render(<StoreItemThumbnail name="Botton" preview={{ ...preview, artwork: { ...preview.artwork!, approved: false } }} api="/api/store/shop"/>);
    const image = screen.getByRole("img", { name: "Arte original: Botton" });
    expect(image).toHaveAttribute("src", expect.stringContaining("thumbnail=1"));
    expect(image.getAttribute("src")).not.toContain("prepared=1"); expect(drawProductMockup).not.toHaveBeenCalled();
    fireEvent.error(image);
    expect(screen.getByRole("img", { name: "Imagem do produto: Botton" })).toHaveAttribute("src", preview.imageUrl);
  });
  it("uses the product when no artwork exists and retains the reserved size for a broken photo", () => {
    const { container } = render(<StoreItemThumbnail name="Botton" preview={{ ...preview, artwork: undefined }} api="/api/store/shop" size={80}/>);
    fireEvent.error(screen.getByRole("img", { name: "Imagem do produto: Botton" }));
    expect(screen.getByLabelText("Imagem indisponível: Botton")).toBeVisible();
    expect(container.firstElementChild).toHaveStyle({ width: "80px", height: "80px" });
    expect(drawProductMockup).not.toHaveBeenCalled();
  });
  it("keeps the original when the optional product model cannot load", async () => {
    vi.mocked(drawProductMockup).mockRejectedValue(new Error("Model unavailable"));
    render(<StoreItemThumbnail name="Botton" preview={preview} api="/api/store/shop"/>);
    await waitFor(() => expect(drawProductMockup).toHaveBeenCalledOnce());
    expect(screen.getByRole("img", { name: "Arte original: Botton" })).toBeVisible();
  });
  it("ignores late render results after switching the artwork", async () => {
    let finish!: () => void;
    vi.mocked(drawProductMockup).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const view = render(<StoreItemThumbnail name="Botton" preview={preview} api="/api/store/shop"/>);
    await waitFor(() => expect(drawProductMockup).toHaveBeenCalledOnce());
    view.rerender(<StoreItemThumbnail name="Botton" preview={{ ...preview, artwork: { id: "new-art", approved: false, version: "new" } }} api="/api/store/shop"/>);
    await act(async () => finish());
    expect(screen.getByRole("img", { name: "Arte original: Botton" })).toHaveAttribute("src", expect.stringContaining("new-art"));
    expect(screen.queryByRole("img", { name: "Produto com arte aprovada: Botton" })).not.toBeInTheDocument();
  });
  it("uses memory-only artwork in the private store preview, not live customer endpoints", async () => {
    vi.mocked(useCommercePreview).mockReturnValue({ getArtwork: () => ({ source: { dataUrl: "data:image/png;base64,b3JpZ2luYWw=" }, preparedUrl: "data:image/png;base64,cHJlcGFyZWQ=" }) } as never);
    render(<StoreItemThumbnail name="Botton" preview={preview} api="/api/commerce/shop/preview"/>);
    await screen.findByRole("img", { name: "Produto com arte aprovada: Botton" });
    expect(vi.mocked(drawProductMockup).mock.calls[0][1]).toBe("data:image/png;base64,cHJlcGFyZWQ=");
  });
});

describe("safe line-specific thumbnail selection", () => {
  const product = { id: "product", ...preview, artworkOptions: undefined };
  it("does not confuse artwork from another product or an invalidated approval", () => {
    const art = { id: "art", product_id: "other", approved_at: "today", crop: {} };
    expect(cartItemPreview(product, art).artwork).toBeUndefined();
    expect(cartItemPreview(product, { ...art, product_id: "product", preview_approved: false }).artwork?.approved).toBe(false);
  });
  it("uses same-origin authenticated thumbnail URLs with quote ownership context, never storage paths", () => {
    const url = itemArtworkUrl("/api/store/shop", preview.artwork!, true, "saved-quote");
    expect(url).toContain("thumbnail=1"); expect(url).toContain("prepared=1"); expect(url).toContain("quoteId=saved-quote"); expect(url).not.toContain("storage");
  });
});
