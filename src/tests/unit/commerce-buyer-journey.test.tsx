import React from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { emptyContact } from "@/domain/commerce/checkout-draft";
import { useCheckoutDraft } from "@/components/commerce/use-checkout-draft";
import { storeRequest } from "@/components/commerce/store-http";
import { StoreCheckout } from "@/components/commerce/StoreCheckout";
import { buyerQuoteSchema } from "@/domain/commerce/buyer-quote";
import { pendingCartArtworks } from "@/domain/commerce/artwork-readiness";
import { prepareCircularArtwork } from "@/services/artwork/production";
import { testCommerceBilling } from "../fixtures/commerce-checkout";
vi.mock("@/components/commerce/store-http", () => ({ storeRequest: vi.fn(), storeMoney: (cents: number) => `R$ ${(cents / 100).toFixed(2)}` }));
const initial = { billing: emptyContact(), address: emptyContact(), same: true, delivery: "delivery" as const };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("private checkout draft", () => {
  it("restores, saves partial input, and never caches personal data in localStorage", async () => {
    const saved = { ...initial, billing: { ...emptyContact(), name: "Cliente salvo" } };
    vi.mocked(storeRequest).mockImplementation(async (_url, method) => method === "PUT" ? { version: 4 } : { draft: saved, version: 3 });
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useCheckoutDraft("/api/store/shop", false, initial));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.draft.billing.name).toBe("Cliente salvo");
    act(() => result.current.setDraft(current => ({ ...current, billing: { ...current.billing, street: "Rua parcial" } })));
    await act(async () => result.current.flush());
    expect(storeRequest).toHaveBeenCalledWith("/api/store/shop/checkout-draft", "PUT", expect.objectContaining({ version: 3, draft: expect.objectContaining({ billing: expect.objectContaining({ street: "Rua parcial" }) }) }));
    expect(storage).not.toHaveBeenCalled(); storage.mockRestore();
  });
  it("does not restore stale quotes, terms or payment tokens from a draft", async () => {
    vi.mocked(storeRequest).mockResolvedValue({ draft: { ...initial, acceptedTerms: true }, version: 1 });
    const { result } = renderHook(() => useCheckoutDraft("/api/store/shop", false, initial));
    await waitFor(() => expect(result.current.status).toMatch(/Não foi possível recuperar/));
    expect(result.current.ready).toBe(false);
  });
  it("does not write real buyer data from a preview", async () => {
    const { result } = renderHook(() => useCheckoutDraft("/api/commerce/shop/preview", true, initial));
    act(() => result.current.setDraft(current => ({ ...current, billing: { ...current.billing, name: "Somente prévia" } })));
    await act(async () => result.current.flush());
    expect(storeRequest).not.toHaveBeenCalled();
  });
  it("does not conceal save conflicts", async () => {
    vi.mocked(storeRequest).mockImplementation(async (_url, method) => {
      if (method === "PUT") throw new Error("Alterado em outra aba");
      return { draft: null, version: 0 };
    });
    const { result } = renderHook(() => useCheckoutDraft("/api/store/shop", false, initial));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setDraft(current => ({ ...current, billing: { ...current.billing, name: "Novo" } })));
    await act(async () => { await expect(result.current.flush()).rejects.toThrow("outra aba"); });
  });
});
describe("buyer quote and pending artwork contracts", () => {
  it("requires billing and delivery information but not artwork or a payment method", () => {
    expect(buyerQuoteSchema.safeParse({ requestId: crypto.randomUUID(), revision: 1, expectedTotalCents: 10000, billing: testCommerceBilling, address: null, deliveryAddressSameAsBilling: true, delivery: "not_included" }).success).toBe(true);
    expect(buyerQuoteSchema.safeParse({ requestId: crypto.randomUUID(), revision: 1, expectedTotalCents: 10000, billing: testCommerceBilling, address: null, deliveryAddressSameAsBilling: false, delivery: "not_included" }).success).toBe(false);
  });
  it("points to the specific missing or unapproved line without blocking team-prepared uploads", () => {
    const productId = crypto.randomUUID(), artId = crypto.randomUUID();
    const lines = [{ id: crypto.randomUUID(), productId, quantity: 2, artworkName: "A", artworkId: null }, { id: crypto.randomUUID(), productId, quantity: 1, artworkName: "B", artworkId: artId, preparation: "team" as const }];
    expect(pendingCartArtworks(lines, [{ id: productId, personalized: true, name: "Botton" }], [{ id: artId, approved_at: null }])).toEqual([{ lineId: lines[0].id, name: "Botton", artworkName: "A", reason: "Enviar arte" }]);
  });
  it("lets buyers create a quote without accepting a purchase or sending artwork", async () => {
    const submit = vi.fn(async () => {});
    render(<StoreCheckout intent="quote" preview api="/api/commerce/shop/preview" base="/commerce/shop/preview" disabled={false} onSubmit={submit}
      cart={{ customer: null, lines: [], artworks: [], revision: 1, calculation: { totalCents: 1000, items: [] }, payments: {} } as never}
      settings={{ pickupEnabled: false, carrierEnabled: false, deliveryEnabled: false } as never} artworkIssues={[{ lineId: "missing", name: "Botton", artworkName: "A", reason: "Enviar arte" }]}/>);
    fireEvent.click(screen.getByRole("button", { name: "Preencher dados de teste" }));
    expect(screen.queryByText(/Li e aceito/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revisar orçamento" }));
    await screen.findByRole("heading", { name: "Confira antes de salvar seu orçamento" });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Voltar aos dados e entrega" }));
    expect(screen.getByLabelText("Nome completo / Razão social")).toHaveValue("Cliente de teste");
    fireEvent.click(screen.getByRole("button", { name: "Revisar orçamento" }));
    await screen.findByRole("heading", { name: "Confira antes de salvar seu orçamento" });
    fireEvent.click(screen.getByRole("button", { name: "Salvar orçamento e acessar PDF" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ delivery: "not_included", billing: expect.objectContaining({ document: "52998224725" }) })));
  });
});
describe("artwork coverage distinguishes blank artwork from uncovered print regions", () => {
  it("accepts intentional opaque white and reports transparency and zoomed-out margins", async () => {
    const opaque = await sharp({ create: { width: 100, height: 100, channels: 4, background: "white" } }).png().toBuffer();
    const input = { dataUrl: `data:image/png;base64,${opaque.toString("base64")}`, diameterMm: 25, bleedMm: 2, safeMarginMm: 2, dpi: 150 };
    expect((await prepareCircularArtwork(input)).coverage.warning).toBe(false);
    const uncovered = await prepareCircularArtwork({ ...input, scale: 0.5 });
    expect(uncovered.coverage.warning).toBe(true); expect(uncovered.coverage.uncoveredPercent).toBeGreaterThan(50);
    const transparent = await sharp({ create: { width: 100, height: 100, channels: 4, background: "#ffffff00" } }).png().toBuffer();
    expect((await prepareCircularArtwork({ ...input, dataUrl: `data:image/png;base64,${transparent.toString("base64")}` })).coverage.warning).toBe(true);
  });
});
