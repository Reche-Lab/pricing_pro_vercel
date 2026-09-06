import { z } from "zod";
import { checkoutPayment } from "@/services/commerce/payments";
import { CommerceError } from "@/domain/commerce/commerce";
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
