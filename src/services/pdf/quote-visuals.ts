import { resolvePrintGeometry, resolvePrintMargins } from "@/domain/artwork/geometry";
import { commerceArtworkOptionsSchema } from "@/domain/commerce/artwork-options";
import { resolveQuotePdfArtworkAsset, quotePdfArtworkVariantLabel, type QuotePdfArtworkVariant } from "@/domain/quotes/pdf-artwork";
import type { QuoteItemRow } from "@/repositories/quotes";
import { loadArtworkDataUrl } from "@/services/storage/artwork-storage";
import { pdfImagePng } from "./pdf-images";
import { renderPdfProductMockup } from "./product-mockup";

export type QuotePdfVisual = { title: string; artworkName?: string | null; label: string; images: Array<{ bytes: Buffer; label: string }>; illustrative: boolean };
export async function quotePdfItemVisuals(item: QuoteItemRow, variant: QuotePdfArtworkVariant, view: "front" | "both"): Promise<QuotePdfVisual[]> {
  const all = item.artworks ?? [], active = all.filter(art => art.is_active !== false);
  const visuals: QuotePdfVisual[] = [];
  for (const artwork of active) {
    const asset = resolveQuotePdfArtworkAsset(artwork, all, variant);
    const data = await loadArtworkDataUrl(asset.dataUrl, asset.storagePath).catch(() => null);
    const geometry = resolvePrintGeometry({ ...item, ...artwork });
    const margins = resolvePrintMargins({ ...item, ...artwork });
    const model = commerceArtworkOptionsSchema.shape.mockup.safeParse(item.product_mockup ?? undefined);
    if (asset.effectiveVariant === "product" && data && geometry) {
      try {
        const front = await renderPdfProductMockup(data, geometry, margins, model.success ? model.data : undefined);
        const back = view === "both" && model.success && model.data ? await renderPdfProductMockup(data, geometry, margins, model.data, "back").catch(() => null) : null;
        if (front) {
          visuals.push({ title: item.description, artworkName: artwork.artwork_name ?? item.artwork_name,
            label: "Produto com arte aprovada", images: [{ bytes: front, label: "Frente" }, ...(back ? [{ bytes: back, label: "Verso" }] : [])], illustrative: true });
          continue;
        }
      } catch { /* A missing optional model must not prevent downloading the quote. */ }
    }
    // An unapproved or unavailable mockup uses the original, never an unapproved crop.
    const fallback = asset.effectiveVariant === "product" ? resolveQuotePdfArtworkAsset(artwork, all, "original") : asset;
    const original = fallback === asset ? data : await loadArtworkDataUrl(fallback.dataUrl, fallback.storagePath).catch(() => null);
    const image = await pdfImagePng(original);
    if (image) visuals.push({ title: item.description, artworkName: artwork.artwork_name ?? item.artwork_name,
      label: `Arte ${quotePdfArtworkVariantLabel(fallback.effectiveVariant).toLowerCase()}${artwork.approval_status !== "approved" ? " · aprovação pendente" : ""}`,
      images: [{ bytes: image, label: "Arte" }], illustrative: false });
  }
  if (!visuals.length && item.product_image_url) {
    const image = await pdfImagePng(item.product_image_url);
    if (image) visuals.push({ title: item.description, label: "Exemplo do produto · arte não apresentada", images: [{ bytes: image, label: "Produto" }], illustrative: true });
  }
  return visuals;
}
