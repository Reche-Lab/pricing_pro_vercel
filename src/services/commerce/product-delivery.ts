import { commerceDeliveryEstimate, productDeliverySchema, type CommerceDeliveryResult } from "@/domain/commerce/delivery";
import { CommerceError } from "@/domain/commerce/commerce";
import { commerceProducts, getCommerceStore } from "@/repositories/commerce";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { requireCommercePreview } from "./preview";
import { getCurrentSession } from "@/lib/auth/session";
import { previewCarrierDelivery } from "./preview-delivery";
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
    const products = await commerceProducts(store.tenant_id);
    const result: CommerceDeliveryResult = commerceDeliveryEstimate(store.settings, input.postalCode, input.lines, products);
    if (preview) {
      const session = await getCurrentSession();
      if (!session || session.tenantId !== store.tenant_id) throw new CommerceError("Entre novamente na conta administrativa deste tenant.", 401);
      try {
        const carrier = await previewCarrierDelivery(session.userId, store.tenant_id, input.postalCode, input.lines, products);
        if (carrier) { result.options.push(...carrier.options); result.previewCarrier = true; }
        else if (!result.options.length) result.warnings = ["Ative o Melhor Envio em Configurações > Melhor Envio para testar a cotação, ou configure entrega fixa/retirada em Loja online."];
      } catch (error) {
        if (!(error instanceof CommerceError)) throw error;
        result.warnings = [error.message];
        console.warn("Commerce preview carrier quote unavailable.", { tenantId: store.tenant_id, provider: "melhor_envio", status: error.status, message: error.message });
      }
    }
    console.info("Commerce product delivery estimated.", { tenantId: store.tenant_id, preview, optionCount: result.options.length,
      tariff: result.previewCarrier ? "melhor_envio_preview" : "store_fixed", warnings: result.warnings?.length ?? 0 });
    return commerceJson(result);
  } catch (error) { return commerceFailure(error, preview ? "preview.delivery" : "product.delivery"); }
}
