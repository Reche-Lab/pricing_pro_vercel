import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreArtworkTools } from "@/components/commerce/StoreArtworkTools";
import type { ArtworkGuidedStudio } from "@/components/quotes/ArtworkGuidedStudio";
import { storeRequest } from "@/components/commerce/store-http";
vi.mock("next/dynamic", () => ({ default: () => function Studio(props: React.ComponentProps<typeof ArtworkGuidedStudio>) {
  const [complete, setComplete] = useState(false), [error, setError] = useState("");
  return <div>{complete ? props.renderApprovalSuccess?.(props.initialAsset) : <button onClick={() => void props.onApprove(props.initialAsset).then(() => setComplete(true)).catch(e => setError(e.message))}>Confirmar aprovação em teste</button>}{error ? <p role="alert">{error}</p> : null}</div>;
} }));
vi.mock("@/components/commerce/store-http", async original => ({ ...await original<typeof import("@/components/commerce/store-http")>(), storeRequest: vi.fn() }));
const product = {
  id: "8c82b392-f45e-4c87-82d1-c0c3eea5da14", name: "Botton", description: "", category: "", imageUrl: "",
  minQuantity: 1, maxQuantity: 100, maxArtworks: 5, personalized: true, pricingRule: "per_art" as const,
  geometry: null, margins: { bleedMm: 2, safeMarginMm: 2 }, unitCents: 500,
  artworkOptions: { allowTeamPreparation: true, discountFixedCents: 1000, maxDiscountPercent: 10 },
  offer: { originalUnitCents: 500, minimumUnitCents: 500, maxDiscountPercent: 0, discountQuantity: 1 },
};
const artwork = { id: "df970f73-c33b-43ca-8779-f63b7bdbef3b", product_id: product.id, file_name: "arte.webp", approved_at: null, crop: { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 } };
const lines = [{ id: "c4e541eb-f70b-4e9b-b298-bd24928880bc", productId: product.id, artworkId: artwork.id, artworkName: "Arte 1", quantity: 10 }];
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.mocked(storeRequest).mockResolvedValue({ ok: true, newlyApproved: true, artworkDiscountCents: 500 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function show(onRefresh = vi.fn(async () => {})) {
  render(<StoreArtworkTools slug="shop" product={product} artwork={artwork} artworks={[artwork]} onRefresh={onRefresh} onSelect={vi.fn()} pricingLines={lines} benefitContext="cart" />);
  fireEvent.click(screen.getByRole("button", { name: "Aprovar arte" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar aprovação em teste" }));
}
describe("buyer approval celebration wiring", () => {
  it("celebrates the actual capped benefit rather than the advertised maximum", async () => {
    show();
    expect(await screen.findByRole("status")).toHaveTextContent("Você ganhou R$ 5,00");
    expect(screen.queryByText(/10,00/)).not.toBeInTheDocument();
    expect(storeRequest).toHaveBeenCalledWith(`/api/store/shop/artworks/${artwork.id}`, "POST", { action: "approve", lines });
  });
  it("does not launch confetti again for an already approved art", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ ok: true, newlyApproved: false, artworkDiscountCents: 500 });
    show();
    expect(await screen.findByRole("status")).toHaveTextContent("Seu desconto:");
    expect(document.querySelector("[data-artwork-confetti]")).toBeNull();
  });
  it("does not announce approval or a reward when the operation fails", async () => {
    vi.mocked(storeRequest).mockRejectedValue(new Error("Não foi possível aprovar"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível aprovar");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.querySelector("[data-artwork-confetti]")).toBeNull();
  });
  it("does not lose an approval if refreshing the cart fails afterward", async () => {
    show(vi.fn().mockRejectedValue(new Error("Sem conexão")));
    expect(await screen.findByRole("status")).toHaveTextContent("Sua aprovação foi salva");
  });
});
