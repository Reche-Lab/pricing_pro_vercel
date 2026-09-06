import { checkoutSchema } from "@/domain/commerce/schemas";
import { CommerceError } from "@/domain/commerce/commerce";
import { buyerOrders, createCommerceOrder } from "@/repositories/commerce";
import {
  buyerContext,
  checkCommerceOrigin,
  commerceFailure,
  commerceJson,
  readCommerceBody,
} from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
type Params = { params: Promise<{ slug: string }> };
export async function GET(_request: Request, { params }: Params) {
  try {
    const { store, session } = await buyerContext(
      (await params).slug,
      false,
      true,
    );
    if (!session.customer_id)
      throw new CommerceError("Entre na sua conta.", 401);
    return commerceJson({
      orders: await buyerOrders(store.tenant_id, session.customer_id),
    });
  } catch (error) {
    return commerceFailure(error, "orders.read");
  }
}
export async function POST(request: Request, { params }: Params) {
  try {
    checkCommerceOrigin(request);
    const blocked = await enforcePublicRateLimit(request, "commerce", {
      action: "checkout",
      limit: 15,
      windowSeconds: 600,
    });
    if (blocked) return blocked;
    const { store, session } = await buyerContext((await params).slug);
    return commerceJson(
      {
        ok: true,
        ...(await createCommerceOrder(
          store,
          session,
          await readCommerceBody(request, checkoutSchema),
        )),
      },
      201,
    );
  } catch (error) {
    return commerceFailure(error, "checkout");
  }
}
