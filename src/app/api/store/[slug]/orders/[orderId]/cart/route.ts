import { z } from "zod";
import { pendingOrderActionSchema } from "@/domain/commerce/pending-order";
import { CommerceError } from "@/domain/commerce/commerce";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { changePendingOrder } from "@/services/commerce/pending-order";
import { buyerContext, checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody } from "@/services/commerce/http";
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; orderId: string }> }) {
  try {
    checkCommerceOrigin(request);
    const { slug, orderId } = await params;
    if (!z.string().uuid().safeParse(orderId).success) throw new CommerceError("Pedido não encontrado.", 404);
    const { store, session } = await buyerContext(slug, false, true);
    if (!session.customer_id) throw new CommerceError("Entre na sua conta.", 401);
    const limited = await enforcePublicRateLimit(request, `${store.tenant_id}:${session.customer_id}`, { action: "commerce.order.cart", limit: 12, windowSeconds: 600 });
    if (limited) return limited;
    return commerceJson(await changePendingOrder(store.tenant_id, session, orderId, await readCommerceBody(request, pendingOrderActionSchema)));
  } catch (error) { return commerceFailure(error, "order.cart.change"); }
}
