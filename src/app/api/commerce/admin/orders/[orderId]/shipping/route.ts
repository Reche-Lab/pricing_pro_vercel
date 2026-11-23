import { z } from "zod";
import { orderShippingActionSchema } from "@/domain/commerce/order-shipping";
import { CommerceError } from "@/domain/commerce/commerce";
import { requireCommerceOrderAccess } from "@/services/commerce/order-access";
import { checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody } from "@/services/commerce/http";
import { commerceOrderShippingState, performCommerceOrderShipping } from "@/services/commerce/order-shipping";
import { melhorEnvioErrorPayload } from "@/services/melhor-envio/errors";
import { MelhorEnvioRequestError } from "@/services/melhor-envio/melhor-envio";
import { scheduleCommerceOrderNotifications } from "@/services/commerce/order-notification-schedule";
import { getPool } from "@/lib/db/client";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ orderId: string }> };
function orderId(value: string) {
  if (!z.string().uuid().safeParse(value).success) throw new CommerceError("Pedido não encontrado.", 404);
  return value;
}
export async function GET(_request: Request, context: Context) {
  try {
    const { session } = await requireCommerceOrderAccess();
    return commerceJson(await commerceOrderShippingState(session.tenantId, orderId((await context.params).orderId)));
  } catch (error) { return commerceFailure(error, "order.shipping.read"); }
}
export async function POST(request: Request, context: Context) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceOrderAccess("commerce:orders:manage");
    const id = orderId((await context.params).orderId);
    const input = await readCommerceBody(request, orderShippingActionSchema, 4096);
    // Check access even when the action only requeues transactional email.
    await commerceOrderShippingState(session.tenantId, id);
    let result = {};
    if (input.action === "retry_notifications") {
      await getPool().query("update commerce_order_notifications set status='pending',attempts=0,next_attempt_at=now() where tenant_id=$1 and order_id=$2 and status='failed'", [session.tenantId, id]);
    } else result = await performCommerceOrderShipping(session.tenantId, id, session.userId, input);
    scheduleCommerceOrderNotifications(session.tenantId, id);
    return commerceJson({ ok: true, ...result, ...(await commerceOrderShippingState(session.tenantId, id)) });
  } catch (error) {
    if (error instanceof MelhorEnvioRequestError) {
      console.error("Commerce shipping provider rejected operation.", { httpStatus: error.status });
      return commerceJson(melhorEnvioErrorPayload(error), error.status === 401 ? 409 : 502);
    }
    return commerceFailure(error, "order.shipping.action");
  }
}
