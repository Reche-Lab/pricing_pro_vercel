import { z } from "zod";
import sharp from "sharp";
import { commerceProducts } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { requireCommercePreview } from "@/services/commerce/preview";
import {
  checkCommerceOrigin,
  readCommerceBody,
  commerceFailure,
  commerceJson,
} from "@/services/commerce/http";
import { normalizePublicArtworkUpload } from "@/services/artwork/public-upload";
import { prepareArtwork } from "@/services/artwork/production";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";

export const runtime = "nodejs";
const schema = z
  .object({
    productId: z.string().uuid(),
    dataUrl: z.string().max(4200000),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    fileSize: z.number().int().positive().max(3145728),
    fileName: z.string().min(1).max(180),
    crop: z
      .object({
        scale: z.number().min(0.1).max(5),
        offsetX: z.number().min(-1).max(1),
        offsetY: z.number().min(-1).max(1),
        rotationDegrees: z.number().min(-180).max(180),
      })
      .strict()
      .optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    checkCommerceOrigin(request);
    const store = await requireCommercePreview((await params).slug);
    const blocked = await enforcePublicRateLimit(request, store.tenant_id, {
      action: "commerce.preview.artwork",
      limit: 30,
      windowSeconds: 600,
    });
    if (blocked) return blocked;
    const input = await readCommerceBody(request, schema, 4300000);
    const product = (await commerceProducts(store.tenant_id)).find(
      (p) => p.id === input.productId && p.personalized,
    );
    if (!product?.geometry)
      throw new CommerceError(
        "Configure a geometria de corte deste produto antes de testar as artes.",
        409,
      );
    const file = await normalizePublicArtworkUpload({
      dataUrl: input.dataUrl,
      declaredMimeType: input.mimeType,
      declaredSize: input.fileSize,
      originalFileName: input.fileName,
    }).catch(() => {
      throw new CommerceError(
        "Envie uma imagem PNG, JPEG ou WebP válida, sem animação, de até 3 MB e 25 megapixels.",
        422,
      );
    });
    let bytes = file.bytes;
    if (input.crop) {
      const prepared = await prepareArtwork({
        dataUrl: file.dataUrl,
        geometry: product.geometry,
        ...product.margins,
        dpi: 300,
        ...input.crop,
      });
      bytes = Buffer.from(prepared.dataUrl.split(",")[1], "base64");
    }
    // Bound the temporary response below the host's payload limit; no Storage writes.
    bytes = await sharp(bytes).webp({ quality: 90 }).toBuffer();
    if (bytes.length > 3145728)
      throw new CommerceError(
        "A imagem preparada é muito grande para a prévia. Use uma arte menor.",
        422,
      );
    return commerceJson({
      fileName: file.fileName,
      mimeType: "image/webp",
      fileSize: bytes.length,
      dataUrl: `data:image/webp;base64,${bytes.toString("base64")}`,
    });
  } catch (error) {
    return commerceFailure(error, "preview.artwork");
  }
}
