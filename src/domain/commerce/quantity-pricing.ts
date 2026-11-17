import { calculateCart, CommerceError, type PriceProduct } from "./commerce";
import { commercePriceSummary } from "./offers";

export type QuantityPrice = { quantity: number; unitCents: number; totalCents: number; savingsCents: number; discountPercent: number };
export type PublicQuantityPricing = {
  originalUnitCents: number;
  mode: "interpolated" | "step";
  minimumPurchase: QuantityPrice;
  bestPrice: QuantityPrice;
  rows: QuantityPrice[];
};

export function commerceQuantityPricing(product: PriceProduct, summary = commercePriceSummary(product)): PublicQuantityPricing {
  const price = (quantity: number): QuantityPrice => {
    const cart = calculateCart([{ id: "public-price", productId: product.id, quantity, artworkName: "", artworkId: null }], [product]);
    const reference = summary.originalUnitCents * quantity;
    const savingsCents = Math.max(0, reference - cart.totalCents);
    return { quantity, unitCents: cart.items[0].unitCents, totalCents: cart.totalCents, savingsCents, discountPercent: reference > 0 ? Math.floor(savingsCents * 100 / reference) : 0 };
  };
  const minimumPurchase = price(product.minQuantity), bestPrice = price(summary.discountQuantity);
  const anchors = [...new Set(product.curve.points.map(point => point.quantity))].filter(q => Number.isInteger(q) && q >= product.minQuantity && q <= product.maxQuantity).sort((a, b) => a - b);
  // Keep useful anchors and common comparison quantities without sending thousands of points to the browser.
  const quantities = new Set([product.minQuantity, bestPrice.quantity, product.maxQuantity]);
  for (const q of anchors.length <= 6 ? anchors : [anchors[0], anchors[Math.floor(anchors.length / 2)], anchors.at(-1)!]) quantities.add(q);
  for (const q of [10, 25, 50, 100, 250, 500, 1000]) if (q >= product.minQuantity && q <= product.maxQuantity && quantities.size < 12) quantities.add(q);
  const rows = [...quantities].sort((a, b) => a - b).flatMap(q => {
    try { return [q === minimumPurchase.quantity ? minimumPurchase : q === bestPrice.quantity ? bestPrice : price(q)]; }
    catch (error) { if (error instanceof CommerceError && error.details?.code === "cart_total_limit") return []; throw error; }
  });
  return { originalUnitCents: summary.originalUnitCents, mode: product.curve.mode, minimumPurchase, bestPrice, rows };
}

export function quantitySelection(value: string | null | undefined, product: Pick<PriceProduct, "minQuantity" | "maxQuantity"> & { quantityPricing?: PublicQuantityPricing }) {
  if (!value || !/^\d{1,5}$/.test(value)) return product.minQuantity;
  const quantity = Number(value);
  return quantity >= product.minQuantity && quantity <= product.maxQuantity && (!product.quantityPricing || product.quantityPricing.rows.some(row => row.quantity === quantity)) ? quantity : product.minQuantity;
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const publicPriceMoney = (cents: number) => money.format(cents / 100);
export function quantityPriceDescription(product: { personalized?: boolean; quantityPricing?: PublicQuantityPricing }) {
  const pricing = product.quantityPricing;
  if (!pricing) return "";
  const best = pricing.bestPrice, artwork = product.personalized ? " com uma mesma arte" : "";
  const discount = best.discountPercent > 0 ? ` Até ${best.discountPercent}% de economia por quantidade.` : "";
  return `A partir de ${publicPriceMoney(best.unitCents)}/un. em ${best.quantity.toLocaleString("pt-BR")} unidades${artwork}.${discount} Compra mínima: ${pricing.minimumPurchase.quantity.toLocaleString("pt-BR")} un. por ${publicPriceMoney(pricing.minimumPurchase.totalCents)}. Frete à parte.`;
}
