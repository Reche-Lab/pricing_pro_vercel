import { commercePaymentTenant } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import {
  paymentCredentials,
  reconcileCommercePayment,
  verifyMpWebhook,
} from "@/services/commerce/payments";
import { commerceFailure, commerceJson } from "@/services/commerce/http";
import { reconcileDirectPayment } from "@/services/commerce/transparent-payments";
import { paymentEnvironmentSchema } from "@/domain/commerce/payment-settings";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const tenantId = await commercePaymentTenant((await params).slug);
    if (!tenantId) throw new CommerceError("Loja indisponível.", 404);
    const query = new URL(request.url).searchParams;
    const id = query.get("data.id") ?? "";
    const parsed = paymentEnvironmentSchema.safeParse(query.get("environment") ?? "production");
    if (!parsed.success) throw new CommerceError("Ambiente inválido.");
    const environment = parsed.data;
    const credentials = await paymentCredentials(tenantId, environment);
    if (!credentials.webhookSecret || !verifyMpWebhook(request.headers, id, credentials.webhookSecret))
      throw new CommerceError("Assinatura inválida.", 401);
    if (/^ORD/i.test(id)) await reconcileDirectPayment(tenantId, id, environment);
    else if (environment === "production") await reconcileCommercePayment(tenantId, id);
    else throw new CommerceError("O ambiente de teste utiliza notificações de Orders.");
    return commerceJson({ ok: true });
  } catch (error) {
    return commerceFailure(error, "payment.webhook");
  }
}
