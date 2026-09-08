import { commerceDeliveryEstimate, productDeliverySchema } from "@/domain/commerce/delivery";
import { CommerceError } from "@/domain/commerce/commerce";
import { commerceProducts, getCommerceStore } from "@/repositories/commerce";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { requireCommercePreview } from "./preview";
import { checkCommerceOrigin, readCommerceBody, commerceFailure, commerceJson } from "./http";

export async function productDelivery(request: Request, slug: string, preview = false) {
  try {
    checkCommerceOrigin(request);
    const store = preview ? await requireCommercePreview(slug) : await getCommerceStore(slug);
    if (!store) throw new CommerceError("Loja indisponível.", 404);
    const blocked = await enforcePublicRateLimit(request, store.tenant_id, {
      action: preview ? "commerce.preview.delivery" : "commerce.product.delivery", limit: 20, windowSeconds: 60,
    });
    if (blocked) return blocked;
    const input = await readCommerceBody(request, productDeliverySchema);
    const result = commerceDeliveryEstimate(store.settings, input.postalCode, input.lines, await commerceProducts(store.tenant_id));
    console.info("Commerce product delivery estimated.", { tenantId: store.tenant_id, preview, optionCount: result.options.length, tariff: "store_fixed" });
    return commerceJson(result);
  } catch (error) { return commerceFailure(error, preview ? "preview.delivery" : "product.delivery"); }
}
