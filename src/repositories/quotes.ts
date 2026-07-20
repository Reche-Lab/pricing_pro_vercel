import { createHash, randomBytes } from "crypto";
import { calculateQuote, normalizePricingCurvePoints } from "@/domain/pricing/pricing";
import {
  calculateCompositeQuote,
  type CompositePricingRule,
  type CompositeQuoteInputItem
} from "@/domain/quotes/composite-pricing";
import { canTransitionQuoteStatus, createQuoteCalculationSnapshot } from "@/domain/quotes/quotes";
import type { QuoteStatus } from "@/domain/quotes/types";
import type { PricingCurve, PricingCurveMode } from "@/domain/pricing/types";
import { getPool, withTenantContext } from "@/lib/db/client";
import type pg from "pg";

export type QuoteRow = {
  id: string;
  customer_name: string | null;
  status: string;
  grand_total: string;
  margin_percent: string;
  created_at: string;
};

export type QuoteDetail = {
  id: string;
  status: QuoteStatus;
  valid_until: string | null;
  subtotal: string;
  shipping_total: string;
  discount_total: string;
  grand_total: string;
  margin_amount: string;
  margin_percent: string;
  notes: string | null;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_document: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_postal_code: string | null;
  customer_address_line: string | null;
  customer_address_number: string | null;
  customer_address_complement: string | null;
  customer_district: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_external_olist_id: string | null;
  external_crm_id: string | null;
  external_crm_task_id?: string | null;
  external_crm_task_created_at?: string | null;
  external_crm_task_response?: Record<string, unknown> | null;
  external_olist_order_id?: string | null;
  external_olist_invoice_id?: string | null;
  external_olist_invoice_number?: string | null;
  external_olist_invoice_series?: string | null;
  external_olist_invoice_model?: string | null;
  external_olist_fulfillment_status?: string | null;
  external_olist_fulfillment_sent_at?: string | null;
  external_olist_fulfillment_note?: string | null;
  external_olist_fulfillment_response?: Record<string, unknown> | null;
  created_by_name: string | null;
  public_token_expires_at?: string | null;
  public_viewed_at?: string | null;
  public_accepted_at?: string | null;
  public_rejected_at?: string | null;
  customer_decision_note?: string | null;
};

export type QuoteItemRow = {
  id: string;
  product_variant_id?: string | null;
  sku?: string | null;
  external_olist_product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  artwork_name?: string | null;
  pricing_rule?: CompositePricingRule | null;
  pricing_group_key?: string | null;
  reference_quantity?: number | null;
  base_unit_price?: string | null;
  manual_unit_price?: boolean | null;
  manual_price_reason?: string | null;
  manual_price_changed_at?: string | null;
  manual_price_changed_by_name?: string | null;
  artworks?: QuoteItemArtworkRow[];
};

export type QuoteEditLogRow = {
  id: string;
  reason: string | null;
  synced_olist_order_id: string | null;
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown>;
  created_at: string;
  edited_by_name: string | null;
};

export type QuoteItemArtworkRow = {
  id: string;
  quote_item_id: string;
  artwork_name: string | null;
  file_name: string;
  mime_type: string;
  file_size: number;
  data_url: string;
  storage_path: string | null;
};

export type QuoteSnapshotRow = {
  id: string;
  snapshot: Record<string, unknown>;
  created_at: string;
};

export type CreateQuoteInput = {
  productVariantId?: string;
  platformRuleId: string;
  quantity?: number;
  pricingCurve?: PricingCurve;
  pricingRule?: CompositePricingRule;
  items?: Array<{
    productVariantId: string;
    quantity: number;
    artworkName?: string | null;
    pricingCurve?: PricingCurve;
    artworkFile?: QuoteArtworkFileInput | null;
  }>;
  artworkName?: string | null;
  artworkFile?: QuoteArtworkFileInput | null;
  customerId?: string | null;
  customerName?: string | null;
  customerDocument?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerPostalCode?: string | null;
  customerAddressLine?: string | null;
  customerAddressNumber?: string | null;
  customerAddressComplement?: string | null;
  customerDistrict?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerExternalOlistId?: string | null;
  shippingTotal?: number;
  includeCommission?: boolean;
  includeFixedFee?: boolean;
  includeSellerShipping?: boolean;
  platformOverride?: Partial<{
    commissionRate: number;
    fixedFee: number;
    sellerShippingCost: number;
    sellerShippingThreshold: number;
  }>;
  validDays?: number;
  notes?: string | null;
};

export type UpdateQuoteInput = {
  validUntil?: string | null;
  shippingTotal: number;
  notes?: string | null;
  reason?: string | null;
  items: Array<{
    id?: string | null;
    productVariantId: string;
    description?: string | null;
    quantity: number;
    unitPrice: number;
    artworkName?: string | null;
  }>;
};

export type QuoteArtworkFileInput = {
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataUrl: string;
};

export type PublicQuoteTenant = {
  name: string;
  logo_url: string | null;
  company_document: string | null;
  company_phone: string | null;
  company_site: string | null;
};

export type PublicQuoteDetail = {
  quote: QuoteDetail;
  items: QuoteItemRow[];
  tenant: PublicQuoteTenant;
};

export async function listQuotes(userId: string, tenantId: string): Promise<QuoteRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<QuoteRow>(
      `
        select
          q.id,
          c.name as customer_name,
          q.status,
          q.grand_total,
          q.margin_percent,
          q.created_at
        from quotes q
        left join customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
        where q.tenant_id = $1
        order by q.created_at desc
        limit 100
      `,
      [tenantId]
    );

    return result.rows;
  });
}

