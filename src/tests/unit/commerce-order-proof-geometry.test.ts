// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { geometryHash, type CommerceOrder, type CommerceProduct } from "@/repositories/commerce";
import { assertCommerceProofsReady } from "@/services/commerce/order-artworks";

afterEach(() => vi.clearAllMocks());
describe("customer-approved proof imported at checkout", () => {
  it("does not invalidate approval just because JSONB reordered geometry fields", async () => {
    const original = {
      geometry: { shape: "circle", widthMm: 35, heightMm: 35, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true },
      margins: { bleedMm: 2, safeMarginMm: 3 }
    } as CommerceProduct;
    const stored = { ...original, id: "product", personalized: true, geometry: Object.fromEntries(Object.entries(original.geometry!).reverse()), margins: { safeMarginMm: 3, bleedMm: 2 } } as CommerceProduct;
    const order = { tenant_id: "tenant", id: "order", snapshot: { lines: [{ id: "line", productId: "product" }], products: [stored] } } as CommerceOrder;
    const query = vi.fn().mockResolvedValue({ rows: [{ line_id: "line", prepared_path: "prepared.png", approved_at: new Date(), crop: { geometryHash: geometryHash(original) } }] });
    await expect(assertCommerceProofsReady({ query } as never, order)).resolves.toBeUndefined();
    stored.margins = { ...stored.margins, bleedMm: 5 };
    await expect(assertCommerceProofsReady({ query } as never, order)).rejects.toMatchObject({ status: 409 });
  });
});
