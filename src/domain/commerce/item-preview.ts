import type { PrintGeometry, PrintMargins } from "@/domain/artwork/geometry";
import type { ProductMockup } from "./artwork-options";

export type StoreItemPreview = {
  imageUrl: string;
  geometry: PrintGeometry | null;
  margins: PrintMargins;
  model?: ProductMockup;
  artwork?: { id: string; approved: boolean; version: string };
};

export function cartItemPreview(
  product: { id: string; imageUrl: string; geometry: PrintGeometry | null; margins: PrintMargins; artworkOptions?: { mockup?: ProductMockup } },
  artwork?: { id: string; product_id: string; approved_at: string | null; preview_approved?: boolean; crop?: unknown },
): StoreItemPreview {
  return { imageUrl: product.imageUrl, geometry: product.geometry, margins: product.margins, model: product.artworkOptions?.mockup,
    ...(artwork?.product_id === product.id ? { artwork: { id: artwork.id, approved: artwork.preview_approved ?? Boolean(artwork.approved_at && artwork.crop), version: artwork.approved_at || JSON.stringify(artwork.crop ?? null) } } : {}),
  };
}

export function itemArtworkUrl(api: string, artwork: NonNullable<StoreItemPreview["artwork"]>, prepared = false, quoteId?: string) {
  const params = new URLSearchParams({ v: artwork.version, thumbnail: "1" });
  if (prepared) params.set("prepared", "1");
  if (quoteId) params.set("quoteId", quoteId);
  return `${api}/artworks/${encodeURIComponent(artwork.id)}?${params}`;
}
