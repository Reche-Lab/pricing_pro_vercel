import { z } from "zod";
import type { PoolClient } from "pg";
import { decryptTenantSecret } from "@/lib/crypto/secrets";
import type { CommerceOlistEmailReview } from "@/domain/commerce/olist";
import type { CommerceOrder } from "@/repositories/commerce";
import { sameOlistEmail } from "./olist-email";

const schema = z.object({
  tenantId: z.string().uuid(), orderId: z.string().uuid(), customerId: z.string().regex(/^[1-9]\d{0,14}$/),
  invoiceId: z.string().regex(/^[1-9]\d{0,14}$/).nullable(), billingEmail: z.string().email(), document: z.string().regex(/^\d{11}(\d{3})?$/),
  totalCents: z.number().int().nonnegative(), contactEmail: z.string(), contactNfeEmail: z.string(), recipients: z.array(z.string().email()).min(1).max(3),
  actorId: z.string().uuid(), approvedAt: z.string().datetime(),
}).strict();
export type OlistEmailConsent = z.infer<typeof schema>;

export function consentForOlistEmail(order: CommerceOrder, review: CommerceOlistEmailReview, actorId: string): OlistEmailConsent {
  return schema.parse({ tenantId: order.tenant_id, orderId: order.id, customerId: review.customerId, invoiceId: review.invoiceId,
    billingEmail: review.targetEmail, document: order.snapshot.billing!.document.replace(/\D/g, ""), totalCents: order.total_cents,
    contactEmail: review.contactEmail, contactNfeEmail: review.contactNfeEmail, recipients: review.olistRecipients, actorId, approvedAt: new Date().toISOString() });
}

export function consentAllowsOlistEmail(consent: OlistEmailConsent | null, order: CommerceOrder, review: CommerceOlistEmailReview) {
  return Boolean(consent && review.canUseOlistEmail && consent.tenantId === order.tenant_id && consent.orderId === order.id && consent.customerId === review.customerId && consent.invoiceId === review.invoiceId
    && consent.document === order.snapshot.billing?.document.replace(/\D/g, "") && consent.totalCents === order.total_cents && sameOlistEmail(consent.billingEmail, review.targetEmail)
    && sameOlistEmail(consent.contactEmail, review.contactEmail) && sameOlistEmail(consent.contactNfeEmail, review.contactNfeEmail)
    && review.olistRecipients.every(email => consent.recipients.some(allowed => sameOlistEmail(allowed, email))));
}

// Encrypted consent is authoritative only within this order/tenant. A later
// request to switch back to the purchase email revokes earlier ERP consent.
export async function latestOlistEmailConsent(client: PoolClient, tenantId: string, orderId: string): Promise<OlistEmailConsent | null> {
  const event = (await client.query(`select type,metadata from commerce_order_events where tenant_id=$1 and order_id=$2
    and type in ('olist.email_recipient_approved','olist.email_recipient_bound','olist.email_update_requested') order by created_at desc,id desc limit 1`, [tenantId, orderId])).rows[0];
  if (!event || event.type === "olist.email_update_requested" || typeof event.metadata?.consent_encrypted !== "string") return null;
  try { const parsed = schema.safeParse(decryptTenantSecret(event.metadata.consent_encrypted)); return parsed.success ? parsed.data : null; }
  catch { return null; }
}
