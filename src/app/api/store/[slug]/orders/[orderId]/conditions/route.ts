import { z } from "zod";
import { CommerceError } from "@/domain/commerce/commerce";
import { buyerOrderConditions } from "@/repositories/commerce";
import { buyerContext, commerceFailure } from "@/services/commerce/http";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; orderId: string }> }) {
  try {
    const { slug, orderId } = await params;
    if (!z.string().uuid().safeParse(orderId).success) throw new CommerceError("Pedido não encontrado.", 404);
    const { store, session } = await buyerContext(slug, false, true);
    if (!session.customer_id) throw new CommerceError("Entre na sua conta para consultar este pedido.", 401);
    const terms = await buyerOrderConditions(store.tenant_id, session.customer_id, orderId);
    return new Response(terms, { headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="condicoes-pedido-${orderId.slice(0, 8)}.txt"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    } });
  } catch (error) {
    return commerceFailure(error, "order.conditions.download");
  }
}
