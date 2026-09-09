import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuoteItemEditPanel, type QuoteEditPricingContext, type QuoteEditVariant } from "@/components/quotes/QuoteEditPanel";
import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const quote = { id: "quote", status: "draft", subtotal: "20", shipping_total: "5", discount_total: "0", valid_until: "2026-10-01" } as QuoteDetail;
const items: QuoteItemRow[] = [{ id: "item-one", product_variant_id: "variant", description: "Botton", quantity: 2, unit_price: "10", total_price: "20" }];
const context: QuoteEditPricingContext = { platform: { commissionRate: 0, fixedFee: 0, sellerShippingCost: 0, sellerShippingThreshold: 0 }, itemCurves: {} };
const variants: QuoteEditVariant[] = [{ id: "variant", label: "Botton 35 mm", sku: "BT35", externalOlistProductId: null, unitCost: 1, curve: { mode: "interpolated", points: [{ quantity: 1, unitPrice: 10 }, { quantity: 10, unitPrice: 5 }] } }];
function show(currentItems = items, currentQuote = quote) {
  return render(<QuoteItemEditPanel quote={currentQuote} items={currentItems} variants={variants} pricingContext={context} />);
}
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("quote products editor", () => {
  it("adds a product with curve pricing and preserves existing items", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetcher);
    show();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar produto" }));
    expect(screen.getByLabelText("Preço unitário")).toHaveValue(10);
    fireEvent.change(screen.getByLabelText("Qtd."), { target: { value: "10" } });
    expect(screen.getByLabelText("Preço unitário")).toHaveValue(5);
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Produto adicionado.");
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.expectedItemIds).toEqual(["item-one"]);
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0].id).toBe("item-one");
    expect(payload.items[1]).toMatchObject({ productVariantId: "variant", quantity: 10, unitPrice: 5, priceManuallyEdited: false });
    expect(payload.items[1].id).toBeUndefined();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("requires a reason for a manually priced new product", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    show();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar produto" }));
    fireEvent.change(screen.getByLabelText("Preço unitário"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe o motivo");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("confirms removal, retains other items, and prevents removal of the last item", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetcher);
    const view = show();
    expect(screen.getByRole("button", { name: "Remover produto Botton" })).toBeDisabled();
    view.unmount();
    show([...items, { ...items[0], id: "item-two", description: "Espelho" }]);
    fireEvent.click(screen.getByRole("button", { name: "Remover produto Botton" }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByText(/As artes vinculadas/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar remoção" }));
    await screen.findByText("Produto removido.");
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.items.map((item: { id: string }) => item.id)).toEqual(["item-two"]);
    expect(payload.expectedItemIds).toEqual(["item-one", "item-two"]);
  });

  it("keeps the new draft visible when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    show();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar produto" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Verifique sua conexão"));
    expect(screen.getByRole("combobox", { name: /^Produto/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeEnabled();
  });

  it.each([{ ...quote, status: "accepted" }, { ...quote, external_olist_invoice_id: "123" }] as QuoteDetail[])("blocks structural edits on locked quotes", locked => {
    show(items, locked);
    expect(screen.queryByRole("button", { name: "Adicionar produto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover produto Botton" })).not.toBeInTheDocument();
  });
});
