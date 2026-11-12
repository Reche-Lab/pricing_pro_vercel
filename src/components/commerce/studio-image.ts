import { verifyStudioImageHeader, type StudioBackgroundAsset } from "@/domain/commerce/studio-background";

export function studioBlobDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler a imagem."));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}
const images = new WeakMap<StudioBackgroundAsset, Promise<HTMLImageElement>>();
export function loadStudioImage(asset: StudioBackgroundAsset): Promise<HTMLImageElement> {
  if (!images.has(asset)) images.set(asset, new Promise((resolve, reject) => {
    const image = new Image(); image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => { images.delete(asset); reject(new Error("Não foi possível abrir esta imagem. Use outro arquivo PNG, JPEG ou WebP.")); };
    image.src = asset.dataUrl;
  }));
  return images.get(asset)!;
}
export async function readStudioBackground(file: File): Promise<StudioBackgroundAsset> {
  verifyStudioImageHeader(new Uint8Array(await file.slice(0, 16).arrayBuffer()), file.type, file.size);
  const dataUrl = await studioBlobDataUrl(file);
  const asset = { dataUrl, fileName: file.name.slice(0, 180), width: 0, height: 0 };
  const image = await loadStudioImage(asset);
  if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 25_000_000 || Math.max(image.naturalWidth, image.naturalHeight) > 10000) throw new Error("A imagem deve ter até 25 megapixels e no máximo 10.000 px por lado.");
  asset.width = image.naturalWidth; asset.height = image.naturalHeight;
  return asset;
}
