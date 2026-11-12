import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceOrderArtworks } from "@/components/commerce/CommerceOrderArtworks";
import { StoreArtworkTools } from "@/components/commerce/StoreArtworkTools";
import { storeRequest } from "@/components/commerce/store-http";
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/commerce/StoreProductMockup", () => ({ StoreProductMockup: () => <div>Prévia do acabamento</div> }));
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn() }));
const product = {
  id: "8c82b392-f45e-4c87-82d1-c0c3eea5da14", name: "Botton", description: "", category: "", imageUrl: "",
  minQuantity: 1, maxQuantity: 100, maxArtworks: 3, personalized: true, pricingRule: "per_art" as const,
  geometry: { shape: "circle" as const, widthMm: 35, heightMm: 35, cornerStyle: "sharp" as const, cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true }, margins: { bleedMm: 2, safeMarginMm: 2 }, unitCents: 500,
  artworkOptions: { allowTeamPreparation: true, discountFixedCents: 150, maxDiscountPercent: 10 },
  offer: { originalUnitCents: 500, minimumUnitCents: 500, maxDiscountPercent: 0, discountQuantity: 1 },
};
const proof = { product, lineId: crypto.randomUUID(), revision: 3, prepared: true, approvedAt: null, crop: null, quantity: 10, artworkName: "Logo da empresa" };
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe("store preparation and proof approval", () => {
  it.each(["Ground Shop", "Outra loja"])("names %s in staff preparation without changing the selection behavior", async (storeName) => {
    const change = vi.fn();
    render(<StoreArtworkTools slug="shop" storeName={storeName} product={product} artworks={[]} preparation="team" onPreparationChange={change} onSelect={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByLabelText(`Prefiro que a ${storeName} faça os ajustes finais`)).toBeChecked();
    fireEvent.click(screen.getByLabelText(/Quero preparar e aprovar/));
    expect(change).toHaveBeenCalledWith("customer");
    expect(screen.getByText(/Benefício de até/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Quero preparar e aprovar/)).toBeEnabled());
  });
  it("requires explicit confirmation and sends the reviewed revision", async () => {
    vi.mocked(storeRequest).mockImplementation(async (_url, method) => method === "POST" ? { revision: 3 } : { proofs: [proof], editable: true });
    render(<CommerceOrderArtworks endpoint="/api/store/shop/orders/order/artworks" />);
    fireEvent.click(screen.getByRole("button", { name: "Minhas artes e aprovação" }));
    fireEvent.click(await screen.findByRole("button", { name: "Visualizar prova" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revisar e aprovar esta versão" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("versão 3");
    expect(vi.mocked(storeRequest).mock.calls.some(([, method]) => method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aprovação" }));
    await screen.findByText("Arte aprovada para impressão.");
    expect(storeRequest).toHaveBeenCalledWith("/api/store/shop/orders/order/artworks", "POST", { action: "approve", lineId: proof.lineId, revision: 3 });
  });
  it("keeps a failed approval visible inside the confirmation", async () => {
    vi.mocked(storeRequest).mockImplementation(async (_url, method) => { if (method === "POST") throw new Error("A prova mudou. Atualize e revise."); return { proofs: [proof], editable: true }; });
    render(<CommerceOrderArtworks endpoint="/proofs" />);
    fireEvent.click(screen.getByRole("button", { name: "Minhas artes e aprovação" }));
    fireEvent.click(await screen.findByRole("button", { name: "Visualizar prova" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revisar e aprovar esta versão" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aprovação" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("A prova mudou."));
    expect(screen.queryByText("Arte aprovada para impressão.")).not.toBeInTheDocument();
  });
});
