import { z } from "zod";
import { getPool } from "@/lib/db/client";
import {
  downloadArtworkObject,
  uploadArtworkObject,
  deleteArtworkObject,
} from "@/services/storage/artwork-storage";
import { prepareArtwork } from "@/services/artwork/production";
import {
  commerceProducts,
  commerceTransaction,
  geometryHash,
} from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  buyerContext,
  checkCommerceOrigin,
  readCommerceBody,
  commerceFailure,
  commerceJson,
} from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
type Params = { params: Promise<{ slug: string; artworkId: string }> };
const schema = z
  .object({
    action: z.enum(["prepare", "approve"]).default("prepare"),
    scale: z.number().min(0.1).max(5).default(1),
    offsetX: z.number().min(-1).max(1).default(0),
    offsetY: z.number().min(-1).max(1).default(0),
    rotationDegrees: z.number().min(-180).max(180).default(0),
  })
  .strict();
export async function GET(request: Request, { params }: Params) {
  try {
    const { slug, artworkId } = await params;
    if (!z.string().uuid().safeParse(artworkId).success)
      throw new CommerceError("Arte não encontrada.", 404);
    const { store, session } = await buyerContext(slug, false, true);
    const row = (
      await getPool().query(
        `select storage_path,prepared_path from commerce_artworks a where a.tenant_id=$1 and a.id=$2 and (a.session_id=$3 or exists(select 1 from commerce_orders o where o.tenant_id=a.tenant_id and o.customer_id=$4 and exists(select 1 from jsonb_array_elements(o.snapshot->'lines') l where l->>'artworkId'=a.id::text)))`,
        [store.tenant_id, artworkId, session.id, session.customer_id],
      )
    ).rows[0];
    if (!row) throw new CommerceError("Arte não encontrada.", 404);
    const file = await downloadArtworkObject(
      new URL(request.url).searchParams.get("prepared") === "1"
        ? row.prepared_path || row.storage_path
        : row.storage_path,
    );
    if (!file) throw new CommerceError("Arquivo indisponível.", 404);
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "content-type": file.contentType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
      },
    });
  } catch (error) {
    return commerceFailure(error, "artwork.read");
  }
}
export async function POST(request: Request, { params }: Params) {
  let uploaded: string | null = null;
  try {
    checkCommerceOrigin(request);
    const blocked = await enforcePublicRateLimit(request, "commerce", {
      action: "artwork.prepare",
      limit: 30,
      windowSeconds: 600,
    });
    if (blocked) return blocked;
    const { slug, artworkId } = await params;
    if (!z.string().uuid().safeParse(artworkId).success)
      throw new CommerceError("Arte não encontrada.", 404);
    const { store, session } = await buyerContext(slug);
    const input = await readCommerceBody(request, schema);
    const art = (
      await getPool().query(
        "select * from commerce_artworks where tenant_id=$1 and session_id=$2 and id=$3",
        [store.tenant_id, session.id, artworkId],
      )
    ).rows[0];
    if (!art) throw new CommerceError("Arte não encontrada.", 404);
    const product = (await commerceProducts(store.tenant_id)).find(
      (p) => p.id === art.product_id,
    );
    if (!product?.geometry)
      throw new CommerceError("Produto indisponível.", 409);
    const fingerprint = geometryHash(product);
    if (input.action === "prepare") {
      const source = await downloadArtworkObject(art.storage_path);
      if (!source) throw new CommerceError("Arquivo indisponível.", 404);
      const prepared = await prepareArtwork({
        dataUrl: `data:${source.contentType};base64,${Buffer.from(source.bytes).toString("base64")}`,
        geometry: product.geometry,
        ...product.margins,
        dpi: 300,
        ...input,
      });
      uploaded = await uploadArtworkObject({
        path: `${store.tenant_id}/commerce/${session.id}/${crypto.randomUUID()}.png`,
        contentType: "image/png",
        bytes: Buffer.from(prepared.dataUrl.split(",")[1], "base64"),
      });
      if (!uploaded)
        throw new CommerceError("Armazenamento indisponível.", 503);
    }
    await commerceTransaction(async (client) => {
      await client.query(
        "select id from commerce_sessions where tenant_id=$1 and id=$2 for update",
        [store.tenant_id, session.id],
      );
      const current = (
        await client.query(
          "select * from commerce_artworks where tenant_id=$1 and session_id=$2 and id=$3 for update",
          [store.tenant_id, session.id, artworkId],
        )
      ).rows[0];
      const used = await client.query(
        `select id from commerce_orders o where tenant_id=$1 and exists(select 1 from jsonb_array_elements(o.snapshot->'lines') l where l->>'artworkId'=$2) limit 1`,
        [store.tenant_id, artworkId],
      );
      if (used.rowCount)
        throw new CommerceError(
          "Esta arte já pertence a um pedido e não pode ser alterada.",
          409,
        );
      const currentProduct = (
        await commerceProducts(store.tenant_id, client)
      ).find((p) => p.id === art.product_id);
      if (!currentProduct || geometryHash(currentProduct) !== fingerprint)
        throw new CommerceError(
          "As medidas do produto mudaram. Atualize o enquadramento.",
          409,
        );
      if (input.action === "approve") {
        if (
          !current.prepared_path ||
          current.crop?.geometryHash !== fingerprint
        )
          throw new CommerceError("Enquadre a arte antes de aprovar.", 409);
        await client.query(
          "update commerce_artworks set approved_at=now() where tenant_id=$1 and id=$2",
          [store.tenant_id, artworkId],
        );
      } else
        await client.query(
          "update commerce_artworks set prepared_path=$3,crop=$4,approved_at=null where tenant_id=$1 and id=$2",
          [
            store.tenant_id,
            artworkId,
            uploaded,
            JSON.stringify({ ...input, geometryHash: fingerprint }),
          ],
        );
    });
    uploaded = null;
    return commerceJson({ ok: true });
  } catch (error) {
    await deleteArtworkObject(uploaded);
    return commerceFailure(error, "artwork.prepare");
  }
}
