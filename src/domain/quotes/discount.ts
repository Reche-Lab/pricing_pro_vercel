import { roundMoney } from "@/domain/pricing/pricing";

export type QuoteDiscountType = "none" | "fixed" | "percent";

export function calculateQuoteDiscount(subtotal: number, type: QuoteDiscountType, value: number) {
  const safeSubtotal = roundMoney(Math.max(0, Number.isFinite(subtotal) ? subtotal : 0));
  const safeValue = Math.max(0, Number.isFinite(value) ? value : 0);
  if (type === "none" || safeValue === 0) return { type: "none" as const, value: 0, total: 0 };
  if (type === "percent") {
    const percent = Math.min(100, safeValue);
    return { type, value: percent, total: roundMoney(safeSubtotal * percent / 100) };
  }
  const fixed = Math.min(safeSubtotal, roundMoney(safeValue));
  return { type, value: fixed, total: fixed };
}

export function quoteDiscountLabel(type: QuoteDiscountType | null | undefined, value: number, total: number) {
  if (type === "percent" && value > 0) return `Desconto (${formatPercent(value)}%)`;
  if (type === "fixed" && total > 0) return "Desconto (valor fixo)";
  return "Desconto";
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}
