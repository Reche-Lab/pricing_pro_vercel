import { z } from "zod";
import { cartLineSchema } from "@/domain/commerce/schemas";
import { commerceDeliveryEstimate } from "@/domain/commerce/delivery";
import { commerceProducts } from "@/repositories/commerce";
import { getCurrentSession } from "@/lib/auth/session";
import { CommerceError } from "@/domain/commerce/commerce";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { requireCommercePreview } from "@/services/commerce/preview";
import { previewCarrierDelivery } from "@/services/commerce/preview-delivery";
import { checkCommerceOrigin, readCommerceBody, commerceJson, commerceFailure } from "@/services/commerce/http";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    checkCommerceOrigin(request);
    const store = await requireCommercePreview((await params).slug);
    const session = await getCurrentSession();
    if (!session || session.tenantId !== store.tenant_id) throw new CommerceError("Entre novamente na conta administrativa.", 401);
    const blocked = await enforcePublicRateLimit(request, store.tenant_id, { action: "commerce.preview.checkout-delivery", limit: 15, windowSeconds: 60 });
    if (blocked) return blocked;
    const input = await readCommerceBody(request, z.object({ postalCode: z.string().regex(/^\d{8}$/), revision: z.number().int().nonnegative(), lines: z.array(cartLineSchema).min(1).max(40) }).strict());
    const products = await commerceProducts(store.tenant_id);
    for (const id of new Set(input.lines.map(line => line.productId))) commerceDeliveryEstimate(store.settings, input.postalCode, input.lines.filter(line => line.productId === id), products);
    const warnings: string[] = [];
    let carrier: Awaited<ReturnType<typeof previewCarrierDelivery>> = null;
    try { carrier = await previewCarrierDelivery(session.userId, store.tenant_id, input.postalCode, input.lines, products); }
    catch (error) { if (!(error instanceof CommerceError)) throw error; warnings.push(error.message); }
    return commerceJson({ options: [
      ...(store.settings.deliveryEnabled ? [{ id: "delivery", name: "Entrega", priceCents: store.settings.deliveryCents, description: store.settings.deliveryDescription }] : []),
      ...(carrier?.options ?? []),
    ], warnings });
  } catch (error) { return commerceFailure(error, "preview.checkout.delivery"); }
}
