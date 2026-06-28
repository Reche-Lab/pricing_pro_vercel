import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function buildQuoteWhatsAppText(input: { quote: QuoteDetail; items: QuoteItemRow[] }): string {
  const { quote, items } = input;
  const lines = [
    "*ORCAMENTO*",
    quote.customer_name ? `*Cliente:* ${quote.customer_name}` : null,
    "",
    ...items.map(
      (item) =>
        [
          `*${item.quantity}x* ${item.description}`,
          item.artwork_name ? `Arte: ${item.artwork_name}` : null,
          item.reference_quantity ? `Qtd. referencia: ${item.reference_quantity} (${formatPricingRule(item.pricing_rule)})` : null,
          `${brl.format(Number(item.unit_price))}/un - ${brl.format(Number(item.total_price))}`
        ].filter(Boolean).join("\n")
    ),
    "",
    `*Subtotal:* ${brl.format(Number(quote.subtotal))}`,
    Number(quote.shipping_total) > 0 ? `*Frete:* ${brl.format(Number(quote.shipping_total))}` : null,
    `*Total:* ${brl.format(Number(quote.grand_total))}`,
    quote.valid_until ? `*Validade:* ${formatDate(quote.valid_until)}` : null,
    "",
    "Valores sujeitos a confirmacao ate o aceite da proposta."
  ];

  return lines.filter((line) => line !== null).join("\n");
}

function formatPricingRule(rule: string | null | undefined) {
  if (rule === "per_art_average") return "por artes";
  if (rule === "aggregate_total") return "por total";
  return "por item";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}