export async function countQuotes(userId: string, tenantId: string): Promise<number> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ count: string }>(
      "select count(*)::text as count from quotes where tenant_id = $1",
      [tenantId]
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

export async function getQuoteDetail(userId: string, tenantId: string, quoteId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const quoteResult = await client.query<QuoteDetail>(
      `
        select
          q.id,
          q.status,
          q.valid_until,
          q.subtotal,
          q.shipping_total,
          q.discount_total,
          q.grand_total,
          q.margin_amount,
          q.margin_percent,
          q.notes,
          q.created_at,
          c.id as customer_id,
          c.name as customer_name,
          c.document as customer_document,
          c.email as customer_email,
          c.phone as customer_phone,
          c.postal_code as customer_postal_code,
          c.address_line as customer_address_line,
          c.address_number as customer_address_number,
          c.address_complement as customer_address_complement,
          c.district as customer_district,
          c.city as customer_city,
          c.state as customer_state,
          c.external_olist_id as customer_external_olist_id,
          q.external_crm_id,
          to_jsonb(q)->>'external_crm_task_id' as external_crm_task_id,
          to_jsonb(q)->>'external_crm_task_created_at' as external_crm_task_created_at,
          to_jsonb(q)->'external_crm_task_response' as external_crm_task_response,
          to_jsonb(q)->>'external_olist_order_id' as external_olist_order_id,
          to_jsonb(q)->>'external_olist_invoice_id' as external_olist_invoice_id,
          to_jsonb(q)->>'external_olist_invoice_number' as external_olist_invoice_number,
          to_jsonb(q)->>'external_olist_invoice_series' as external_olist_invoice_series,
          to_jsonb(q)->>'external_olist_invoice_model' as external_olist_invoice_model,
          to_jsonb(q)->>'external_olist_fulfillment_status' as external_olist_fulfillment_status,
          to_jsonb(q)->>'external_olist_fulfillment_sent_at' as external_olist_fulfillment_sent_at,
          to_jsonb(q)->>'external_olist_fulfillment_note' as external_olist_fulfillment_note,
          to_jsonb(q)->'external_olist_fulfillment_response' as external_olist_fulfillment_response,
          u.name as created_by_name,
          q.public_token_expires_at,
          q.public_viewed_at,
          q.public_accepted_at,
          q.public_rejected_at,
          q.customer_decision_note
        from quotes q
        left join customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
        left join app_users u on u.id = q.created_by
        where q.tenant_id = $1 and q.id = $2
        limit 1
      `,
      [tenantId, quoteId]
    );

    const quote = quoteResult.rows[0] ?? null;
    if (!quote) return null;

    const items = await client.query<QuoteItemRow>(
      `
        select
          qi.id,
          qi.product_variant_id,
          pv.sku,
          to_jsonb(pv)->>'external_olist_product_id' as external_olist_product_id,
          qi.description,
          qi.quantity,
          qi.unit_price,
          qi.total_price,
          qi.artwork_name,
          qi.pricing_rule,
          qi.pricing_group_key,
          qi.reference_quantity,
          qi.base_unit_price,
          coalesce((to_jsonb(qi)->>'manual_unit_price')::boolean, false) as manual_unit_price,
          to_jsonb(qi)->>'manual_price_reason' as manual_price_reason,
          to_jsonb(qi)->>'manual_price_changed_at' as manual_price_changed_at,
          manual_user.name as manual_price_changed_by_name
        from quote_items qi
        left join product_variants pv on pv.id = qi.product_variant_id and pv.tenant_id = qi.tenant_id
        left join app_users manual_user on manual_user.id::text = to_jsonb(qi)->>'manual_price_changed_by'
        where qi.tenant_id = $1 and qi.quote_id = $2
        order by qi.created_at asc
      `,
      [tenantId, quoteId]
    );

    const artworks = await client.query<QuoteItemArtworkRow>(
      `
        select
          id,
          quote_item_id,
          artwork_name,
          file_name,
          mime_type,
          file_size,
          data_url,
          storage_path
        from quote_item_artworks
        where tenant_id = $1 and quote_id = $2
        order by created_at asc
      `,
      [tenantId, quoteId]
    );
    const artworksByItem = groupArtworksByItem(artworks.rows);

    const snapshots = await client.query<QuoteSnapshotRow>(
      `
        select id, snapshot, created_at
        from quote_calculation_snapshots
        where tenant_id = $1 and quote_id = $2
        order by created_at desc
        limit 5
      `,
      [tenantId, quoteId]
    );

    return {
      quote,
      items: items.rows.map((item) => ({
        ...item,
        artworks: artworksByItem.get(item.id) ?? []
      })),
      snapshots: snapshots.rows
    };
  });
}

