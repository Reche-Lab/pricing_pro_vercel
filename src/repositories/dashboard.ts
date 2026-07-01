import { withTenantContext } from "@/lib/db/client";

export type DashboardMetrics = {
  quotes_month: number;
  quoted_total_month: string;
  avg_ticket_month: string;
  accepted_month: number;
  rejected_month: number;
  pending_month: number;
  avg_margin_recent: string;
  low_margin_count: number;
};

export type DashboardRecentQuote = {
  id: string;
  customer_name: string | null;
  status: string;
  grand_total: string;
  margin_percent: string;
  created_at: string;
};

export type DashboardTopProduct = {
  variant_id: string;
  product_label: string;
  quote_count: number;
  total_quantity: number;
  total_value: string;
  avg_margin: string;
};

export type DashboardSetup = {
  variants_count: number;
  variants_without_curve: number;
  platforms_count: number;
  platforms_without_fee: number;
  packaging_count: number;
  customers_count: number;
  active_members: number;
  invited_members: number;
  shipments_pending: number;
};

export type DashboardTenantProfile = {
  name: string;
  logo_url: string | null;
  company_phone: string | null;
  company_site: string | null;
  company_document: string | null;
  postal_code: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
};

export type DashboardIntegration = {
  provider: string;
  status: "active" | "disabled" | "error";
};

export type DashboardOverview = {
  metrics: DashboardMetrics;
  recentQuotes: DashboardRecentQuote[];
  topProducts: DashboardTopProduct[];
  setup: DashboardSetup;
  tenantProfile: DashboardTenantProfile | null;
  integrations: DashboardIntegration[];
};

const emptyMetrics: DashboardMetrics = {
  quotes_month: 0,
  quoted_total_month: "0",
  avg_ticket_month: "0",
  accepted_month: 0,
  rejected_month: 0,
  pending_month: 0,
  avg_margin_recent: "0",
  low_margin_count: 0
};

export async function getDashboardOverview(userId: string, tenantId: string): Promise<DashboardOverview> {
  return withTenantContext(userId, tenantId, async (client) => {
    const metricsResult = await client.query<DashboardMetrics>(
      `
        select
          count(*) filter (where created_at >= date_trunc('month', now()))::int as quotes_month,
          coalesce(sum(grand_total) filter (where created_at >= date_trunc('month', now())), 0)::text as quoted_total_month,
          coalesce(avg(grand_total) filter (where created_at >= date_trunc('month', now())), 0)::text as avg_ticket_month,
          count(*) filter (where status = 'accepted' and created_at >= date_trunc('month', now()))::int as accepted_month,
          count(*) filter (where status = 'rejected' and created_at >= date_trunc('month', now()))::int as rejected_month,
          count(*) filter (where status in ('draft', 'sent') and created_at >= date_trunc('month', now()))::int as pending_month,
          coalesce(avg(margin_percent) filter (where created_at >= now() - interval '30 days'), 0)::text as avg_margin_recent,
          count(*) filter (where margin_percent < 20 and created_at >= now() - interval '30 days')::int as low_margin_count
        from quotes
        where tenant_id = $1
      `,
      [tenantId]
    );

    const recentQuotesResult = await client.query<DashboardRecentQuote>(
      `
        select
          q.id,
          c.name as customer_name,
          q.status,
          q.grand_total::text as grand_total,
          q.margin_percent::text as margin_percent,
          q.created_at::text as created_at
        from quotes q
        left join customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
        where q.tenant_id = $1
        order by q.created_at desc
        limit 6
      `,
      [tenantId]
    );

    const topProductsResult = await client.query<DashboardTopProduct>(
      `
        select
          pv.id as variant_id,
          concat(p.name, ' - ', pv.name) as product_label,
          count(distinct qi.quote_id)::int as quote_count,
          coalesce(sum(qi.quantity), 0)::int as total_quantity,
          coalesce(sum(qi.total_price), 0)::text as total_value,
          coalesce(avg(q.margin_percent), 0)::text as avg_margin
        from quote_items qi
        join quotes q on q.id = qi.quote_id and q.tenant_id = qi.tenant_id
        join product_variants pv on pv.id = qi.product_variant_id and pv.tenant_id = qi.tenant_id
        join products p on p.id = pv.product_id and p.tenant_id = pv.tenant_id
        where qi.tenant_id = $1
          and qi.created_at >= now() - interval '90 days'
        group by pv.id, p.name, pv.name
        order by coalesce(sum(qi.total_price), 0) desc, count(distinct qi.quote_id) desc
        limit 5
      `,
      [tenantId]
    );

    const setupResult = await client.query<DashboardSetup>(
      `
        select
          (select count(*) from product_variants where tenant_id = $1 and active = true)::int as variants_count,
          (
            select count(*)
            from product_variants pv
            where pv.tenant_id = $1
              and pv.active = true
              and not exists (
                select 1
                from pricing_curves pc
                join pricing_anchors pa on pa.pricing_curve_id = pc.id and pa.tenant_id = pc.tenant_id
                where pc.tenant_id = $1
                  and pc.product_variant_id = pv.id
                  and pc.active = true
                limit 1
              )
          )::int as variants_without_curve,
          (select count(*) from platform_rules where tenant_id = $1 and active = true)::int as platforms_count,
          (
            select count(*)
            from platform_rules
            where tenant_id = $1
              and active = true
              and commission_rate = 0
              and fixed_fee = 0
              and seller_shipping_cost = 0
          )::int as platforms_without_fee,
          (select count(*) from packaging_boxes where tenant_id = $1 and active = true)::int as packaging_count,
          (select count(*) from customers where tenant_id = $1)::int as customers_count,
          (select count(*) from tenant_members where tenant_id = $1 and status = 'active')::int as active_members,
          (select count(*) from tenant_members where tenant_id = $1 and status = 'invited')::int as invited_members,
          (
            select count(*)
            from shipments
            where tenant_id = $1
              and status not in ('delivered', 'cancelled')
          )::int as shipments_pending
      `,
      [tenantId]
    );

    const tenantResult = await client.query<DashboardTenantProfile>(
      `
        select
          name,
          logo_url,
          company_phone,
          company_site,
          company_document,
          postal_code,
          address_line,
          city,
          state
        from tenants
        where id = $1
        limit 1
      `,
      [tenantId]
    );

    const integrationsResult = await client.query<DashboardIntegration>(
      `
        select provider, status
        from integration_connections
        where tenant_id = $1
          and provider in ('melhor_envio', 'olist', 'olist_crm')
        order by provider
      `,
      [tenantId]
    );

    return {
      metrics: metricsResult.rows[0] ?? emptyMetrics,
      recentQuotes: recentQuotesResult.rows,
      topProducts: topProductsResult.rows,
      setup: setupResult.rows[0] ?? {
        variants_count: 0,
        variants_without_curve: 0,
        platforms_count: 0,
        platforms_without_fee: 0,
        packaging_count: 0,
        customers_count: 0,
        active_members: 0,
        invited_members: 0,
        shipments_pending: 0
      },
      tenantProfile: tenantResult.rows[0] ?? null,
      integrations: integrationsResult.rows
    };
  });
}
