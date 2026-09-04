import type { QuoteDetail, QuoteItemRow } from "@/repositories/quotes";
import { quoteDiscountLabel } from "@/domain/quotes/discount";
import { parsePixPaymentSnapshot, pixKeyTypeLabel } from "@/domain/payments/pix";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function buildQuoteWhatsAppText(input: { quote: QuoteDetail; items: QuoteItemRow[] }): string {
  const { quote, items } = input;
  const pixPayment = parsePixPaymentSnapshot(quote.pix_payment_snapshot);
  const lines = [
    "*ORCAMENTO*",
    quote.customer_name ? `*Cliente:* ${quote.customer_name}` : null,
    quote.delivery_attention_to ? `*Aos cuidados de:* ${quote.delivery_attention_to}` : null,
    "",
    ...items.map(
      (item) =>
        [
          `*${item.quantity}x* ${item.description}`,
          item.artwork_name ? `Arte: ${item.artwork_name}` : null,
          item.artworks?.length ? `Arquivo da arte: ${item.artworks.map((artwork) => artwork.file_name).join(", ")}` : null,
          item.reference_quantity ? `Qtd. referencia: ${item.reference_quantity} (${formatPricingRule(item.pricing_rule)})` : null,
          `${brl.format(Number(item.unit_price))}/un - ${brl.format(Number(item.total_price))}`
        ].filter(Boolean).join("\n")
    ),
    "",
    `*Subtotal:* ${brl.format(Number(quote.subtotal))}`,
    Number(quote.shipping_total) > 0 ? `*Frete:* ${brl.format(Number(quote.shipping_total))}` : null,
    Number(quote.discount_total) > 0
      ? `*${quoteDiscountLabel(quote.discount_type, Number(quote.discount_value ?? quote.discount_total), Number(quote.discount_total))}:* -${brl.format(Number(quote.discount_total))}`
      : null,
    Number(quote.discount_total) > 0 && quote.discount_reason ? `*Motivo do desconto:* ${quote.discount_reason}` : null,
    `*Total:* ${brl.format(Number(quote.grand_total))}`,
    quote.valid_until ? `*Validade:* ${formatDate(quote.valid_until)}` : null,
    pixPayment ? "" : null,
    pixPayment ? "*PAGAMENTO VIA PIX*" : null,
    pixPayment ? `*Chave ${pixKeyTypeLabel(pixPayment.keyType)}:* ${pixPayment.key}` : null,
    pixPayment?.beneficiaryName ? `*Favorecido:* ${pixPayment.beneficiaryName}` : null,
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
