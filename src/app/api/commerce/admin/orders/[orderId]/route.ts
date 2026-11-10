import { z } from "zod";
import { commerceTransaction } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { assertCommerceProofsReady } from "@/services/commerce/order-artworks";
import {
  checkCommerceOrigin,
  readCommerceBody,
  commerceJson,
  commerceFailure,
  requireCommerceAdmin,
} from "@/services/commerce/http";
import { deleteCommerceOrder } from "@/repositories/commerce-orders";
import { orderDeletionSchema, assertOrderDeletionConfirmation } from "@/domain/commerce/order-deletion";
import { requireCommerceOrderAccess } from "@/services/commerce/order-access";
import { scheduleCommerceOlist } from "@/services/commerce/olist-schedule";
import { commerceOlistSettingsSchema, commerceOlistShippingBlock } from "@/domain/commerce/olist";
export const maxDuration = 60;
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
    const { session } = await requireCommerceOrderAccess("commerce:orders:manage");
    const orderId = z
      .string()
      .uuid()
      .parse((await params).orderId);
    const input = await readCommerceBody(request, schema);
    await commerceTransaction(async (client) => {
      const order = (
        await client.query(
          "select * from commerce_orders where tenant_id=$1 and id=$2 and deleted_at is null for update",
          [session.tenantId, orderId],
        )
      ).rows[0];
      if (!order) throw new CommerceError("Pedido não encontrado.", 404);
      if (order.payment_environment === "test") throw new CommerceError("Pedido de teste: produção, expedição e confirmação real de pagamento estão bloqueadas.", 409);
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
        if (input.action === "production") await assertCommerceProofsReady(client, order);
        if (input.action === "shipped") {
          const config = (await client.query("select c.settings from commerce_olist_settings c join integration_connections i on i.tenant_id=c.tenant_id and i.provider='olist' and i.status<>'disabled' and i.credentials_encrypted is not null where c.tenant_id=$1", [session.tenantId])).rows[0]?.settings;
          if (config?.enabled && config.autoInvoice !== false) {
            const job = (await client.query("select invoice_status,expedition_id,production_completed_at from commerce_olist_orders where tenant_id=$1 and order_id=$2", [session.tenantId, orderId])).rows[0];
            const reason = commerceOlistShippingBlock(commerceOlistSettingsSchema.parse(config), job ?? null, order.snapshot.delivery === "pickup");
            if (reason) throw new CommerceError(reason, 409);
          }
        }
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
    console.info("Commerce order state updated.", { tenantId: session.tenantId, orderId, actorId: session.userId, action: input.action });
    if (input.action === "confirm_manual") scheduleCommerceOlist(session.tenantId, orderId);
    return commerceJson({ ok: true });
  } catch (error) {
    return commerceFailure(error, "order.admin_action");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceAdmin();
    const { orderId } = await params;
    if (!z.string().uuid().safeParse(orderId).success) throw new CommerceError("Pedido não encontrado.", 404);
    const input = await readCommerceBody(request, orderDeletionSchema, 4096);
    assertOrderDeletionConfirmation(orderId, input.confirmation);
    const result = await deleteCommerceOrder(session.tenantId, session.userId, orderId, input);
    console.info("Commerce order administratively deleted.", { tenantId: session.tenantId, orderId, actorId: session.userId, alreadyDeleted: result.alreadyDeleted, financialRecordsPreserved: true });
    return commerceJson({ ok: true, ...result });
  } catch (error) { return commerceFailure(error, "order.delete"); }
}