export async function createPublicQuoteLink(
  userId: string,
  tenantId: string,
  quoteId: string,
  validDays = 15
): Promise<{ token: string; expiresAt: string }> {
  return withTenantContext(userId, tenantId, async (client) => {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashPublicToken(token);
    const days = Math.max(1, Math.min(90, validDays));

    const result = await client.query<{ expires_at: string }>(
      `
        update quotes
        set public_token_hash = $3,
            public_token_expires_at = now() + ($4::int || ' days')::interval,
            status = case when status = 'draft' then 'sent' else status end,
            updated_at = now()
        where tenant_id = $1
          and id = $2
          and status not in ('cancelled', 'expired')
        returning public_token_expires_at::text as expires_at
      `,
      [tenantId, quoteId, tokenHash, days]
    );

    if (!result.rows[0]) throw new Error("Quote not found or unavailable for public sharing.");

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'quotes.public_link_create', 'quote', $3, $4)
      `,
      [tenantId, userId, quoteId, JSON.stringify({ validDays: days })]
    );

    return { token, expiresAt: result.rows[0].expires_at };
  });
}

export async function getPublicQuoteByToken(token: string): Promise<PublicQuoteDetail | null> {
  const tokenHash = hashPublicToken(token);
  const client = await getPool().connect();
  try {
    const quoteResult = await client.query<QuoteDetail & PublicQuoteTenant>(
      `
        select
          q.id,
          q.status,
          q.valid_until::text as valid_until,
          q.subtotal::text as subtotal,
          q.shipping_total::text as shipping_total,
          q.discount_total::text as discount_total,
          q.grand_total::text as grand_total,
          q.margin_amount::text as margin_amount,
          q.margin_percent::text as margin_percent,
          q.notes,
          q.created_at::text as created_at,
          c.id as customer_id,
          c.name as customer_name,
          c.document as customer_document,
          c.email::text as customer_email,
          c.phone as customer_phone,
          c.postal_code as customer_postal_code,
          c.address_line as customer_address_line,
          c.address_number as customer_address_number,
          c.address_complement as customer_address_complement,
          c.district as customer_district,
          c.city as customer_city,
          c.state as customer_state,
          c.external_olist_id as customer_external_olist_id,
          q.external_crm_id,
          u.name as created_by_name,
          q.public_token_expires_at::text as public_token_expires_at,
          q.public_viewed_at::text as public_viewed_at,
          q.public_accepted_at::text as public_accepted_at,
          q.public_rejected_at::text as public_rejected_at,
          q.customer_decision_note,
          t.name,
          t.logo_url,
          t.company_document,
          t.company_phone,
          t.company_site
        from quotes q
        join tenants t on t.id = q.tenant_id
        left join customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
        left join app_users u on u.id = q.created_by
        where q.public_token_hash = $1
          and q.public_token_expires_at > now()
          and q.status not in ('cancelled', 'expired')
        limit 1
      `,
      [tokenHash]
    );

    const quote = quoteResult.rows[0];
    if (!quote) return null;

    await client.query(
      "update quotes set public_viewed_at = coalesce(public_viewed_at, now()) where id = $1",
      [quote.id]
    );

    const itemsResult = await client.query<QuoteItemRow>(
      `
        select
          id,
          description,
          quantity,
          unit_price::text as unit_price,
          total_price::text as total_price,
          artwork_name,
          pricing_rule,
          pricing_group_key,
          reference_quantity,
          base_unit_price::text as base_unit_price
        from quote_items
        where quote_id = $1
        order by created_at asc
      `,
      [quote.id]
    );
    const artworks = await client.query<QuoteItemArtworkRow>(
      `
        select
          id,
          quote_item_id,
          artwork_name,
          file_name,
          mime_type,
          file_size,
          data_url,
          storage_path
        from quote_item_artworks
        where quote_id = $1
        order by created_at asc
      `,
      [quote.id]
    );
    const artworksByItem = groupArtworksByItem(artworks.rows);

    return {
      quote,
      items: itemsResult.rows.map((item) => ({
        ...item,
        artworks: artworksByItem.get(item.id) ?? []
      })),
      tenant: {
        name: quote.name,
        logo_url: quote.logo_url,
        company_document: quote.company_document,
        company_phone: quote.company_phone,
        company_site: quote.company_site
      }
    };
  } finally {
    client.release();
  }
}

export async function decidePublicQuote(
  token: string,
  decision: "accepted" | "rejected",
  note?: string | null
): Promise<{ id: string; status: QuoteStatus } | null> {
  const tokenHash = hashPublicToken(token);
  const client = await getPool().connect();
  try {
    const result = await client.query<{ id: string; tenant_id: string; status: QuoteStatus }>(
      `
        update quotes
        set status = $2,
            public_accepted_at = case when $2 = 'accepted' then now() else public_accepted_at end,
            public_rejected_at = case when $2 = 'rejected' then now() else public_rejected_at end,
            customer_decision_note = $3,
            updated_at = now()
        where public_token_hash = $1
          and public_token_expires_at > now()
          and status in ('draft', 'sent')
        returning id, tenant_id, status
      `,
      [tokenHash, decision, clean(note)]
    );

    const row = result.rows[0];
    if (!row) return null;

    await client.query(
      `
        insert into audit_logs (tenant_id, action, entity_type, entity_id, metadata)
        values ($1, 'quotes.public_decision', 'quote', $2, $3)
      `,
      [row.tenant_id, row.id, JSON.stringify({ decision, hasNote: Boolean(clean(note)) })]
    );

    return { id: row.id, status: row.status };
  } finally {
    client.release();
  }
}

export async function updateQuoteExternalCrmId(
  userId: string,
  tenantId: string,
  quoteId: string,
  externalCrmId: string
) {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query(
      `
        update quotes
        set external_crm_id = $3,
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [tenantId, quoteId, externalCrmId]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'quotes.crm_sync', 'quote', $3, $4)
      `,
      [tenantId, userId, quoteId, JSON.stringify({ externalCrmId })]
    );
  });
}

export async function updateQuoteExternalOlistIds(
  userId: string,
  tenantId: string,
  quoteId: string,
  input: {
    orderId?: string | null;
    invoiceId?: string | null;
    invoiceNumber?: string | null;
    invoiceSeries?: string | null;
    invoiceModel?: string | null;
  }
) {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query(
      `
        update quotes
        set external_olist_order_id = coalesce($3, external_olist_order_id),
            external_olist_invoice_id = coalesce($4, external_olist_invoice_id),
            external_olist_invoice_number = coalesce($5, external_olist_invoice_number),
            external_olist_invoice_series = coalesce($6, external_olist_invoice_series),
            external_olist_invoice_model = coalesce($7, external_olist_invoice_model),
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [
        tenantId,
        quoteId,
        input.orderId ?? null,
        input.invoiceId ?? null,
        input.invoiceNumber ?? null,
        input.invoiceSeries ?? null,
        input.invoiceModel ?? null
      ]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'quotes.olist_external_ids', 'quote', $3, $4)
      `,
      [tenantId, userId, quoteId, JSON.stringify(input)]
    );
  });
}

export async function markQuoteOlistCrmTask(
  userId: string,
  tenantId: string,
  quoteId: string,
  input: {
    taskId?: string | null;
    response?: unknown;
  }
) {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query(
      `
        update quotes
        set external_crm_task_id = coalesce($3, external_crm_task_id),
            external_crm_task_created_at = coalesce(external_crm_task_created_at, now()),
            external_crm_task_response = coalesce($4::jsonb, external_crm_task_response),
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [tenantId, quoteId, input.taskId ?? null, input.response === undefined ? null : JSON.stringify(input.response)]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'quotes.crm_task_sync', 'quote', $3, $4)
      `,
      [tenantId, userId, quoteId, JSON.stringify({ taskId: input.taskId ?? null })]
    );
  });
}

export async function markQuoteOlistFulfillment(
  userId: string,
  tenantId: string,
  quoteId: string,
  input: {
    note?: string | null;
    responsibleExternalId?: string | null;
    orderId?: string | null;
    shipment?: unknown;
  }
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const response = {
      mode: "pricing_pro_controlled",
      provider: "olist",
      orderId: input.orderId ?? null,
      responsibleExternalId: input.responsibleExternalId ?? null,
      shipment: input.shipment ?? null,
      markedAt: new Date().toISOString()
    };

    const result = await client.query<{
      external_olist_fulfillment_status: string;
      external_olist_fulfillment_sent_at: string;
    }>(
      `
        update quotes
        set external_olist_fulfillment_status = 'sent_to_fulfillment',
            external_olist_fulfillment_sent_at = now(),
            external_olist_fulfillment_note = $3,
            external_olist_fulfillment_response = $4::jsonb,
            updated_at = now()
        where tenant_id = $1 and id = $2
        returning external_olist_fulfillment_status, external_olist_fulfillment_sent_at
      `,
      [tenantId, quoteId, input.note ?? null, JSON.stringify(response)]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'quotes.olist_fulfillment', 'quote', $3, $4)
      `,
      [tenantId, userId, quoteId, JSON.stringify({ ...input, response })]
    );

    return result.rows[0] ?? null;
  });
}

