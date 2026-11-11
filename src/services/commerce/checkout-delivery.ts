import { z } from "zod";
import { CommerceError } from "@/domain/commerce/commerce";
import { commerceDeliveryEstimate } from "@/domain/commerce/delivery";
import { buyerContext, checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody } from "./http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { calculateCommerceCart, commerceProducts, commerceTransaction, hashCommerceToken } from "@/repositories/commerce";
import { publicCarrierDelivery } from "./carrier-delivery";

export async function checkoutDelivery(request: Request, slug: string) {
  try {
    checkCommerceOrigin(request);
    const { store, session } = await buyerContext(slug);
    const blocked = await enforcePublicRateLimit(request, store.tenant_id, { action: "commerce.checkout.delivery", limit: 15, windowSeconds: 60 });
    if (blocked) return blocked;
    const input = await readCommerceBody(request, z.object({ postalCode: z.string().regex(/^\d{8}$/).refine(v => v !== "00000000"), revision: z.number().int().nonnegative() }).strict());
    if (input.revision !== session.revision || !session.cart.length) throw new CommerceError("O carrinho mudou. Atualize antes de calcular o frete.", 409);
    const products = await commerceProducts(store.tenant_id);
    const calculation = await calculateCommerceCart(store.tenant_id, session.id, session.cart, products);
    // Validate every product using the same rules as the product inquiry, without assuming a single-product cart.
    for (const id of new Set(session.cart.map(line => line.productId)))
      commerceDeliveryEstimate(store.settings, input.postalCode, session.cart.filter(line => line.productId === id), products);
    let options: { id: string; name: string; priceCents: number; description?: string; quoteId?: string; transitDays?: number | null }[] = [];
    if (store.settings.deliveryEnabled) options.push({ id: "delivery", name: "Entrega", priceCents: store.settings.deliveryCents, description: store.settings.deliveryDescription, transitDays: store.settings.deliveryTransitDays });
    if (store.settings.pickupEnabled) options.push({ id: "pickup", name: "Retirada na loja", priceCents: 0, description: store.settings.pickupAddress });
    const warnings: string[] = [];
    if (store.settings.carrierEnabled) {
      try {
        const carrier = await publicCarrierDelivery(store.tenant_id, input.postalCode, session.cart, products, calculation.totalCents);
        if (carrier) options.push(...carrier.options);
      } catch (error) { if (!(error instanceof CommerceError)) throw error; warnings.push(error.message); }
    }
    options = await commerceTransaction(async client => {
      const saved = [];
      for (const option of options) {
        if (!option.id.startsWith("melhor_envio:")) { saved.push(option); continue; }
        const result = await client.query<{ id: string }>(
          `insert into commerce_shipping_quotes(tenant_id,session_id,cart_revision,store_revision,cart_hash,postal_code,option)
           values($1,$2,$3,$4,$5,$6,$7) returning id`,
          [store.tenant_id, session.id, session.revision, store.revision, hashCommerceToken(JSON.stringify(calculation)), input.postalCode, JSON.stringify(option)]);
        saved.push({ ...option, quoteId: result.rows[0].id });
      }
      return saved;
    });
    console.info("Commerce checkout delivery quoted.", { tenantId: store.tenant_id, sessionId: session.id, revision: session.revision, optionCount: options.length, warningCount: warnings.length });
    return commerceJson({ options, warnings, postalCode: input.postalCode, expiresInSeconds: 900 });
  } catch (error) { return commerceFailure(error, "checkout.delivery"); }
}
