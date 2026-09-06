import {
  COMMERCE_IMAGE_BYTES,
  COMMERCE_VIDEO_BYTES,
  type ProductMedia,
} from "@/domain/commerce/product-media";
import { storeRequest } from "./store-http";
export function productFileKind(file: File): ProductMedia["kind"] {
  if (
    ["image/png", "image/jpeg", "image/webp"].includes(file.type) &&
    file.size > 0 &&
    file.size <= COMMERCE_IMAGE_BYTES
  )
    return "image";
  if (
    ["video/mp4", "video/webm"].includes(file.type) &&
    file.size > 0 &&
    file.size <= COMMERCE_VIDEO_BYTES
  )
    return "video";
  throw new Error(
    "Use PNG, JPEG ou WebP de até 3 MB; MP4 ou WebM de até 20 MB.",
  );
}
export async function uploadProductFile(
  file: File,
  onProgress: (percent: number) => void,
): Promise<ProductMedia> {
  const kind = productFileKind(file);
  if (kind === "image") {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("Não foi possível ler a imagem."));
      reader.readAsDataURL(file);
    });
    const result = await storeRequest("/api/commerce/admin/media", "POST", {
      purpose: "product",
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      dataUrl,
    });
    onProgress(100);
    return { id: crypto.randomUUID(), kind: "image", url: result.url };
  }
  const intent = await storeRequest("/api/commerce/admin/media/video", "POST", {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", intent.signedUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.timeout = 120000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 95));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error(
              "O Storage recusou o vídeo. Confira o limite de 20 MB e a configuração dos buckets.",
            ),
          );
    xhr.onerror = () =>
      reject(
        new Error(
          "O envio foi interrompido. Confira a conexão e tente novamente.",
        ),
      );
    xhr.ontimeout = () =>
      reject(
        new Error(
          "O envio demorou demais. Tente novamente em uma conexão mais rápida.",
        ),
      );
    xhr.send(file);
  });
  const result = await storeRequest("/api/commerce/admin/media/video", "PUT", {
    uploadId: intent.uploadId,
  });
  onProgress(100);
  return result;
}
