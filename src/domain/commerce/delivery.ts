import { z } from "zod";
import { cartLineSchema, type StoreSettings, type CartLine } from "./schemas";
import { calculateCart, CommerceError, type PriceProduct } from "./commerce";

export const productDeliverySchema = z.object({
  postalCode: z.string().trim().regex(/^\d{5}-?\d{3}$/, "Informe um CEP com oito números.")
    .transform(value => value.replace("-", "")).refine(value => value !== "00000000", "Informe um CEP válido."),
  lines: z.array(cartLineSchema).min(1).max(20),
}).strict();

export function commerceDeliveryEstimate(
  settings: Pick<StoreSettings, "deliveryEnabled" | "deliveryCents" | "deliveryDescription" | "pickupEnabled" | "pickupAddress">,
  postalCode: string, lines: CartLine[], products: PriceProduct[],
) {
  // Validate published availability and quantities without creating or updating a buyer cart.
  if (!/^\d{5}-?\d{3}$/.test(postalCode) || postalCode.replace("-", "") === "00000000")
    throw new CommerceError("Informe um CEP válido.");
  if (!lines.length || new Set(lines.map(line => line.productId)).size !== 1)
    throw new CommerceError("Consulte um produto de cada vez.");
  calculateCart(lines, products);
  const options: { id: string; name: string; priceCents: number; description?: string }[] = [];
  if (settings.deliveryEnabled) options.push({ id: "delivery", name: settings.deliveryDescription || "Entrega", priceCents: settings.deliveryCents });
  if (settings.pickupEnabled) options.push({ id: "pickup", name: "Retirada na loja", priceCents: 0, description: settings.pickupAddress });
  return { postalCode: postalCode.replace("-", ""), estimated: true as const, options };
}
