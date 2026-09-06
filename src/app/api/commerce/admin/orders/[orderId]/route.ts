import { z } from "zod";
import { commerceTransaction } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  requireCommerceAdmin,
  checkCommerceOrigin,
  readCommerceBody,
  commerceJson,
  commerceFailure,
} from "@/services/commerce/http";
const schema = z
  .object({
    action: z.enum(["confirm_manual", "production", "shipped", "completed"]),
    note: z.string().trim().min(5).max(500),
  })
  .strict();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    const orderId = z
      .string()
      .uuid()
      .parse((await params).orderId);
    const input = await readCommerceBody(request, schema);
    await commerceTransaction(async (client) => {
      const order = (
        await client.query(
          "select * from commerce_orders where tenant_id=$1 and id=$2 for update",
          [session.tenantId, orderId],
        )
      ).rows[0];
      if (!order) throw new CommerceError("Pedido não encontrado.", 404);
      if (input.action === "confirm_manual") {
        if (order.provider !== "manual" || order.payment_status !== "pending")
          throw new CommerceError(
            "Este pagamento não pode ser confirmado manualmente.",
            409,
          );
        await client.query(
          "update commerce_orders set payment_status='paid',updated_at=now() where tenant_id=$1 and id=$2",
          [session.tenantId, orderId],
        );
      } else {
        if (order.payment_status !== "paid")
          throw new CommerceError(
            "Confirme o pagamento antes de iniciar a produção.",
            409,
          );
        const previous = {
          production: "received",
          shipped: "production",
          completed: "shipped",
        }[input.action];
        if (order.fulfillment_status !== previous)
          throw new CommerceError("Confira a etapa atual do pedido.", 409);
        await client.query(
          "update commerce_orders set fulfillment_status=$3,updated_at=now() where tenant_id=$1 and id=$2",
          [session.tenantId, orderId, input.action],
        );
      }
      await client.query(
        "insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,$3,$4)",
        [
          session.tenantId,
          orderId,
          input.action,
          JSON.stringify({ actor: session.userId, note: input.note }),
        ],
      );
    });
    return commerceJson({ ok: true });
  } catch (error) {
    return commerceFailure(error, "order.admin_action");
  }
}
