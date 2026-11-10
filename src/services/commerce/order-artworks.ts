import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import { CommerceError } from "@/domain/commerce/commerce";
import { commerceTransaction, geometryHash, matchesOrderGeometryHash, publicCommerceProduct, type CommerceOrder } from "@/repositories/commerce";
import { normalizePublicArtworkUpload } from "@/services/artwork/public-upload";
import { prepareArtwork } from "@/services/artwork/production";
import { uploadArtworkObject, deleteArtworkObject, downloadArtworkObject } from "@/services/storage/artwork-storage";
import { commerceJson, readCommerceBody } from "./http";

export const proofBodySchema = z.object({
  action: z.enum(["source", "prepare", "publish", "approve"]), lineId: z.string().uuid(), revision: z.number().int().positive(),
  note: z.string().trim().min(5).max(500).optional(),
  fileName: z.string().max(180).optional(), mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
  fileSize: z.number().int().positive().max(3145728).optional(), dataUrl: z.string().max(4200000).optional(),
  scale: z.number().min(0.1).max(5).optional(), offsetX: z.number().min(-1).max(1).optional(), offsetY: z.number().min(-1).max(1).optional(), rotationDegrees: z.number().min(-180).max(180).optional(),
}).strict();
export type CommerceProofView = { lineId: string; artworkId?: string; revision: number; approvedAt: string | null; prepared: boolean; crop: { scale: number; offsetX: number; offsetY: number; rotationDegrees: number } | null; artworkName: string; quantity: number; product: ReturnType<typeof publicCommerceProduct> };

export async function authorizedCommerceOrder(tenantId: string, orderId: string, customerId: string | null) {
  if (!z.string().uuid().safeParse(orderId).success) throw new CommerceError("Pedido não encontrado.", 404);
  const result = await getPool().query<CommerceOrder>("select * from commerce_orders where tenant_id=$1 and id=$2 and ($3::uuid is null or customer_id=$3::uuid) and ($3::uuid is not null or deleted_at is null)", [tenantId, orderId, customerId]);
  if (!result.rows[0]) throw new CommerceError("Pedido não encontrado.", 404);
  return result.rows[0];
}