export async function updateQuoteStatus(
  userId: string,
  tenantId: string,
  quoteId: string,
  nextStatus: QuoteStatus
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const currentResult = await client.query<{ status: QuoteStatus }>(
      "select status from quotes where tenant_id = $1 and id = $2 limit 1",
      [tenantId, quoteId]
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("Quote not found.");
    if (!canTransitionQuoteStatus(current.status, nextStatus)) {
      throw new Error(`Invalid status transition from ${current.status} to ${nextStatus}.`);
    }

    await client.query(
      `
        update quotes
        set status = $3,
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [tenantId, quoteId, nextStatus]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'quotes.status_update', 'quote', $3, $4)
      `,
      [tenantId, userId, quoteId, JSON.stringify({ from: current.status, to: nextStatus })]
    );

    return { id: quoteId, status: nextStatus };
  });
}

export async function deleteQuote(userId: string, tenantId: string, quoteId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ id: string; customer_id: string | null; grand_total: string }>(
      `
        delete from quotes
        where tenant_id = $1 and id = $2
        returning id, customer_id, grand_total
      `,
      [tenantId, quoteId]
    );

    const deleted = result.rows[0] ?? null;
    if (!deleted) return null;

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'quotes.delete', 'quote', $3, $4)
      `,
      [
        tenantId,
        userId,
        quoteId,
        JSON.stringify({
          customerId: deleted.customer_id,
          grandTotal: deleted.grand_total
        })
      ]
    );

    return deleted;
  });
}

export async function createQuote(userId: string, tenantId: string, input: CreateQuoteInput) {
  return withTenantContext(userId, tenantId, async (client) => {
    if (input.items?.length) {
      return createCompositeQuoteWithClient(client, userId, tenantId, input);
    }

    if (!input.productVariantId || !input.quantity) {
      throw new Error("Product variant and quantity are required.");
    }

    const variantResult = await client.query<{
      variant_id: string;
      variant_name: string;
      product_name: string;
      unit_cost: string;
      unit_weight_kg: string;
      curve_mode: PricingCurveMode | null;
      anchors: Record<string, string> | null;
    }>(
      `
        select
          v.id as variant_id,
          v.name as variant_name,
          p.name as product_name,
          v.unit_cost,
          v.unit_weight_kg,
          pc.mode as curve_mode,
          (
            select jsonb_object_agg(pa.quantity::text, pa.unit_price order by pa.quantity)
            from pricing_anchors pa
            where pa.pricing_curve_id = pc.id
              and pa.tenant_id = pc.tenant_id
          ) as anchors
        from product_variants v
        join products p on p.id = v.product_id and p.tenant_id = v.tenant_id
        left join lateral (
          select pc.*
          from pricing_curves pc
          where pc.product_variant_id = v.id
            and pc.tenant_id = v.tenant_id
            and pc.active = true
            and (pc.platform_rule_id = $3 or pc.platform_rule_id is null)
          order by case when pc.platform_rule_id = $3 then 0 else 1 end, pc.version desc, pc.created_at desc
          limit 1
        ) pc on true
        where v.tenant_id = $1 and v.id = $2 and v.active = true and p.active = true
        limit 1
      `,
      [tenantId, input.productVariantId, input.platformRuleId]
    );

    const variant = variantResult.rows[0];
    if (!variant) throw new Error("Product variant not found.");
    if (!variant.anchors) throw new Error("Active pricing curve not found.");

    const platformResult = await client.query<{
      id: string;
      key: string;
      name: string;
      commission_rate: string;
      fixed_fee: string;
      seller_shipping_cost: string;
      seller_shipping_threshold: string;
    }>(
      `
        select id, key, name, commission_rate, fixed_fee, seller_shipping_cost, seller_shipping_threshold
        from platform_rules
        where tenant_id = $1 and id = $2 and active = true
        limit 1
      `,
      [tenantId, input.platformRuleId]
    );

    const platform = platformResult.rows[0];
    if (!platform) throw new Error("Platform rule not found.");

    const customerId = await resolveQuoteCustomer(client, tenantId, input);

    const effectivePlatform = buildEffectivePlatform(input, platform);

    const calculation = calculateQuote({
      quantity: input.quantity,
      unitCost: Number(variant.unit_cost),
      method: "anchors",
      curve: resolveQuotePricingCurve(input.pricingCurve, variant.curve_mode, variant.anchors),
      platform: effectivePlatform
    });

    const validDays = Math.max(1, Math.min(90, input.validDays ?? 7));
    const shippingTotal = Math.max(0, input.shippingTotal ?? 0);
    const grandTotal = calculation.subtotal + shippingTotal;
    const quoteResult = await client.query<{ id: string }>(
      `
        insert into quotes (
          tenant_id,
          customer_id,
          created_by,
          status,
          valid_until,
          subtotal,
          shipping_total,
          discount_total,
          grand_total,
          margin_amount,
          margin_percent,
          notes
        )
        values (
          $1,
          $2,
          $3,
          'draft',
          current_date + $4::int,
          $5,
          $6,
          0,
          $7,
          $8,
          $9,
          $10
        )
        returning id
      `,
      [
        tenantId,
        customerId,
        userId,
        validDays,
        calculation.subtotal,
        shippingTotal,
        grandTotal,
        calculation.profit,
        calculation.marginPercent,
        input.notes || null
      ]
    );

    const quoteId = quoteResult.rows[0].id;

    const quoteItemResult = await client.query<{ id: string }>(
      `
        insert into quote_items (
          tenant_id,
          quote_id,
          product_variant_id,
          description,
          quantity,
          unit_price,
          total_price
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id
      `,
      [
        tenantId,
        quoteId,
        variant.variant_id,
        `${variant.product_name} - ${variant.variant_name}`,
        calculation.quantity,
        calculation.finalUnitPrice,
        calculation.subtotal
      ]
    );
    await insertQuoteItemArtwork(client, tenantId, userId, quoteId, quoteItemResult.rows[0].id, {
      artworkName: input.artworkName ?? null,
      artworkFile: input.artworkFile ?? null
    });

    await client.query(
      `
        insert into quote_calculation_snapshots (tenant_id, quote_id, snapshot)
        values ($1, $2, $3)
      `,
      [
        tenantId,
        quoteId,
        JSON.stringify({
          ...createQuoteCalculationSnapshot({
            request: input,
            product: variant,
            platform,
            calculation
          }),
          effectivePlatform
        })
      ]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id)
        values ($1, $2, 'quotes.create', 'quote', $3)
      `,
      [tenantId, userId, quoteId]
    );

    return { id: quoteId, calculation };
  });
}

