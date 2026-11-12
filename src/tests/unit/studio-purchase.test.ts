import { describe, expect, it, vi } from "vitest";
import { saveStudioPurchase } from "@/components/commerce/studio-purchase";
const file = { dataUrl: "data:image/png;base64,YQ==", mimeType: "image/png", fileSize: 1, fileName: "arte-estudio.png" };
describe("studio purchase handoff", () => {
  it("uses the tenant's existing session/upload/preparation without approving or changing the cart", async () => {
    const request = vi.fn(async (url: string) => url.endsWith("/artworks") ? { artwork: { id: "saved-art" } } : {});
    const progress = { artworkId: null as string | null, prepared: false };
    expect(await saveStudioPurchase({ slug: "shop", productId: "product", file, progress, request })).toBe("saved-art");
    expect(request.mock.calls.map(call => call[0])).toEqual(["/api/store/shop/cart", "/api/store/shop/artworks", "/api/store/shop/artworks/saved-art"]);
    expect(request).toHaveBeenLastCalledWith("/api/store/shop/artworks/saved-art", "POST", { action: "prepare", scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 });
    expect(progress).toEqual({ artworkId: "saved-art", prepared: true });
  });
  it("reuses a successful upload after preparation fails instead of creating another version", async () => {
    let fail = true;
    const request = vi.fn(async (url: string) => {
      if (url.endsWith("/saved-art") && fail) { fail = false; throw new Error("Falha temporária"); }
      return url.endsWith("/artworks") ? { artwork: { id: "saved-art" } } : {};
    });
    const progress = { artworkId: null as string | null, prepared: false };
    const input = { slug: "shop", productId: "product", file, progress, request };
    await expect(saveStudioPurchase(input)).rejects.toThrow("Falha temporária");
    await expect(saveStudioPurchase(input)).resolves.toBe("saved-art");
    expect(request.mock.calls.filter(call => call[0].endsWith("/artworks"))).toHaveLength(1);
  });
  it("keeps simulated artworks in the preview provider and never calls buyer endpoints", async () => {
    const request = vi.fn();
    const preview = { upload: vi.fn(async () => "temporary-art"), prepare: vi.fn(async () => {}) };
    const progress = { artworkId: null as string | null, prepared: false };
    await saveStudioPurchase({ slug: "shop", productId: "product", file, progress, request, preview });
    expect(preview.upload).toHaveBeenCalledWith("product", file);
    expect(preview.prepare).toHaveBeenCalledWith("temporary-art", { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 });
    expect(request).not.toHaveBeenCalled();
  });
});
