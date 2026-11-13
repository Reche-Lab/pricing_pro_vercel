import type { StudioBackgroundAsset } from "@/domain/commerce/studio-background";
import { storeRequest } from "./store-http";
import { readStudioBackground } from "./studio-image";
export async function loadStudioLibraryAsset(slug: string, preview: boolean, productId: string, artworkId: string): Promise<StudioBackgroundAsset> {
  const api = preview ? `/api/commerce/${slug}/preview/library` : `/api/store/${slug}/library`;
  const result = await storeRequest(`${api}/select`, "POST", { productId, artworkId, target: "studio" });
  if (typeof result.dataUrl !== "string" || result.dataUrl.length > 4200000 || !/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(result.dataUrl) || typeof result.version !== "string") throw new Error("A arte pronta não está disponível. Escolha novamente.");
  const bytes = Uint8Array.from(atob(result.dataUrl.split(",")[1]), char => char.charCodeAt(0));
  const asset = await readStudioBackground(new File([bytes], result.fileName || "arte-pronta.webp", { type: "image/webp" }));
  return { ...asset, library: { id: artworkId, version: result.version } };
}
export async function validateStudioLibraryAsset(slug: string, preview: boolean, productId: string, library: { id: string; version: string }) {
  const api = preview ? `/api/commerce/${slug}/preview/library` : `/api/store/${slug}/library`;
  const result = await storeRequest(`${api}/select`, "POST", { productId, artworkId: library.id, target: "studio" });
  if (result.version !== library.version) throw new Error("Esta arte pronta foi atualizada pela loja. Selecione-a novamente antes de continuar.");
}
