import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { CommerceError } from "@/domain/commerce/commerce";
import { getServerEnv } from "@/lib/env/server";
import { normalizePublicArtworkUpload } from "@/services/artwork/public-upload";

export const commerceMediaSchema = z
  .object({
    purpose: z.enum(["logo", "cover", "product"]),
    fileName: z.string().min(1).max(180),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    fileSize: z.number().int().positive().max(3145728),
    dataUrl: z.string().max(4200000),
  })
  .strict();
type Input = z.infer<typeof commerceMediaSchema>;

export async function normalizeCommerceImage(input: Input) {
  try {
    const normalized = await normalizePublicArtworkUpload({
      dataUrl: input.dataUrl,
      declaredMimeType: input.mimeType,
      declaredSize: input.fileSize,
      originalFileName: input.fileName,
    });
    const dimension = { logo: 512, cover: 2400, product: 1600 }[input.purpose];
    return await sharp(normalized.bytes)
      .resize(dimension, dimension, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, effort: 4 })
      .toBuffer();
  } catch {
    throw new CommerceError(
      "Imagem inválida. Envie PNG, JPEG ou WebP sem animação, de até 3 MB e 25 megapixels.",
    );
  }
}

export async function uploadCommerceImage(tenantId: string, input: Input) {
  if (!z.string().uuid().safeParse(tenantId).success)
    throw new CommerceError("Loja inválida.", 403);
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new CommerceError(
      "Configure o Supabase Storage para enviar as imagens da loja.",
      503,
    );
  }
  const bytes = await normalizeCommerceImage(input);
  const path = `${tenantId}/${input.purpose}/${randomUUID()}.webp`;
  const base = `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object`;
  let response: Response;
  try {
    response = await fetch(`${base}/commerce-media/${path}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "image/webp",
        "x-upsert": "false",
        "cache-control": "max-age=31536000",
      },
      body: bytes,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new CommerceError(
      "O armazenamento não respondeu. Tente enviar novamente.",
      503,
    );
  }
  if (!response.ok) {
    console.error("Commerce media storage failed.", {
      tenantId,
      purpose: input.purpose,
      status: response.status,
    });
    throw new CommerceError(
      "Não foi possível salvar a imagem. Verifique o bucket commerce-media e a configuração do Storage.",
      502,
    );
  }
  console.info("Commerce media uploaded.", {
    tenantId,
    purpose: input.purpose,
    bytes: bytes.length,
  });
  return { url: `${base}/public/commerce-media/${path}` };
}
