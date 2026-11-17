import type { CommerceProduct } from "@/repositories/commerce";
import { publicCommerceProduct } from "@/repositories/commerce";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
export const discoverySource: CommerceProduct = {
  id: "00000000-0000-4000-8000-000000000001", variantId: "00000000-0000-4000-8000-000000000002", slug: "botton-3-5-cm", name: "Botton - 3,5 cm", description: "Botton personalizado de metal", category: "Bottons", imageUrl: "https://images.example.test/botton.webp", minQuantity: 10, maxQuantity: 1000, maxArtworks: 10, personalized: true, pricingRule: "per_art",
  geometry: { shape: "circle", widthMm: 35, heightMm: 35, cornerStyle: "sharp", cornerRadiusMm: 0, rotationDegrees: 0, allowPrintRotation: true }, margins: { bleedMm: 2, safeMarginMm: 2 },
  curve: { mode: "step", points: [{ quantity: 1, unitPrice: 5 }, { quantity: 100, unitPrice: 3 }, { quantity: 1000, unitPrice: 2 }] }, platform: { commissionRate: 0, fixedFee: 0, sellerShippingCost: 0, sellerShippingThreshold: 0 },
};
export const discoveryProduct = publicCommerceProduct(discoverySource);
export const discoverySettings = storeSettingsSchema.parse({ name: "Ground Shop", description: "Personalizados", contactEmail: "loja@example.test", contactPhone: "", logoUrl: "", bannerUrl: "", accent: "#047857", pickupEnabled: false, pickupAddress: "", deliveryEnabled: false, deliveryCents: 0, deliveryDescription: "", terms: "Condições" });
