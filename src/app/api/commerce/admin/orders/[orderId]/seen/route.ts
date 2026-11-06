import { z } from "zod";
import { CommerceError } from "@/domain/commerce/commerce";
import { markOrderSeen } from "@/repositories/commerce-orders";
import { requireCommerceOrderAccess } from "@/services/commerce/order-access";
import { checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody } from "@/services/commerce/http";
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceOrderAccess();
    const { orderId } = await params;
    if (!z.string().uuid().safeParse(orderId).success) throw new CommerceError("Pedido não encontrado.", 404);
    const input = await readCommerceBody(request, z.object({ seenThrough: z.string().datetime({ offset: true }) }).strict());
    if (!await markOrderSeen(session.tenantId, session.userId, orderId, input.seenThrough)) throw new CommerceError("Pedido não encontrado.", 404);
    return commerceJson({ ok: true });
  } catch (error) { return commerceFailure(error, "orders.seen"); }
}