export async function updateQuoteShippingTotal(
  userId: string,
  tenantId: string,
  quoteId: string,
  shippingTotal: number
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const amount = clampNumber(shippingTotal, 0, 100000, 0);
    const result = await client.query<{ id: string; shipping_total: string; grand_total: string }>(
      `
        update quotes
        set shipping_total = $3,
            grand_total = subtotal + $3 - discount_total,
            updated_at = now()
        where tenant_id = $1 and id = $2
        returning id, shipping_total::text, grand_total::text
      `,
      [tenantId, quoteId, amount]
    );

    const quote = result.rows[0];
    if (!quote) return null;

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'quotes.shipping_update', 'quote', $3, $4)
      `,
      [tenantId, userId, quoteId, JSON.stringify({ shippingTotal: amount })]
    );

    return quote;
  });
}

export async function listQuoteEditLogs(
  userId: string,
  tenantId: string,
  quoteId: string
): Promise<QuoteEditLogRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<QuoteEditLogRow>(
      `
        select
          qel.id,
          qel.reason,
          qel.synced_olist_order_id,
          qel.before_snapshot,
          qel.after_snapshot,
          qel.created_at,
          u.name as edited_by_name
        from quote_edit_logs qel
        left join app_users u on u.id = qel.edited_by
        where qel.tenant_id = $1 and qel.quote_id = $2
        order by qel.created_at desc
        limit 20
      `,
      [tenantId, quoteId]
    );

    return result.rows;
  });
}

export async function updateQuoteEditable(
  userId: string,
  tenantId: string,
  quoteId: string,
  input: UpdateQuoteInput & { syncedOlistOrderId?: string | null }
) {
  return withTenantContext(userId, tenantId, async (client) => {
      const quoteResult = await client.query<QuoteDetail>(
        `
          select
            q.id,
            q.status,
            q.valid_until::text as valid_until,
            q.subtotal::text as subtotal,
            q.shipping_total::text as shipping_total,
            q.discount_total::text as discount_total,
            q.grand_total::text as grand_total,
            q.margin_amount::text as margin_amount,
            q.margin_percent::text as margin_percent,
            q.notes,
            q.created_at,
            q.customer_id,
            null::text as customer_name,
            null::text as customer_document,
            null::text as customer_email,
            null::text as customer_phone,
            null::text as customer_postal_code,
            null::text as customer_address_line,
            null::text as customer_address_number,
            null::text as customer_address_complement,
            null::text as customer_district,
            null::text as customer_city,
            null::text as customer_state,
            null::text as customer_external_olist_id,
            q.external_crm_id,
            to_jsonb(q)->>'external_olist_order_id' as external_olist_order_id,
            to_jsonb(q)->>'external_olist_invoice_id' as external_olist_invoice_id,
            to_jsonb(q)->>'public_accepted_at' as public_accepted_at,
            null::text as created_by_name
          from quotes q
          where q.tenant_id = $1 and q.id = $2
          for update
        `,
        [tenantId, quoteId]
      );
      const quote = quoteResult.rows[0];
      if (!quote) throw new Error("Quote not found.");
      if (quote.external_olist_invoice_id) throw new Error("Orçamento com nota fiscal Olist não pode ser editado.");
      if (quote.public_accepted_at || quote.status === "accepted") throw new Error("Orçamento aceito pelo cliente não pode ser editado.");

      const currentItemsResult = await client.query<QuoteItemRow>(
        `
          select
            id,
            product_variant_id,
            description,
            quantity,
            unit_price,
            total_price,
            artwork_name,
            coalesce((to_jsonb(quote_items)->>'manual_unit_price')::boolean, false) as manual_unit_price,
            to_jsonb(quote_items)->>'manual_price_reason' as manual_price_reason
          from quote_items
          where tenant_id = $1 and quote_id = $2
          order by created_at asc
          for update
        `,
        [tenantId, quoteId]
      );
      const currentItems = currentItemsResult.rows;
      if (input.items.length !== currentItems.length) {
        throw new Error("Esta edição suporta alterar os itens existentes. Inclusão/remoção será tratada em uma etapa dedicada.");
      }

      const currentItemMap = new Map(currentItems.map((item) => [item.id, item]));
      const itemIds = input.items.map((item) => item.id).filter((id): id is string => Boolean(id));
      if (itemIds.length !== currentItems.length || itemIds.some((id) => !currentItemMap.has(id))) {
        throw new Error("Todos os itens atuais do orçamento devem ser enviados para edição.");
      }

      const variants = await findQuoteEditVariants(client, tenantId, input.items.map((item) => item.productVariantId));
      const variantMap = new Map(variants.map((variant) => [variant.variant_id, variant]));
      const beforeSnapshot = { quote, items: currentItems };
      const reason = clean(input.reason);
      const changedUnitPrice = input.items.some((item) => {
        const current = item.id ? currentItemMap.get(item.id) : null;
        return !current || Math.abs(Number(current.unit_price) - item.unitPrice) >= 0.0001;
      });
      if (changedUnitPrice && !reason) throw new Error("Informe o motivo da alteração manual de preço.");

      let subtotal = 0;
      let totalCost = 0;
      const updatedItems = [];
      for (const item of input.items) {
        const current = currentItemMap.get(item.id as string);
        const variant = variantMap.get(item.productVariantId);
        if (!current) throw new Error("Item do orçamento não encontrado.");
        if (!variant) throw new Error("Produto selecionado não encontrado.");

        const quantity = Math.max(1, Math.trunc(item.quantity));
        const unitPrice = clampNumber(item.unitPrice, 0, 100000, Number(current.unit_price));
        const totalPrice = Number((quantity * unitPrice).toFixed(4));
        const itemChangedPrice = Math.abs(Number(current.unit_price) - unitPrice) >= 0.0001;
        const manualUnitPrice = Boolean(current.manual_unit_price) || itemChangedPrice;
        const manualReason = itemChangedPrice ? reason : current.manual_price_reason ?? null;
        const description = clean(item.description) ?? `${variant.product_name} - ${variant.variant_name}`;

        await client.query(
          `
            update quote_items
            set product_variant_id = $4,
                description = $5,
                quantity = $6,
                unit_price = $7,
                total_price = $8,
                artwork_name = $9,
                manual_unit_price = $10,
                manual_price_reason = $11,
                manual_price_changed_by = case when $12::boolean then $13 else manual_price_changed_by end,
                manual_price_changed_at = case when $12::boolean then now() else manual_price_changed_at end
            where tenant_id = $1 and quote_id = $2 and id = $3
          `,
          [
            tenantId,
            quoteId,
            current.id,
            variant.variant_id,
            description,
            quantity,
            unitPrice,
            totalPrice,
            clean(item.artworkName),
            manualUnitPrice,
            manualReason,
            itemChangedPrice,
            userId
          ]
        );

        subtotal += totalPrice;
        totalCost += quantity * Number(variant.unit_cost);
        updatedItems.push({
          id: current.id,
          productVariantId: variant.variant_id,
          description,
          quantity,
          unitPrice,
          totalPrice,
          artworkName: clean(item.artworkName),
          manualUnitPrice,
          manualPriceReason: manualReason
        });
      }

      const shippingTotal = clampNumber(input.shippingTotal, 0, 100000, Number(quote.shipping_total));
      const discountTotal = Number(quote.discount_total);
      const grandTotal = subtotal + shippingTotal - discountTotal;
      const marginAmount = subtotal - totalCost;
      const marginPercent = subtotal > 0 ? (marginAmount / subtotal) * 100 : 0;
      const validUntil = clean(input.validUntil);

      const updatedQuoteResult = await client.query<{ id: string }>(
        `
          update quotes
          set valid_until = coalesce($3::date, valid_until),
              subtotal = $4,
              shipping_total = $5,
              grand_total = $6,
              margin_amount = $7,
              margin_percent = $8,
              notes = $9,
              updated_at = now()
          where tenant_id = $1 and id = $2
          returning id
        `,
        [
          tenantId,
          quoteId,
          validUntil,
          subtotal,
          shippingTotal,
          grandTotal,
          marginAmount,
          marginPercent,
          input.notes ?? null
        ]
      );
      if (!updatedQuoteResult.rows[0]) throw new Error("Quote not found.");

      const afterSnapshot = {
        quote: {
          id: quoteId,
          validUntil,
          subtotal,
          shippingTotal,
          discountTotal,
          grandTotal,
          marginAmount,
          marginPercent,
          notes: input.notes ?? null
        },
        items: updatedItems
      };

      await client.query(
        `
          insert into quote_edit_logs (
            tenant_id,
            quote_id,
            edited_by,
            reason,
            synced_olist_order_id,
            before_snapshot,
            after_snapshot
          )
          values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          tenantId,
          quoteId,
          userId,
          reason,
          input.syncedOlistOrderId ?? null,
          JSON.stringify(beforeSnapshot),
          JSON.stringify(afterSnapshot)
        ]
      );

      await client.query(
        `
          insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
          values ($1, $2, 'quotes.edit', 'quote', $3, $4)
        `,
        [tenantId, userId, quoteId, JSON.stringify({ reason, changedUnitPrice, syncedOlistOrderId: input.syncedOlistOrderId ?? null })]
      );

      return { id: quoteId, subtotal, shippingTotal, grandTotal };
  });
}

