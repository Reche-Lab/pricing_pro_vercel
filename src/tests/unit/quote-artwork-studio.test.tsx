import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuoteArtworkGuidedStudio } from "@/components/quotes/QuoteArtworkGuidedStudio";
import type { ArtworkGuidedStudio } from "@/components/quotes/ArtworkGuidedStudio";
import type { QuoteItemArtworkRow, QuoteItemRow } from "@/repositories/quotes";
const capture = vi.hoisted(() => ({ props: null as React.ComponentProps<typeof ArtworkGuidedStudio> | null }));
vi.mock("@/components/quotes/ArtworkGuidedStudio", () => ({ ArtworkGuidedStudio: (props: React.ComponentProps<typeof ArtworkGuidedStudio>) => { capture.props = props; return null; } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const row = { id: "original", file_name: "arte.png", artwork_name: "Arte 1", crop_scale: "1", print_width_mm: 35, print_height_mm: 35, print_bleed_mm: 3, print_safe_margin_mm: 1.5, approval_status: "pending" } as unknown as QuoteItemArtworkRow;
const item = { id: "item", quantity: 12, description: "Botton", print_width_mm: 35, print_height_mm: 35 } as unknown as QuoteItemRow;
const file = { fileName: "nova.webp", mimeType: "image/webp" as const, fileSize: 3, dataUrl: "data:image/webp;base64,YWJj" };
describe("quote studio adapters", () => {
  for (const token of [undefined, "public-token"]) it(`uses ${token ? "public" : "admin"} APIs with the latest artwork ID and preserves copies`, async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ artwork: { ...row, id: "retouched", file_name: "nova.webp" } }) })
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetch);
    const props = { quoteId: "quote", item, artwork: row, token, productionQuantity: 7, initialStep: "crop" as const, onClose: vi.fn(), onChanged: vi.fn() };
    const view = render(<QuoteArtworkGuidedStudio {...props} />);
    const base = token ? "/api/public/quotes/public-token/items/item/artworks" : "/api/quotes/quote/items/item/artworks";
    const current = capture.props!.initialAsset;
    expect(current.margins).toEqual({ bleedMm: 3, safeMarginMm: 1.5 });
    const edited = await capture.props!.onRetouch(current, file);
    expect(fetch.mock.calls[0][0]).toBe(base);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ parentArtworkId: "original", productionQuantity: 7, sourceKind: "retouch" });
    view.rerender(<QuoteArtworkGuidedStudio {...props} productionQuantity={12} />);
    const prepared = await capture.props!.onPrepare(edited, { scale: 1.2, offsetX: 0.1, offsetY: 0, rotationDegrees: 0 });
    expect(fetch.mock.calls[1][0]).toBe(`${base}/retouched/prepare`);
    expect(prepared.preparedUrl).toContain("retouched");
    await capture.props!.onApprove(prepared);
    expect(fetch.mock.calls[2][0]).toBe(`${base}/retouched/approval`);
    expect(fetch.mock.calls[2][1].body).toBe(token ? undefined : JSON.stringify({ status: "approved", productionQuantity: 7 }));
  });
  it("does not announce success when the quote is locked or the link expired", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Orçamento indisponível para alterações" }) }));
    const onChanged = vi.fn();
    render(<QuoteArtworkGuidedStudio quoteId="quote" item={item} artwork={row} token="expired" productionQuantity={1} initialStep="crop" onClose={vi.fn()} onChanged={onChanged} />);
    await expect(capture.props!.onApprove(capture.props!.initialAsset)).rejects.toThrow("Orçamento indisponível");
    expect(onChanged).not.toHaveBeenCalled();
  });
});
