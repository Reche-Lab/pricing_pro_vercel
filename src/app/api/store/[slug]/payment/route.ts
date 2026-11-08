import { z } from "zod";
import { checkoutPayment } from "@/services/commerce/payments";
import { CommerceError } from "@/domain/commerce/commerce";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import {
  buyerContext,
  checkCommerceOrigin,
  readCommerceBody,
  commerceJson,
  commerceFailure,
} from "@/services/commerce/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    checkCommerceOrigin(request);
    const { store, session } = await buyerContext(
      (await params).slug,
      false,
      true,
    );
    if (!session.customer_id)
      throw new CommerceError("Entre na sua conta.", 401);
    const blocked = await enforcePublicRateLimit(request, `${store.tenant_id}:${session.customer_id}`, { action: "commerce.payment.hosted", limit: 12, windowSeconds: 600 });
    if (blocked) return blocked;
    const { orderId } = await readCommerceBody(
      request,
      z.object({ orderId: z.string().uuid() }).strict(),
    );
    return commerceJson(
      await checkoutPayment(store, session.customer_id, orderId),
    );
  } catch (error) {
    return commerceFailure(error, "payment.start");
  }
}