async function createCompositeQuoteWithClient(
  client: pg.PoolClient,
  userId: string,
  tenantId: string,
  input: CreateQuoteInput
) {
  const quoteItems = input.items ?? [];
  const variantIds = Array.from(new Set(quoteItems.map((item) => item.productVariantId)));
  if (variantIds.length === 0) throw new Error("At least one quote item is required.");

  const platform = await findPlatformRule(client, tenantId, input.platformRuleId);
  const variants = await findVariantsForQuote(client, tenantId, input.platformRuleId, variantIds);
  const variantMap = new Map(variants.map((variant) => [variant.variant_id, variant]));

  const calculationItems: CompositeQuoteInputItem[] = quoteItems.map((item, index) => {
    const variant = variantMap.get(item.productVariantId);
    if (!variant) throw new Error("Product variant not found.");
    if (!variant.anchors) throw new Error("Active pricing curve not found.");

    return {
      id: String(index + 1),
      productVariantId: variant.variant_id,
      description: `${variant.product_name} - ${variant.variant_name}`,
      artworkName: clean(item.artworkName) ?? `Arte ${index + 1}`,
      quantity: item.quantity,
      unitCost: Number(variant.unit_cost),
      curve: resolveQuotePricingCurve(item.pricingCurve, variant.curve_mode, variant.anchors)
    };
  });

  const effectivePlatform = buildEffectivePlatform(input, platform);

  const calculation = calculateCompositeQuote({
    items: calculationItems,
    platform: effectivePlatform,
    pricingRule: input.pricingRule ?? "per_art_average"
  });

  const customerId = await resolveQuoteCustomer(client, tenantId, input);
  const validDays = Math.max(1, Math.min(90, input.validDays ?? 7));
  const shippingTotal = Math.max(0, input.shippingTotal ?? 0);
  const grandTotal = calculation.subtotal + shippingTotal;
  const quoteResult = await client.query<{ id: string }>(
    `
      insert into quotes (
        tenant_id,
        customer_id,
        created_by,
        status,
        valid_until,
        subtotal,
        shipping_total,
        discount_total,
        grand_total,
        margin_amount,
        margin_percent,
        notes
      )
      values (
        $1,
        $2,
        $3,
        'draft',
        current_date + $4::int,
        $5,
        $6,
        0,
        $7,
        $8,
        $9,
        $10
      )
      returning id
    `,
    [
      tenantId,
      customerId,
      userId,
      validDays,
      calculation.subtotal,
      shippingTotal,
      grandTotal,
      calculation.profit,
      calculation.marginPercent,
      input.notes || null
    ]
  );
  const quoteId = quoteResult.rows[0].id;

  for (const item of calculation.items) {
    const sourceItem = quoteItems[Number(item.id) - 1];
    const quoteItemResult = await client.query<{ id: string }>(
      `
        insert into quote_items (
          tenant_id,
          quote_id,
          product_variant_id,
          description,
          quantity,
          unit_price,
          total_price,
          artwork_name,
          pricing_rule,
          pricing_group_key,
          reference_quantity,
          base_unit_price
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        returning id
      `,
      [
        tenantId,
        quoteId,
        item.productVariantId,
        item.description,
        item.quantity,
        item.finalUnitPrice,
        item.subtotal,
        item.artworkName,
        item.pricingRule,
        item.pricingGroupKey,
        item.referenceQuantity,
        item.baseUnitPrice
      ]
    );
    await insertQuoteItemArtwork(client, tenantId, userId, quoteId, quoteItemResult.rows[0].id, {
      artworkName: item.artworkName,
      artworkFile: sourceItem?.artworkFile ?? null
    });
  }

  await client.query(
    `
      insert into quote_calculation_snapshots (tenant_id, quote_id, snapshot)
      values ($1, $2, $3)
    `,
    [
      tenantId,
      quoteId,
      JSON.stringify({
        kind: "composite_quote",
        request: input,
        platform,
        effectivePlatform,
        calculation
      })
    ]
  );

  await client.query(
    `
      insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
      values ($1, $2, 'quotes.create_composite', 'quote', $3, $4)
    `,
    [tenantId, userId, quoteId, JSON.stringify({ itemCount: calculation.items.length, pricingRule: input.pricingRule })]
  );

  return { id: quoteId, calculation };
}

