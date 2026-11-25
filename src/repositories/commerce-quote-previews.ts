import { resolvePrintGeometry, resolvePrintMargins } from "@/domain/artwork/geometry";
import type { StoreItemPreview } from "@/domain/commerce/item-preview";
import { buyerQuotePdfVisuals } from "./commerce-quote-pdf";

export async function buyerQuoteItemPreviews(tenantId: string, customerId: string, quoteId: string): Promise<Record<string, StoreItemPreview>> {
  const visuals = await buyerQuotePdfVisuals(tenantId, customerId, quoteId);
  return Object.fromEntries([...visuals].map(([id, row]) => {
    const artwork = row.artworks?.[0];
    return [id, { imageUrl: row.product_image_url ?? "", geometry: resolvePrintGeometry(row), margins: resolvePrintMargins(row), model: row.product_mockup ?? undefined,
      ...(artwork ? { artwork: { id: artwork.id, approved: artwork.approval_status === "approved", version: artwork.approved_at ?? artwork.id } } : {}),
    }];
  }));
}
