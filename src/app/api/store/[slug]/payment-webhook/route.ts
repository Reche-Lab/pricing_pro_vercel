import { commercePaymentTenant } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  paymentCredentials,
  reconcileCommercePayment,
  verifyMpWebhook,
} from "@/services/commerce/payments";
import { commerceFailure, commerceJson } from "@/services/commerce/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const tenantId = await commercePaymentTenant((await params).slug);
    if (!tenantId) throw new CommerceError("Loja indisponível.", 404);
    const id = new URL(request.url).searchParams.get("data.id") ?? "";
    const credentials = await paymentCredentials(tenantId);
    if (!verifyMpWebhook(request.headers, id, credentials.webhookSecret))
      throw new CommerceError("Assinatura inválida.", 401);
    await reconcileCommercePayment(tenantId, id);
    return commerceJson({ ok: true });
  } catch (error) {
    return commerceFailure(error, "payment.webhook");
  }
}
