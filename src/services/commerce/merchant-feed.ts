import type { publicCommerceProduct } from "@/repositories/commerce";
import type { StoreSettings } from "@/domain/commerce/schemas";
import { commerceMerchantSchema } from "@/domain/commerce/merchant";
import { commerceStoreUrl } from "@/domain/commerce/domains";
import { commerceProductPath } from "@/domain/commerce/product-urls";
import { commerceSiteOrigin } from "./store-seo";

export function merchantFeedEligible(product: ReturnType<typeof publicCommerceProduct>) {
  const merchant = commerceMerchantSchema.safeParse(product.merchant);
  return merchant.success && merchant.data.enabled && Boolean(product.quantityPricing?.minimumPurchase.totalCents && product.quantityPricing.minimumPurchase.totalCents > 0) && /^https:\/\//.test(product.imageUrl);
}
function xml(value: string | number) {
  // XML 1.0 disallows control characters even when HTML/JSON can represent them.
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[value]!);
}
export function commerceMerchantFeed(slug: string, settings: StoreSettings, products: ReturnType<typeof publicCommerceProduct>[], origin = commerceSiteOrigin()) {
  const base = commerceStoreUrl(slug, origin), tag = (name: string, value: string | number) => `<g:${name}>${xml(value)}</g:${name}>`;
  const items = products.filter(merchantFeedEligible).map(product => {
    const merchant = commerceMerchantSchema.parse(product.merchant), minimum = product.quantityPricing!.minimumPurchase;
    const url = `${commerceProductPath(base, product)}?quantidade=${minimum.quantity}`;
    const description = `${product.description} Pedido de ${minimum.quantity} unidades${product.personalized ? " com uma mesma arte" : ""}. O preço informado é o total dos produtos, sem frete e sem benefício condicionado à aprovação da arte. Produção e transporte têm prazos separados.`.trim();
    return `<item>${tag("id", product.id)}${tag("title", `${product.name} · ${minimum.quantity} unidades${product.personalized ? " · 1 arte" : ""}`)}${tag("description", description.slice(0, 5000))}${tag("link", url)}${tag("image_link", product.imageUrl)}${tag("price", `${(minimum.totalCents / 100).toFixed(2)} BRL`)}${tag("availability", "in_stock")}${tag("condition", "new")}${tag("unit_pricing_measure", `${minimum.quantity}ct`)}${tag("unit_pricing_base_measure", "1ct")}${merchant.identifiersAbsent ? tag("identifier_exists", "no") : ""}${merchant.brand ? tag("brand", merchant.brand) : ""}${merchant.gtin ? tag("gtin", merchant.gtin) : ""}${merchant.mpn ? tag("mpn", merchant.mpn) : ""}${(product.media ?? []).filter(media => media.kind === "image" && media.url !== product.imageUrl).slice(0, 9).map(media => tag("additional_image_link", media.url)).join("")}</item>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(settings.name)}</title><link>${xml(base)}</link><description>${xml(settings.description)}</description>${items}</channel></rss>`;
}
