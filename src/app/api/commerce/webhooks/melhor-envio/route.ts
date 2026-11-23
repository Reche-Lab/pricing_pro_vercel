import { commerceEnabled } from "@/repositories/commerce";
import { commerceFailure, commerceJson } from "@/services/commerce/http";
import { receiveShippingWebhook } from "@/services/commerce/shipping-webhook";
import { scheduleCommerceOrderNotifications } from "@/services/commerce/order-notification-schedule";
export const maxDuration = 30;
export async function POST(request: Request) {
  if (!commerceEnabled()) return commerceJson({ ok: false }, 404);
  try {
    const result = await receiveShippingWebhook(request);
    if ("tenantId" in result && result.tenantId && result.orderId) scheduleCommerceOrderNotifications(result.tenantId, result.orderId);
    return commerceJson({ ok: true });
  } catch (error) { return commerceFailure(error, "order.shipping.webhook"); }
}