export async function readCommerceProofs(request: Request, order: CommerceOrder, admin = false, canEdit = admin) {
  const rows = (await getPool().query("select * from commerce_artwork_proofs where tenant_id=$1 and order_id=$2", [order.tenant_id, order.id])).rows;
  const query = new URL(request.url).searchParams;
  if (query.has("asset")) {
    const proof = rows.find(p => p.line_id === query.get("lineId"));
    if (!proof || !["source", "prepared"].includes(query.get("asset") ?? "")) throw new CommerceError("Arte não encontrada.", 404);
    if (!admin && !proof.published_at) throw new CommerceError("A prova ainda está em preparação.", 409);
    const path = query.get("asset") === "source" ? proof.source_path : proof.prepared_path;
    if (!path) throw new CommerceError("A equipe ainda está preparando esta arte.", 409);
    const file = await downloadArtworkObject(path);
    if (!file) throw new CommerceError("Arquivo indisponível.", 404);
    return new Response(Buffer.from(file.bytes), { headers: { "content-type": file.contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
  }
  const proofs: CommerceProofView[] = [];
  for (const line of order.snapshot.lines) {
    const proof = rows.find(p => p.line_id === line.id);
    const product = order.snapshot.products.find(p => p.id === line.productId);
    if (!proof || !product) continue;
    proofs.push({ lineId: line.id, artworkId: proof.artwork_id, revision: proof.revision, approvedAt: proof.approved_at?.toISOString() ?? null, prepared: Boolean(proof.prepared_path && (admin || proof.published_at)), crop: proof.crop, artworkName: line.artworkName, quantity: line.quantity, product: publicCommerceProduct(product) });
  }
  return commerceJson({ proofs, editable: !order.deleted_at && (!admin || canEdit) && order.fulfillment_status === "received" && order.payment_status !== "refunded" });
}

export async function mutateCommerceProof(request: Request, order: CommerceOrder, actorId: string | null) {
  const input = await readCommerceBody(request, proofBodySchema, 4300000);
  if (!actorId && input.action !== "approve") throw new CommerceError("A preparação desta prova é feita pela equipe.", 403);
  if (actorId && input.action === "approve") throw new CommerceError("A aprovação final deve ser realizada pelo cliente na conta da loja.", 403);
  if (actorId && !input.note) throw new CommerceError("Informe o motivo ou orientação deste ajuste.");
  const current = (await getPool().query("select * from commerce_artwork_proofs where tenant_id=$1 and order_id=$2 and line_id=$3", [order.tenant_id, order.id, input.lineId])).rows[0];
  const line = order.snapshot.lines.find(l => l.id === input.lineId);
  const product = order.snapshot.products.find(p => p.id === line?.productId);
  if (!current || !product?.geometry) throw new CommerceError("Arte não encontrada neste pedido.", 404);
  let uploaded: string | null = null;
  try {
    let crop = current.crop;
    if (input.action === "source") {
      if (!input.fileName || !input.mimeType || !input.fileSize || !input.dataUrl) throw new CommerceError("Envie uma imagem válida.");
      const file = await normalizePublicArtworkUpload({ dataUrl: input.dataUrl, declaredMimeType: input.mimeType, declaredSize: input.fileSize, originalFileName: input.fileName });
      uploaded = await uploadArtworkObject({ path: `${order.tenant_id}/commerce/proofs/${order.id}/${randomUUID()}.webp`, contentType: file.contentType, bytes: file.bytes });
    } else if (input.action === "prepare") {
      const file = await downloadArtworkObject(current.source_path);
      if (!file) throw new CommerceError("Original indisponível.", 404);
      crop = { scale: input.scale ?? 1, offsetX: input.offsetX ?? 0, offsetY: input.offsetY ?? 0, rotationDegrees: input.rotationDegrees ?? 0, geometryHash: geometryHash(product) };
      const prepared = await prepareArtwork({ dataUrl: `data:${file.contentType};base64,${Buffer.from(file.bytes).toString("base64")}`, geometry: product.geometry, ...product.margins, ...crop, dpi: 300 });
      uploaded = await uploadArtworkObject({ path: `${order.tenant_id}/commerce/proofs/${order.id}/${randomUUID()}.png`, contentType: "image/png", bytes: Buffer.from(prepared.dataUrl.split(",")[1], "base64") });
    }
    if (["source", "prepare"].includes(input.action) && !uploaded) throw new CommerceError("Armazenamento indisponível.", 503);
    const revision = await commerceTransaction(async client => {
      const lockedOrder = (await client.query("select payment_status,fulfillment_status,deleted_at from commerce_orders where tenant_id=$1 and id=$2 for update", [order.tenant_id, order.id])).rows[0];
      if (!lockedOrder || lockedOrder.deleted_at || lockedOrder.fulfillment_status !== "received" || lockedOrder.payment_status === "refunded") throw new CommerceError("Este pedido não permite mais alterações de arte.", 409);
      const proof = (await client.query("select * from commerce_artwork_proofs where tenant_id=$1 and order_id=$2 and line_id=$3 for update", [order.tenant_id, order.id, input.lineId])).rows[0];
      if (!proof || proof.revision !== input.revision || proof.revision !== current.revision) throw new CommerceError("A prova mudou. Atualize e revise a versão mais recente.", 409);
      if (input.action === "approve" || input.action === "publish") {
        if (!proof.prepared_path || !matchesOrderGeometryHash(product, proof.crop?.geometryHash) || input.action === "approve" && !proof.published_at) throw new CommerceError("Aguarde a preparação e publicação da prova.", 409);
        if (input.action === "approve" && proof.approved_at) return proof.revision;
        await client.query(input.action === "approve" ? "update commerce_artwork_proofs set approved_at=now(),updated_at=now() where tenant_id=$1 and order_id=$2 and line_id=$3" : "update commerce_artwork_proofs set published_at=now(),updated_at=now() where tenant_id=$1 and order_id=$2 and line_id=$3", [order.tenant_id, order.id, input.lineId]);
      } else {
        await client.query(`update commerce_artwork_proofs set source_path=case when $4::boolean then $5 else source_path end,
          prepared_path=case when $4::boolean then null else $5 end,crop=$6,approved_at=null,published_at=null,revision=revision+1,prepared_by=$7::uuid,updated_at=now()
          where tenant_id=$1 and order_id=$2 and line_id=$3`, [order.tenant_id, order.id, input.lineId, input.action === "source", uploaded, input.action === "source" ? null : JSON.stringify(crop), actorId]);
      }
      const revision = ["approve", "publish"].includes(input.action) ? proof.revision : proof.revision + 1;
      await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,$3,$4)", [order.tenant_id, order.id, `artwork.${input.action}`, JSON.stringify({ lineId: input.lineId, revision, actorId, note: input.note ?? "Cliente aprovou a prova." })]);
      return revision;
    });
    uploaded = null;
    return commerceJson({ ok: true, revision });
  } finally { if (uploaded) await deleteArtworkObject(uploaded); }
}

export async function assertCommerceProofsReady(client: Pick<PoolClient, "query">, order: CommerceOrder) {
  const lines = order.snapshot.lines.filter(line => order.snapshot.products.find(p => p.id === line.productId)?.personalized);
  if (!lines.length) return;
  const proofs = (await client.query("select line_id,prepared_path,approved_at,crop from commerce_artwork_proofs where tenant_id=$1 and order_id=$2", [order.tenant_id, order.id])).rows;
  for (const line of lines) {
    const product = order.snapshot.products.find(p => p.id === line.productId)!;
    if (!proofs.some(p => p.line_id === line.id && p.prepared_path && p.approved_at && matchesOrderGeometryHash(product, p.crop?.geometryHash))) throw new CommerceError("A produção aguarda a preparação e aprovação de todas as artes pelo cliente.", 409);
  }
}
