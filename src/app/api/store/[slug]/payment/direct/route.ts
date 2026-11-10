import { z } from "zod";
import { CommerceError } from "@/domain/commerce/commerce";
import { directPaymentSchema } from "@/domain/commerce/transparent-payment";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { buyerContext, checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody } from "@/services/commerce/http";
import { buyerPaymentState, refreshDirectPayment, startDirectPayment } from "@/services/commerce/transparent-payments";
import { scheduleCommerceOlist } from "@/services/commerce/olist-schedule";
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { store, session } = await buyerContext((await params).slug, false, true);
    if (!session.customer_id) throw new CommerceError("Entre na sua conta.", 401);
    const orderId = z.string().uuid().safeParse(new URL(request.url).searchParams.get("orderId"));
    if (!orderId.success) throw new CommerceError("Pedido inválido.");
    return commerceJson(await buyerPaymentState(store.tenant_id, session.customer_id, orderId.data));
  } catch (error) { return commerceFailure(error, "payment.direct.status"); }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    checkCommerceOrigin(request);
    const { store, session } = await buyerContext((await params).slug, false, true);
    if (!session.customer_id) throw new CommerceError("Entre na sua conta.", 401);
    const blocked = await enforcePublicRateLimit(request, `${store.tenant_id}:${session.customer_id}`, { action: "commerce.payment.direct", limit: 12, windowSeconds: 600 });
    if (blocked) return blocked;
    const input = await readCommerceBody(request, directPaymentSchema);
    await startDirectPayment(store.tenant_id, session.customer_id, input);
    scheduleCommerceOlist(store.tenant_id, input.orderId);
    return commerceJson(await buyerPaymentState(store.tenant_id, session.customer_id, input.orderId));
  } catch (error) { return commerceFailure(error, "payment.direct.start"); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    checkCommerceOrigin(request);
    const { store, session } = await buyerContext((await params).slug, false, true);
    if (!session.customer_id) throw new CommerceError("Entre na sua conta.", 401);
    const blocked = await enforcePublicRateLimit(request, `${store.tenant_id}:${session.customer_id}`, { action: "commerce.payment.refresh", limit: 30, windowSeconds: 300 });
    if (blocked) return blocked;
    const { orderId } = await readCommerceBody(request, z.object({ orderId: z.string().uuid() }).strict());
    const state = await refreshDirectPayment(store.tenant_id, session.customer_id, orderId);
    scheduleCommerceOlist(store.tenant_id, orderId);
    return commerceJson(state);
  } catch (error) { return commerceFailure(error, "payment.direct.refresh"); }
}
