import { z } from "zod";
import { createHash } from "node:crypto";
import { normalizePublicArtworkUpload } from "@/services/artwork/public-upload";
import {
  uploadArtworkObject,
  deleteArtworkObject,
} from "@/services/storage/artwork-storage";
import { commerceProducts, commerceTransaction } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  buyerContext,
  checkCommerceOrigin,
  readCommerceBody,
  commerceFailure,
  commerceJson,
} from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
const schema = z
  .object({
    productId: z.string().uuid(),
    dataUrl: z.string().max(4200000),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    fileSize: z.number().int().positive().max(3145728),
    fileName: z.string().min(1).max(180),
  })
  .strict();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  let path: string | null = null;
  try {
    checkCommerceOrigin(request);
    const blocked = await enforcePublicRateLimit(request, "commerce", {
      action: "artwork.upload",
      limit: 15,
      windowSeconds: 600,
    });
    if (blocked) return blocked;
    const { store, session } = await buyerContext((await params).slug);
    const input = await readCommerceBody(request, schema, 4300000);
    const product = (await commerceProducts(store.tenant_id)).find(
      (p) => p.id === input.productId && p.personalized,
    );
    if (!product) throw new CommerceError("Personalização indisponível.", 404);
    const file = await normalizePublicArtworkUpload({
      dataUrl: input.dataUrl,
      declaredMimeType: input.mimeType,
      declaredSize: input.fileSize,
      originalFileName: input.fileName,
    });
    path = await uploadArtworkObject({
      path: `${store.tenant_id}/commerce/${session.id}/${crypto.randomUUID()}.webp`,
      contentType: file.contentType,
      bytes: file.bytes,
    });
    if (!path)
      throw new CommerceError(
        "O armazenamento de artes ainda não foi configurado.",
        503,
      );
    const artifact = await commerceTransaction(async (client) => {
      await client.query(
        "select id from commerce_sessions where tenant_id=$1 and id=$2 for update",
        [store.tenant_id, session.id],
      );
      const count = (
        await client.query(
          "select count(*)::int as total from commerce_artworks where tenant_id=$1 and session_id=$2",
          [store.tenant_id, session.id],
        )
      ).rows[0].total;
      if (count >= 40)
        throw new CommerceError(
          "Limite de 40 versões de arte nesta sessão atingido.",
          429,
        );
      return (
        await client.query(
          "insert into commerce_artworks(tenant_id,session_id,product_id,storage_path,file_name,content_hash) values($1,$2,$3,$4,$5,$6) returning id,file_name",
          [
            store.tenant_id,
            session.id,
            product.id,
            path,
            file.fileName,
            createHash("sha256").update(file.bytes).digest("hex"),
          ],
        )
      ).rows[0];
    });
    path = null;
    return commerceJson({ ok: true, artwork: artifact }, 201);
  } catch (error) {
    await deleteArtworkObject(path);
    return commerceFailure(error, "artwork.upload");
  }
}
