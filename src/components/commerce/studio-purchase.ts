import { storeRequest } from "./store-http";
import type { PreviewFile, PreviewCrop } from "./CommercePreviewProvider";
export type StudioSaveProgress = { artworkId: string | null; prepared: boolean };
type PreviewSaver = { upload: (productId: string, file: PreviewFile) => Promise<string>; prepare: (id: string, crop: PreviewCrop) => Promise<void> };
export async function saveStudioPurchase({ slug, productId, file, progress, preview, request = storeRequest }: { slug: string; productId: string; file: PreviewFile; progress: StudioSaveProgress; preview?: PreviewSaver; request?: typeof storeRequest }) {
  if (progress.artworkId && progress.prepared) return progress.artworkId;
  if (!progress.artworkId) {
    if (preview) progress.artworkId = await preview.upload(productId, file);
    else {
      await request(`/api/store/${slug}/cart`);
      const response = await request(`/api/store/${slug}/artworks`, "POST", { productId, ...file });
      if (typeof response.artwork?.id !== "string") throw new Error("Não foi possível identificar a arte salva. Tente novamente.");
      progress.artworkId = response.artwork.id;
    }
  }
  const crop = { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 };
  if (preview) await preview.prepare(progress.artworkId!, crop);
  else await request(`/api/store/${slug}/artworks/${progress.artworkId}`, "POST", { action: "prepare", ...crop });
  progress.prepared = true;
  return progress.artworkId!;
}
