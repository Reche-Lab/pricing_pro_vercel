import { generateQuotePdf } from "./quote-pdf";
import type { getBuyerQuote } from "@/repositories/commerce-buyer-quotes";
import type { QuoteDetail } from "@/repositories/quotes";
import { formatDeliveryDate } from "@/domain/shipping/production-lead-time";

export async function generateBuyerQuotePdf(quote: Awaited<ReturnType<typeof getBuyerQuote>>, tenant: { name: string; logo_url: string | null; company_phone: string | null; company_site: string | null; company_document: string | null }) {
  const { billing, address } = quote.contact, production = quote.snapshot.production;
  const shippingNote = quote.shipping_cents === null ? "Frete nao incluido. Calcule a entrega antes de comprar." : quote.snapshot.delivery === "pickup" ? "Retirada no local." : `Frete: ${quote.snapshot.shippingOption?.name ?? "Entrega da loja"}.`;
  const notes = [shippingNote, `Producao: ${production.productionDays} dias uteis apos pagamento e aprovacao das artes.`,
    quote.snapshot.shippingOption?.insuranceValueCents !== undefined ? `Valor declarado para seguro na cotacao: ${(quote.snapshot.shippingOption.insuranceValueCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.` : "",
    production.transportDays !== null ? `Transporte: ${production.transportDays} dias uteis.` : "Prazo de transporte a confirmar.",
    production.deliveryDate ? `Recebimento estimado se confirmado na data do orcamento: ${formatDeliveryDate(production.deliveryDate)}.` : "",
    "Este orcamento nao e um pedido, nao reserva estoque e nao gera cobranca. Precos, disponibilidade, artes e frete serao conferidos antes da compra."].filter(Boolean).join("\n");
  const detail: QuoteDetail = {
    id: quote.id, status: new Date(quote.valid_until).getTime() <= Date.now() ? "expired" : "draft", valid_until: quote.valid_until,
    created_at: quote.created_at, subtotal: String(quote.subtotal_cents / 100), shipping_total: String((quote.shipping_cents ?? 0) / 100),
    discount_total: String((quote.snapshot.artworkDiscountCents ?? 0) / 100), discount_reason: "Benefício por arte preparada e aprovada", grand_total: String(quote.total_cents / 100), margin_amount: "0", margin_percent: "0", notes,
    delivery_method: quote.snapshot.delivery === "pickup" ? "pickup" : "delivery", customer_id: null,
    customer_name: billing.name, customer_document: billing.document, customer_email: billing.email, customer_phone: billing.phone,
    customer_postal_code: address?.postalCode ?? billing.postalCode, customer_address_line: address?.street ?? billing.street,
    customer_address_number: address?.number ?? billing.number, customer_address_complement: address?.complement ?? billing.complement,
    customer_district: address?.district ?? billing.district, customer_city: address?.city ?? billing.city, customer_state: address?.state ?? billing.state,
    delivery_attention_to: address?.attention ?? null, customer_external_olist_id: null, external_crm_id: null, created_by_name: null,
  };
  return generateQuotePdf({ tenantName: tenant.name, tenant, quote: detail, productionEstimate: production, items: quote.snapshot.items.map(item => ({ id: item.id, description: item.name, quantity: item.quantity, unit_price: String(item.unitCents / 100), total_price: String((item.totalCents + (item.artworkDiscountCents ?? 0)) / 100), artwork_name: item.artworkName })) });
}
