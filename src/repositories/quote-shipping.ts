import { withTenantContext } from "@/lib/db/client";
import { pickupNotes, quoteShippingEditBlock, QuoteShippingError } from "@/domain/quotes/shipping";
import { rebalanceQuotePaymentInstallments, type QuoteDetail } from "./quotes";
import { roundMoney } from "@/domain/pricing/pricing";

export async function setQuotePickup(userId: string, tenantId: string, quoteId: string, input: { expectedShippingTotal: number; reason: string }) {
  return withTenantContext(userId, tenantId, async client => {
    const { rows: [quote] } = await client.query<QuoteDetail>(
      "select * from quotes where tenant_id = $1 and id = $2 for update", [tenantId, quoteId]
    );
    if (!quote) throw new QuoteShippingError("Orçamento não encontrado.", 404);
    const blocked = quoteShippingEditBlock(quote);
    if (blocked) throw new QuoteShippingError(blocked);
    if (Math.abs(Number(quote.shipping_total) - input.expectedShippingTotal) >= 0.005) throw new QuoteShippingError("O frete mudou. Atualize a página e confirme o novo total.");
    const grandTotal = roundMoney(Number(quote.subtotal) - Number(quote.discount_total));
    const pending = Boolean(quote.external_olist_order_id);
    const notes = pickupNotes(quote.notes);
    if (quote.delivery_method === "pickup" && Number(quote.shipping_total) === 0) {
      return { shippingTotal: 0, grandTotal, olistPending: Boolean(quote.shipping_olist_sync_pending), alreadyPickup: true };
    }
    await client.query(`update quotes set shipping_total = 0, grand_total = $3, delivery_method = 'pickup',
      shipping_olist_sync_pending = $4, notes = $5, updated_at = now() where tenant_id = $1 and id = $2`,
    [tenantId, quoteId, grandTotal, pending, notes]);
    await rebalanceQuotePaymentInstallments(client, tenantId, quoteId, grandTotal);
    const before = { quote: { shippingTotal: Number(quote.shipping_total), grandTotal: Number(quote.grand_total), deliveryMethod: quote.delivery_method ?? "delivery" } };
    const after = { quote: { shippingTotal: 0, grandTotal, deliveryMethod: "pickup", olistPending: pending } };
    await client.query(`insert into quote_edit_logs (tenant_id, quote_id, edited_by, reason, before_snapshot, after_snapshot)
      values ($1, $2, $3, $4, $5, $6)`, [tenantId, quoteId, userId, input.reason, JSON.stringify(before), JSON.stringify(after)]);
    await client.query(`insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
      values ($1, $2, 'quotes.shipping_removed', 'quote', $3, $4)`, [tenantId, userId, quoteId, JSON.stringify({ reason: input.reason, before, after, orderId: quote.external_olist_order_id ?? null })]);
    return { shippingTotal: 0, grandTotal, olistPending: pending, alreadyPickup: false };
  });
}

export async function confirmQuoteShippingOlistSync(userId: string, tenantId: string, quoteId: string, orderId: string, expectedShippingTotal = 0, deliveryMethod = "pickup") {
  return withTenantContext(userId, tenantId, async client => {
    const result = await client.query(`update quotes set shipping_olist_sync_pending = false, updated_at = now()
      where tenant_id = $1 and id = $2 and external_olist_order_id = $3 and delivery_method = $5 and shipping_total = $4
      and external_olist_invoice_id is null returning id`, [tenantId, quoteId, orderId, expectedShippingTotal, deliveryMethod]);
    if (!result.rows[0]) throw new QuoteShippingError("O orçamento mudou durante a conferência. Atualize a página.");
    await client.query(`insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
      values ($1, $2, 'quotes.shipping_olist_verified', 'quote', $3, $4)`, [tenantId, userId, quoteId, JSON.stringify({ orderId, shippingTotal: expectedShippingTotal, deliveryMethod })]);
  });
}
