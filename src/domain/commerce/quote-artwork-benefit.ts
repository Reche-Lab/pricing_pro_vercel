import type { CartLine } from "./schemas";
import type { CommerceArtworkOptions } from "./artwork-options";

export type QuoteArtworkBenefit = {
  productId: string; name: string; percent: number; limitPerArtworkCents: number;
  artworkGroups: number; additionalDiscountCents: number;
};
type Product = { id: string; name: string; personalized?: boolean; artworkOptions?: CommerceArtworkOptions };
type Calculation = { items: { id: string; totalCents: number; artworkDiscountCents?: number }[] };

/** Conditional estimate only. Actual eligibility is checked again by server pricing at purchase. */
export function quoteArtworkBenefits(lines: readonly CartLine[], products: readonly Product[], calculation: Calculation | null): QuoteArtworkBenefit[] {
  if (!calculation) return [];
  return products.flatMap(product => {
    const options = product.artworkOptions;
    if (!product.personalized || !options?.discountFixedCents || !options.maxDiscountPercent) return [];
    const groups = new Map<string, { base: number; applied: number }>();
    for (const line of lines.filter(item => item.productId === product.id)) {
      const item = calculation.items.find(item => item.id === line.id);
      if (!item) continue;
      const applied = item.artworkDiscountCents ?? 0;
      const key = line.artworkId || line.id, group = groups.get(key) ?? { base: 0, applied: 0 };
      group.base += item.totalCents + applied; group.applied += applied;
      groups.set(key, group);
    }
    let additionalDiscountCents = 0, artworkGroups = 0;
    for (const group of groups.values()) {
      const remaining = Math.max(0, Math.min(options.discountFixedCents, Math.floor(group.base * options.maxDiscountPercent / 100)) - group.applied);
      if (remaining > 0) { additionalDiscountCents += remaining; artworkGroups++; }
    }
    return additionalDiscountCents > 0 ? [{ productId: product.id, name: product.name, percent: options.maxDiscountPercent, limitPerArtworkCents: options.discountFixedCents, artworkGroups, additionalDiscountCents }] : [];
  });
}

export function quoteArtworkBenefitDescription(benefit: QuoteArtworkBenefit) {
  const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `${benefit.name}: até ${benefit.percent.toLocaleString("pt-BR")}% de desconto adicional, limitado a ${money(benefit.limitPerArtworkCents)} por arte/grupo. Para os itens deste orçamento, até ${money(benefit.additionalDiscountCents)} adicionais.`;
}
