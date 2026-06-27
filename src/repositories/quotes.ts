import { calculateQuote } from "@/domain/pricing/pricing";
import { canTransitionQuoteStatus, createQuoteCalculationSnapshot } from "@/domain/quotes/quotes";
import type { QuoteStatus } from "@/domain/quotes/types";
import type { PricingAnchors } from "@/domain/pricing/types";
import { withTenantContext } from "@/lib/db/client";

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
  created_by_name: string | null;
};

export type QuoteItemRow = {
  id: string;
  description: string;
  quantity: number;
  unit_price: string;
  total_price: string;
};

export type QuoteSnapshotRow = {
  id: string;
  snapshot: Record<string, unknown>;
  created_at: string;
};

export type CreateQuoteInput = {
  productVariantId: string;
  platformRuleId: string;
  quantity: number;
  customerId?: string | null;
  customerName?: string | null;
  customerDocument?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  shippingTotal?: number;
  includeCommission?: boolean;
  includeFixedFee?: boolean;
  includeSellerShipping?: boolean;
  validDays?: number;
  notes?: string | null;
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
          u.name as created_by_name
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
        select id, description, quantity, unit_price, total_price
        from quote_items
        where tenant_id = $1 and quote_id = $2
        order by created_at asc
      `,
      [tenantId, quoteId]
    );

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
      items: items.rows,
      snapshots: snapshots.rows
    };
  });
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

export async function createQuote(userId: string, tenantId: string, input: CreateQuoteInput) {
  return withTenantContext(userId, tenantId, async (client) => {
    const variantResult = await client.query<{
      variant_id: string;
      variant_name: string;
      product_name: string;
      unit_cost: string;
      unit_weight_kg: string;
      anchors: Record<string, string> | null;
    }>(
      `
        select
          v.id as variant_id,
          v.name as variant_name,
          p.name as product_name,
          v.unit_cost,
          v.unit_weight_kg,
          (
            select jsonb_object_agg(pa.quantity::text, pa.unit_price order by pa.quantity)
            from pricing_curves pc
            join pricing_anchors pa on pa.pricing_curve_id = pc.id and pa.tenant_id = pc.tenant_id
            where pc.product_variant_id = v.id
              and pc.tenant_id = v.tenant_id
              and pc.active = true
          ) as anchors
        from product_variants v
        join products p on p.id = v.product_id and p.tenant_id = v.tenant_id
        where v.tenant_id = $1 and v.id = $2 and v.active = true and p.active = true
        limit 1
      `,
      [tenantId, input.productVariantId]
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

    let customerId = input.customerId || null;
    if (!customerId && input.customerName) {
      const customerResult = await client.query<{ id: string }>(
        `
          insert into customers (tenant_id, name, document, email, phone)
          values ($1, $2, $3, $4, $5)
          returning id
        `,
        [
          tenantId,
          input.customerName,
          clean(input.customerDocument),
          clean(input.customerEmail),
          clean(input.customerPhone)
        ]
      );
      customerId = customerResult.rows[0].id;
    }

    const calculation = calculateQuote({
      quantity: input.quantity,
      unitCost: Number(variant.unit_cost),
      method: "anchors",
      anchors: mapAnchors(variant.anchors),
      platform: {
        commissionRate: input.includeCommission === false ? 0 : Number(platform.commission_rate),
        fixedFee: input.includeFixedFee === false ? 0 : Number(platform.fixed_fee),
        sellerShippingCost: input.includeSellerShipping === false ? 0 : Number(platform.seller_shipping_cost),
        sellerShippingThreshold: Number(platform.seller_shipping_threshold)
      }
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

    await client.query(
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
          })
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

function mapAnchors(anchors: Record<string, string>): PricingAnchors {
  return {
    1: Number(anchors["1"] ?? 0),
    10: Number(anchors["10"] ?? 0),
    50: Number(anchors["50"] ?? 0),
    100: Number(anchors["100"] ?? 0),
    500: Number(anchors["500"] ?? 0),
    1000: Number(anchors["1000"] ?? 0)
  };
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
