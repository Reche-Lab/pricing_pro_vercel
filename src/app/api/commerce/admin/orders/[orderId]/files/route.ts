import { z } from "zod";
import { getPool } from "@/lib/db/client";
import type { CommerceOrder } from "@/repositories/commerce";
import {
  commerceFailure,
} from "@/services/commerce/http";
import { CommerceError } from "@/domain/commerce/commerce";
import { downloadArtworkObject } from "@/services/storage/artwork-storage";
import {
  generatePrintPdf,
  type PrintArtwork,
} from "@/services/artwork/imposition";
import { getArtworkProductionProfile } from "@/repositories/artwork-production";
import { assertCommerceProofsReady } from "@/services/commerce/order-artworks";
import { requireCommerceOrderAccess } from "@/services/commerce/order-access";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { session } = await requireCommerceOrderAccess();
    const { orderId } = await params;
    if (!z.string().uuid().safeParse(orderId).success)
      throw new CommerceError("Pedido não encontrado.", 404);
    const order = (
      await getPool().query<CommerceOrder>(
        "select * from commerce_orders where tenant_id=$1 and id=$2 and deleted_at is null",
        [session.tenantId, orderId],
      )
    ).rows[0];
    if (!order) throw new CommerceError("Pedido não encontrado.", 404);
    const query = new URL(request.url).searchParams;
    const pdf = query.get("pdf") === "1";
    if (pdf && order.payment_environment === "test") throw new CommerceError("O PDF de produção não é liberado para pedidos de teste.", 409);
    const ids = order.snapshot.lines.map((l) => l.artworkId).filter(Boolean);
    if (!pdf && !ids.includes(query.get("artworkId")))
      throw new CommerceError("Arte não encontrada.", 404);
    const rows = (
      await getPool().query(
        "select id,storage_path,prepared_path from commerce_artworks where tenant_id=$1 and id=any($2::uuid[])",
        [session.tenantId, ids],
      )
    ).rows;
    const proofs = (await getPool().query("select line_id,artwork_id,prepared_path from commerce_artwork_proofs where tenant_id=$1 and order_id=$2", [session.tenantId, order.id])).rows;
    if (!pdf) {
      const art = rows.find((a) => a.id === query.get("artworkId"));
      if (!art) throw new CommerceError("Arte não encontrada.", 404);
      const path = query.get("prepared") === "1" ? proofs.find(p => p.artwork_id === art.id && (!query.get("lineId") || p.line_id === query.get("lineId")))?.prepared_path : art.storage_path;
      if (!path) throw new CommerceError("A arte ainda está aguardando preparação.", 409);
      const file = await downloadArtworkObject(path);
      if (!file) throw new CommerceError("Arquivo indisponível.", 404);
      return new Response(Buffer.from(file.bytes), {
        headers: {
          "content-type": file.contentType,
          "content-disposition": `attachment; filename="arte-${art.id}.${file.contentType === "image/png" ? "png" : "webp"}"`,
          "cache-control": "no-store",
        },
      });
    }
    if (order.payment_status !== "paid")
      throw new CommerceError(
        "A produção aguarda a confirmação de pagamento.",
        409,
      );
    await assertCommerceProofsReady(getPool(), order);
    if (order.snapshot.lines.reduce((sum, l) => sum + l.quantity, 0) > 1000)
      throw new CommerceError(
        "O PDF síncrono do piloto permite até 1.000 unidades. Baixe as artes individuais para pedidos maiores.",
        409,
      );
    const artworks: PrintArtwork[] = [];
    for (const line of order.snapshot.lines) {
      if (!line.artworkId) continue;
      const art = rows.find((a) => a.id === line.artworkId);
      const product = order.snapshot.products.find(
        (p) => p.id === line.productId,
      );
      const preparedPath = proofs.find(p => p.line_id === line.id)?.prepared_path;
      if (!art || !preparedPath || !product?.geometry)
        throw new CommerceError("Arte de produção indisponível.", 409);
      const file = await downloadArtworkObject(preparedPath);
      if (!file) throw new CommerceError("Arquivo indisponível.", 404);
      artworks.push({
        id: line.id,
        label: line.artworkName,
        quantity: line.quantity,
        geometry: product.geometry,
        ...product.margins,
        preparedDataUrl: `data:${file.contentType};base64,${Buffer.from(file.bytes).toString("base64")}`,
      });
    }
    const profile = await getArtworkProductionProfile(
      session.userId,
      session.tenantId,
    );
    const result = await generatePrintPdf(artworks, {
      ...profile,
      drawCutLines: query.get("cutLines") !== "0",
    });
    console.info("Commerce production PDF generated.", { tenantId: session.tenantId, orderId, actorId: session.userId, artworkCount: artworks.length, bytes: result.bytes.length, cutLines: query.get("cutLines") !== "0" });
    return new Response(Buffer.from(result.bytes), {
      headers: {
        "content-type": "application/pdf",
        "cache-control": "no-store",
        "content-disposition": `${query.get("download") === "1" ? "attachment" : "inline"}; filename="producao-${orderId}.pdf"`,
      },
    });
  } catch (error) {
    return commerceFailure(error, "order.files");
  }
}
