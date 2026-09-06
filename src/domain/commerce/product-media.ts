import { z } from "zod";

export const PRODUCT_MEDIA_LIMIT = 10;
export const PRODUCT_VIDEO_LIMIT = 2;
export const COMMERCE_IMAGE_BYTES = 3 * 1024 * 1024;
export const COMMERCE_VIDEO_BYTES = 20 * 1024 * 1024;
export const safeCommerceMediaUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use uma URL HTTPS para a mídia.");
export const productMediaItemSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(["image", "video"]),
    url: safeCommerceMediaUrl.refine(Boolean, "Envie o arquivo da mídia."),
  })
  .strict();
export type ProductMedia = z.infer<typeof productMediaItemSchema>;
export const productMediaSchema = z
  .array(productMediaItemSchema)
  .min(1)
  .max(PRODUCT_MEDIA_LIMIT, "Use até 10 mídias por produto.")
  .refine(
    (items) =>
      items.filter((item) => item.kind === "video").length <=
      PRODUCT_VIDEO_LIMIT,
    "Use no máximo 2 vídeos por produto.",
  )
  .refine(
    (items) => items[0]?.kind === "image",
    "A capa do produto deve ser uma imagem.",
  )
  .refine(
    (items) =>
      new Set(items.map((item) => item.id)).size === items.length &&
      new Set(items.map((item) => item.url)).size === items.length,
    "Não repita uma mídia na galeria.",
  );
export const commerceVideoInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(180),
    mimeType: z.enum(["video/mp4", "video/webm"]),
    fileSize: z
      .number()
      .int()
      .positive()
      .max(COMMERCE_VIDEO_BYTES, "O vídeo deve ter até 20 MB."),
  })
  .strict();
export const commerceVideoCompleteSchema = z
  .object({ uploadId: z.string().uuid() })
  .strict();
export type CommerceVideoInput = z.infer<typeof commerceVideoInputSchema>;
export function getProductMedia(
  media: ProductMedia[] | undefined,
  imageUrl: string,
  id: string,
): ProductMedia[] {
  return media?.length
    ? media
    : imageUrl
      ? [{ id, kind: "image", url: imageUrl }]
      : [];
}
export function commerceVideoPath(tenantId: string, id: string, mime: string) {
  return `${tenantId}/${id}.${mime === "video/mp4" ? "mp4" : "webm"}`;
}
