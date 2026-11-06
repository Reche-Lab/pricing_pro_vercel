import { CommerceError } from "@/domain/commerce/commerce";
import { buyerContext, checkCommerceOrigin, commerceFailure, requireCommerceAdmin } from "./http";
import { authorizedCommerceOrder, readCommerceProofs, mutateCommerceProof } from "./order-artworks";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";

export async function commerceProofRequest(request: Request, params: { orderId: string; slug?: string }, admin: boolean) {
  try {
    if (request.method === "POST") checkCommerceOrigin(request);
    let tenantId: string, customerId: string | null, actorId: string | null;
    if (admin) {
      const { session } = await requireCommerceAdmin(); tenantId = session.tenantId; actorId = session.userId; customerId = null;
    } else {
      const { store, session } = await buyerContext(params.slug ?? "", false, true);
      if (!session.customer_id) throw new CommerceError("Entre na sua conta para visualizar as provas.", 401);
      tenantId = store.tenant_id; customerId = session.customer_id; actorId = null;
    }
    const order = await authorizedCommerceOrder(tenantId, params.orderId, customerId);
    if (request.method === "GET") return await readCommerceProofs(request, order, admin);
    const blocked = await enforcePublicRateLimit(request, `${tenantId}:${params.orderId}`, { action: "commerce.order.artwork", limit: 120, windowSeconds: 600 });
    if (blocked) return blocked;
    return await mutateCommerceProof(request, order, actorId);
  } catch (error) { return commerceFailure(error, "order.artworks"); }
}
