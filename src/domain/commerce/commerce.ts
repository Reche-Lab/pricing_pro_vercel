import { calculateCompositeQuote } from "@/domain/quotes/composite-pricing";
import { calculateCurveUnitPrice } from "@/domain/pricing/pricing";
import type { PlatformRule, PricingCurve } from "@/domain/pricing/types";
import type { CartLine } from "./schemas";
import type { CommerceArtworkOptions } from "./artwork-options";

export class CommerceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type PriceProduct = {
  id: string;
  name: string;
  minQuantity: number;
  maxQuantity: number;
  maxArtworks: number;
  pricingRule: "per_art" | "total" | "average";
  curve: PricingCurve;
  platform: PlatformRule;
  personalized?: boolean;
  artworkOptions?: CommerceArtworkOptions;
};
export function distributeQuantity(total: number, groups: number) {
  if (
    !Number.isInteger(total) ||
    !Number.isInteger(groups) ||
    groups < 1 ||
    groups > 20 ||
    total < groups ||
    total > 50000
  )
    throw new CommerceError("Quantidade de artes inválida.");
  return Array.from(
    { length: groups },
    (_, index) => Math.floor(total / groups) + (index < total % groups ? 1 : 0),
  );
}
export function commerceSelectionError(
  lines: CartLine[],
  product: Pick<PriceProduct, "id" | "minQuantity" | "maxQuantity" | "maxArtworks">,
): string | null {
  if (!lines.length || lines.some(line => !Number.isInteger(line.quantity) || line.quantity < 1))
    return "Informe quantidades válidas de produtos e artes para consultar a entrega.";
  if (lines.some(line => line.productId !== product.id) || new Set(lines.map(line => line.id)).size !== lines.length)
    return "Revise os itens do produto antes de consultar a entrega.";
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (quantity < product.minQuantity || quantity > product.maxQuantity)
    return `Selecione de ${product.minQuantity} a ${product.maxQuantity} unidades para consultar a entrega.`;
  if (lines.length > Math.min(20, product.maxArtworks))
    return `Este produto permite até ${product.maxArtworks} artes. Ajuste a quantidade de artes.`;
  return null;
}
export function calculateCart(lines: CartLine[], products: PriceProduct[], readyArtworkKeys: ReadonlySet<string> = new Set()) {
  if (
    new Set(lines.map((line) => line.id)).size !== lines.length ||
    lines.length > 40
  )
    throw new CommerceError("Grupos de arte inválidos.");
  const byId = new Map(products.map((product) => [product.id, product]));
  const source = lines.map((line) => {
    const product = byId.get(line.productId);
    if (!product)
      throw new CommerceError(
        "Um produto não está mais disponível. Revise o carrinho.",
        409,
      );
    const group = lines.filter((item) => item.productId === product.id);
    const total = group.reduce((sum, item) => sum + item.quantity, 0);
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      total < product.minQuantity ||
      total > product.maxQuantity ||
      group.length > product.maxArtworks
    )
      throw new CommerceError(`Revise as quantidades de ${product.name}.`);
    const reference =
      product.pricingRule === "total"
        ? total
        : product.pricingRule === "average"
          ? Math.round(total / group.length)
          : line.quantity;
    const price = calculateCurveUnitPrice(reference, product.curve);
    return {
      id: line.id,
      productVariantId: product.id,
      description: product.name,
      artworkName: line.artworkName,
      quantity: line.quantity,
      unitCost: 0,
      curve: {
        mode: "step" as const,
        points: [{ quantity: 1, unitPrice: price }],
      },
    };
  });
  if (!source.length) return { totalCents: 0, items: [], artworkDiscountCents: 0, baseSubtotalCents: 0 };
  const result = calculateCompositeQuote({
    items: source,
    pricingRule: "per_item",
    platform: byId.get(lines[0].productId)!.platform,
  });
  const items = result.items.map((item) => ({
    id: item.id,
    productId: item.productVariantId,
    name: item.description,
    quantity: item.quantity,
    artworkName: item.artworkName,
    unitCents: Math.round(item.finalUnitPrice * 100),
    totalCents: Math.round(item.subtotal * 100),
    artworkDiscountCents: 0,
  }));
  const discounted = new Set<string>();
  for (const line of lines) {
    const key = `${line.productId}:${line.artworkId}`;
    const options = byId.get(line.productId)?.artworkOptions;
    if (!options?.discountFixedCents || byId.get(line.productId)?.personalized === false || line.preparation === "team" || !line.artworkId || !readyArtworkKeys.has(key) || discounted.has(key)) continue;
    discounted.add(key);
    const group = items.filter(item => lines.some(l => l.id === item.id && l.productId === line.productId && l.artworkId === line.artworkId && l.preparation !== "team"));
    const base = group.reduce((sum, item) => sum + item.totalCents, 0);
    const discount = Math.min(options.discountFixedCents, Math.floor(base * options.maxDiscountPercent / 100));
    let allocated = 0;
    group.forEach((item, index) => {
      const amount = index === group.length - 1 ? discount - allocated : Math.floor(discount * item.totalCents / Math.max(1, base));
      allocated += amount; item.artworkDiscountCents = amount; item.totalCents -= amount;
    });
  }
  const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 0 ||
    totalCents > 100000000
  )
    throw new CommerceError("Total fora do limite permitido.");
  const artworkDiscountCents = items.reduce((sum, item) => sum + item.artworkDiscountCents, 0);
  return { totalCents, items, artworkDiscountCents, baseSubtotalCents: totalCents + artworkDiscountCents };
}
export function validatePayment(
  expected: { id: string; total_cents: number; sellerId: string },
  actual: {
    external_reference?: string;
    transaction_amount?: number;
    currency_id?: string;
    collector_id?: number | string;
    status?: string;
  },
) {
  if (
    actual.external_reference !== expected.id ||
    actual.currency_id !== "BRL" ||
    !Number.isFinite(actual.transaction_amount) ||
    Math.round(actual.transaction_amount! * 100) !== expected.total_cents ||
    String(actual.collector_id) !== expected.sellerId
  )
    throw new CommerceError("O pagamento não corresponde a este pedido.", 409);
  return actual.status === "approved"
    ? "paid"
    : ["refunded", "charged_back"].includes(actual.status ?? "")
      ? "refunded"
      : "pending";
}
