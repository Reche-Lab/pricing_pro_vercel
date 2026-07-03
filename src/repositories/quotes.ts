import { createHash, randomBytes } from "crypto";
import { calculateQuote } from "@/domain/pricing/pricing";
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
  external_olist_order_id?: string | null;
  external_olist_invoice_id?: string | null;
  external_olist_invoice_number?: string | null;
  external_olist_invoice_series?: string | null;
  external_olist_invoice_model?: string | null;
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
  pricingRule?: CompositePricingRule;
  items?: Array<{
    productVariantId: string;
    quantity: number;
    artworkName?: string | null;
  }>;
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

export type PublicQuoteTenant = {
  name: string;
  logo_url: string | null;
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
          to_jsonb(q)->>'external_olist_order_id' as external_olist_order_id,
          to_jsonb(q)->>'external_olist_invoice_id' as external_olist_invoice_id,
          to_jsonb(q)->>'external_olist_invoice_number' as external_olist_invoice_number,
          to_jsonb(q)->>'external_olist_invoice_series' as external_olist_invoice_series,
          to_jsonb(q)->>'external_olist_invoice_model' as external_olist_invoice_model,
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
          qi.base_unit_price
        from quote_items qi
        left join product_variants pv on pv.id = qi.product_variant_id and pv.tenant_id = qi.tenant_id
        where qi.tenant_id = $1 and qi.quote_id = $2
        order by qi.created_at asc
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

    return {
      quote,
      items: itemsResult.rows,
      tenant: {
        name: quote.name,
        logo_url: quote.logo_url,
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

    let customerId = input.customerId || null;
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
            state
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
          clean(input.customerState)?.toUpperCase() ?? null
        ]
      );
      customerId = customerResult.rows[0].id;
    }

    const effectivePlatform = buildEffectivePlatform(input, platform);

    const calculation = calculateQuote({
      quantity: input.quantity,
      unitCost: Number(variant.unit_cost),
      method: "anchors",
      curve: mapCurve(variant.curve_mode, variant.anchors),
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
      curve: mapCurve(variant.curve_mode, variant.anchors)
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
    await client.query(
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

async function resolveQuoteCustomer(client: pg.PoolClient, tenantId: string, input: CreateQuoteInput) {
  let customerId = input.customerId || null;
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
          state
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        clean(input.customerState)?.toUpperCase() ?? null
      ]
    );
    customerId = customerResult.rows[0].id;
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

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function hashPublicToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
