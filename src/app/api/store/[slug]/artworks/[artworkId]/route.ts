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
  calculateCommerceCart,
} from "@/repositories/commerce";
import { cartLineSchema } from "@/domain/commerce/schemas";
import { artworkDiscountForLines } from "@/domain/commerce/artwork-benefit";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  buyerContext,
  checkCommerceOrigin,
  readCommerceBody,
  commerceFailure,
  commerceJson,
} from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { artworkBackgroundColorSchema } from "@/domain/artwork/framing";
type Params = { params: Promise<{ slug: string; artworkId: string }> };
const schema = z
  .object({
    action: z.enum(["prepare", "approve"]).default("prepare"),
    scale: z.number().min(0.1).max(5).default(1),
    offsetX: z.number().min(-1).max(1).default(0),
    offsetY: z.number().min(-1).max(1).default(0),
    rotationDegrees: z.number().min(-180).max(180).default(0),
    backgroundColor: artworkBackgroundColorSchema,
    lines: z.array(cartLineSchema).max(40).optional(),
    acceptUncovered: z.boolean().optional(),
  })
  .strict()
  .refine(input => input.action === "approve" || input.lines === undefined, { message: "Os itens são usados somente na aprovação.", path: ["lines"] });
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
  let coverage: { warning: boolean; uncoveredPercent: number } | undefined;
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
      coverage = prepared.coverage;
      uploaded = await uploadArtworkObject({
        path: `${store.tenant_id}/commerce/${session.id}/${crypto.randomUUID()}.png`,
        contentType: "image/png",
        bytes: Buffer.from(prepared.dataUrl.split(",")[1], "base64"),
      });
      if (!uploaded)
        throw new CommerceError("Armazenamento indisponível.", 503);
    }
    const approval = await commerceTransaction(async (client) => {
      const locked = await client.query(
        "select id,cart from commerce_sessions where tenant_id=$1 and id=$2 for update",
        [store.tenant_id, session.id],
      );
      if (!locked.rows[0]) throw new CommerceError("Sessão expirada.", 401);
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
      if (!current) throw new CommerceError("Arte não encontrada.", 404);
      const currentProducts = await commerceProducts(store.tenant_id, client);
      const currentProduct = currentProducts.find((p) => p.id === art.product_id);
      if (!currentProduct || geometryHash(currentProduct) !== fingerprint)
        throw new CommerceError(
          "As medidas do produto mudaram. Atualize o enquadramento.",
          409,
        );
      if (input.action === "approve") {
        if (current.crop?.coverage?.warning && !input.acceptUncovered)
          throw new CommerceError("A arte tem áreas sem cobertura que podem ficar brancas. Confirme a revisão antes de aprovar.", 409, { code: "artwork_coverage_confirmation" });
        if (
          !current.prepared_path ||
          current.crop?.geometryHash !== fingerprint
        )
          throw new CommerceError("Enquadre a arte antes de aprovar.", 409);
        const newlyApproved = !current.approved_at;
        if (newlyApproved) await client.query(
          "update commerce_artworks set approved_at=now(),coverage_acceptance=$3::jsonb where tenant_id=$1 and id=$2",
          [store.tenant_id, artworkId, JSON.stringify({ acceptedUncovered: Boolean(input.acceptUncovered), coverage: current.crop?.coverage ?? null, crop: current.crop, acceptedAt: new Date().toISOString() })],
        );
        const lines = input.lines ?? locked.rows[0].cart;
        let discount: number | null = null;
        try {
          const calculation = await calculateCommerceCart(store.tenant_id, session.id, lines, currentProducts, client);
          discount = artworkDiscountForLines(calculation, lines, currentProduct.id, artworkId);
        } catch (error) {
          // An unavailable cart item must not discard an otherwise valid artwork approval.
          if (!(error instanceof CommerceError)) throw error;
        }
        return { newlyApproved, artworkDiscountCents: discount };
      } else
        await client.query(
          "update commerce_artworks set prepared_path=$3,crop=$4,approved_at=null,coverage_acceptance=null where tenant_id=$1 and id=$2",
          [
            store.tenant_id,
            artworkId,
            uploaded,
            JSON.stringify({ scale: input.scale, offsetX: input.offsetX, offsetY: input.offsetY, rotationDegrees: input.rotationDegrees, backgroundColor: input.backgroundColor ?? null, coverage, geometryHash: fingerprint }),
          ],
        );
    });
    uploaded = null;
    return commerceJson({ ok: true, coverage, ...approval });
  } catch (error) {
    await deleteArtworkObject(uploaded);
    return commerceFailure(error, "artwork.prepare");
  }
}