async function insertQuoteItemArtwork(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  quoteId: string,
  quoteItemId: string,
  input: { artworkName?: string | null; artworkFile?: QuoteArtworkFileInput | null }
) {
  const artworkFile = normalizeArtworkFile(input.artworkFile);
  if (!artworkFile) return;

  await client.query(
    `
      insert into quote_item_artworks (
        tenant_id,
        quote_id,
        quote_item_id,
        artwork_name,
        file_name,
        mime_type,
        file_size,
        data_url,
        storage_path,
        created_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      tenantId,
      quoteId,
      quoteItemId,
      clean(input.artworkName),
      artworkFile.fileName,
      artworkFile.mimeType,
      artworkFile.fileSize,
      artworkFile.dataUrl,
      `quotes/${quoteId}/items/${quoteItemId}/${artworkFile.fileName}`,
      userId
    ]
  );
}

function normalizeArtworkFile(file: QuoteArtworkFileInput | null | undefined): QuoteArtworkFileInput | null {
  if (!file) return null;
  const fileName = clean(file.fileName)?.slice(0, 180);
  const mimeType = clean(file.mimeType)?.toLowerCase();
  const fileSize = Number(file.fileSize);
  const dataUrl = clean(file.dataUrl);
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"]);

  if (!fileName || !mimeType || !dataUrl) return null;
  if (!allowedTypes.has(mimeType)) return null;
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 5 * 1024 * 1024) return null;
  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) return null;

  return {
    fileName: fileName.replace(/[^\w.\- ()[\]{}@]+/g, "_"),
    mimeType,
    fileSize,
    dataUrl
  };
}

function groupArtworksByItem(rows: QuoteItemArtworkRow[]) {
  const grouped = new Map<string, QuoteItemArtworkRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.quote_item_id) ?? [];
    current.push(row);
    grouped.set(row.quote_item_id, current);
  }
  return grouped;
}

async function resolveQuoteCustomer(client: pg.PoolClient, tenantId: string, input: CreateQuoteInput) {
  let customerId = input.customerId || null;
  const externalOlistId = clean(input.customerExternalOlistId);
  if (!customerId && input.customerName) {
    const customerResult = await client.query<{ id: string }>(
      `
        insert into customers (
          tenant_id,
          name,
          document,
          email,
          phone,
          postal_code,
          address_line,
          address_number,
          address_complement,
          district,
          city,
          state,
          external_olist_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        returning id
      `,
      [
        tenantId,
        input.customerName,
        clean(input.customerDocument),
        clean(input.customerEmail),
        clean(input.customerPhone),
        clean(input.customerPostalCode),
        clean(input.customerAddressLine),
        clean(input.customerAddressNumber),
        clean(input.customerAddressComplement),
        clean(input.customerDistrict),
        clean(input.customerCity),
        clean(input.customerState)?.toUpperCase() ?? null,
        externalOlistId
      ]
    );
    customerId = customerResult.rows[0].id;
  }

  if (customerId && externalOlistId) {
    await client.query(
      `
        update customers
        set external_olist_id = $3,
            updated_at = now()
        where tenant_id = $1
          and id = $2
          and (external_olist_id is null or external_olist_id <> $3)
      `,
      [tenantId, customerId, externalOlistId]
    );
  }

  return customerId;
}

async function findPlatformRule(client: pg.PoolClient, tenantId: string, platformRuleId: string) {
  const platformResult = await client.query<{
    id: string;
    key: string;
    name: string;
    commission_rate: string;
    fixed_fee: string;
    seller_shipping_cost: string;
    seller_shipping_threshold: string;
  }>(
    `
      select id, key, name, commission_rate, fixed_fee, seller_shipping_cost, seller_shipping_threshold
      from platform_rules
      where tenant_id = $1 and id = $2 and active = true
      limit 1
    `,
    [tenantId, platformRuleId]
  );

  const platform = platformResult.rows[0];
  if (!platform) throw new Error("Platform rule not found.");
  return platform;
}

function buildEffectivePlatform(
  input: CreateQuoteInput,
  platform: {
    commission_rate: string;
    fixed_fee: string;
    seller_shipping_cost: string;
    seller_shipping_threshold: string;
  }
) {
  const override = input.platformOverride ?? {};

  return {
    commissionRate:
      input.includeCommission === false
        ? 0
        : clampNumber(override.commissionRate, 0, 0.99, Number(platform.commission_rate)),
    fixedFee:
      input.includeFixedFee === false
        ? 0
        : clampNumber(override.fixedFee, 0, 100000, Number(platform.fixed_fee)),
    sellerShippingCost:
      input.includeSellerShipping === false
        ? 0
        : clampNumber(override.sellerShippingCost, 0, 100000, Number(platform.seller_shipping_cost)),
    sellerShippingThreshold: clampNumber(
      override.sellerShippingThreshold,
      0,
      100000,
      Number(platform.seller_shipping_threshold)
    )
  };
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Number(value)));
}

async function findVariantsForQuote(
  client: pg.PoolClient,
  tenantId: string,
  platformRuleId: string,
  variantIds: string[]
) {
  const result = await client.query<{
    variant_id: string;
    variant_name: string;
    product_name: string;
    unit_cost: string;
    unit_weight_kg: string;
    curve_mode: PricingCurveMode | null;
    anchors: Record<string, string> | null;
  }>(
    `
      select
        v.id as variant_id,
        v.name as variant_name,
        p.name as product_name,
        v.unit_cost,
        v.unit_weight_kg,
        pc.mode as curve_mode,
        (
          select jsonb_object_agg(pa.quantity::text, pa.unit_price order by pa.quantity)
          from pricing_anchors pa
          where pa.pricing_curve_id = pc.id
            and pa.tenant_id = pc.tenant_id
        ) as anchors
      from product_variants v
      join products p on p.id = v.product_id and p.tenant_id = v.tenant_id
      left join lateral (
        select pc.*
        from pricing_curves pc
        where pc.product_variant_id = v.id
          and pc.tenant_id = v.tenant_id
          and pc.active = true
          and (pc.platform_rule_id = $3 or pc.platform_rule_id is null)
        order by case when pc.platform_rule_id = $3 then 0 else 1 end, pc.version desc, pc.created_at desc
        limit 1
      ) pc on true
      where v.tenant_id = $1
        and v.id = any($2::uuid[])
        and v.active = true
        and p.active = true
    `,
    [tenantId, variantIds, platformRuleId]
  );

  return result.rows;
}

async function findQuoteEditVariants(client: pg.PoolClient, tenantId: string, variantIds: string[]) {
  const uniqueVariantIds = Array.from(new Set(variantIds));
  const result = await client.query<{
    variant_id: string;
    variant_name: string;
    product_name: string;
    sku: string | null;
    external_olist_product_id: string | null;
    unit_cost: string;
  }>(
    `
      select
        v.id as variant_id,
        v.name as variant_name,
        p.name as product_name,
        v.sku,
        to_jsonb(v)->>'external_olist_product_id' as external_olist_product_id,
        v.unit_cost
      from product_variants v
      join products p on p.id = v.product_id and p.tenant_id = v.tenant_id
      where v.tenant_id = $1
        and v.id = any($2::uuid[])
        and v.active = true
        and p.active = true
    `,
    [tenantId, uniqueVariantIds]
  );

  return result.rows;
}

function mapCurve(mode: PricingCurveMode | null, anchors: Record<string, string>): PricingCurve {
  return {
    mode: mode ?? "interpolated",
    points: Object.entries(anchors)
      .map(([quantity, unitPrice]) => ({
        quantity: Number(quantity),
        unitPrice: Number(unitPrice)
      }))
      .sort((a, b) => a.quantity - b.quantity)
  };
}

function resolveQuotePricingCurve(
  inputCurve: PricingCurve | undefined,
  fallbackMode: PricingCurveMode | null,
  fallbackAnchors: Record<string, string>
): PricingCurve {
  if (!inputCurve) return mapCurve(fallbackMode, fallbackAnchors);

  const points = normalizePricingCurvePoints(inputCurve.points)
    .filter((point) => Number.isFinite(point.quantity) && Number.isFinite(point.unitPrice))
    .slice(0, 50);

  if (points.length === 0) return mapCurve(fallbackMode, fallbackAnchors);

  return {
    mode: inputCurve.mode === "step" ? "step" : "interpolated",
    points
  };
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function hashPublicToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
