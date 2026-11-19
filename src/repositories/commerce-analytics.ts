import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "./commerce";
import { analyticsSettingsSchema, publicAnalyticsSettings, type AnalyticsReportQuery, type AnalyticsSettings } from "@/domain/commerce/analytics";
import { CommerceError } from "@/domain/commerce/commerce";

export async function loadCommerceAnalyticsSettings(tenantId: string) {
  const row = (await getPool().query("select analytics_settings from commerce_stores where tenant_id=$1", [tenantId])).rows[0];
  return publicAnalyticsSettings(row?.analytics_settings);
}
export async function saveCommerceAnalyticsSettings(tenantId: string, userId: string, raw: AnalyticsSettings) {
  const settings = analyticsSettingsSchema.parse(raw);
  await commerceTransaction(async client => {
    const updated = await client.query("update commerce_stores set analytics_settings=$2::jsonb,updated_at=now() where tenant_id=$1 returning tenant_id", [tenantId, JSON.stringify(settings)]);
    if (!updated.rowCount) throw new CommerceError("Salve o rascunho da loja antes de configurar as métricas.", 409);
    await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,'commerce.analytics.configure','commerce_store',$1,$3::jsonb)", [tenantId, userId, JSON.stringify({ enabled: settings.enabled, measurementId: settings.measurementId, debug: settings.debug, abandonmentHours: settings.abandonmentHours })]);
  });
  return settings;
}
export type CommerceAnalyticsReport = {
  days: number; environment: AnalyticsReportQuery["environment"]; abandonmentHours: number;
  summary: { orders: number; paidOrders: number; pendingOrders: number; refundedOrders: number; paidCents: number; pendingCents: number; quotes: number; quoteCents: number; carts: number; guestCarts: number; identifiedCarts: number; guestQuoteDrafts: number; identifiedQuoteDrafts: number; abandonedCarts: number; legacyQuotes: number };
  daily: { day: string; orders: number; paidCents: number; quotes: number }[];
  products: { name: string; quantity: number; totalCents: number }[];
};
export async function commerceAnalyticsReport(tenantId: string, query: AnalyticsReportQuery): Promise<CommerceAnalyticsReport> {
  const settings = await loadCommerceAnalyticsSettings(tenantId);
  const result = await getPool().query<{ summary: CommerceAnalyticsReport["summary"]; daily: CommerceAnalyticsReport["daily"]; products: CommerceAnalyticsReport["products"] }>(`
    with orders as (
      select id,total_cents,payment_status,created_at,snapshot->'items' as items from commerce_orders where tenant_id=$1 and deleted_at is null and (cancelled_at is null or payment_status in ('paid','refunded'))
      and created_at >= date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - (($2::int-1)*interval '1 day')
      and ($3::text='all' or payment_environment=$3::text)
    ), quotes as (
      select total_cents,created_at from commerce_buyer_quotes where tenant_id=$1
      and created_at >= date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - (($2::int-1)*interval '1 day')
      and ($3::text='all' or environment=$3::text)
    ), carts as (
      select s.id,s.customer_id,s.cart,s.cart_intent,s.cart_updated_at,s.revision from commerce_sessions s where s.tenant_id=$1 and jsonb_array_length(s.cart)>0
      and s.cart_updated_at >= date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - (($2::int-1)*interval '1 day')
      and ($3::text='all' or s.cart_environment=$3::text)
    ), days as (
      select to_char(d,'YYYY-MM-DD') as day from generate_series((now() at time zone 'America/Sao_Paulo')::date-($2::int-1), (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') d
    ), order_days as (
      select to_char(created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') as day,count(*) as orders,
        coalesce(sum(total_cents) filter(where payment_status='paid'),0) as paid_cents from orders group by 1
    ), quote_days as (
      select to_char(created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') as day,count(*) as quotes from quotes group by 1
    ), top_products as (
      select left(item->>'name',120) as name,sum((item->>'quantity')::bigint) as quantity,sum((item->>'totalCents')::bigint) as "totalCents"
      from orders o cross join lateral jsonb_array_elements(o.items) item where o.payment_status='paid'
      group by item->>'productId',left(item->>'name',120) order by sum((item->>'totalCents')::bigint) desc limit 8
    ) select jsonb_build_object(
      'orders',(select count(*) from orders), 'paidOrders',(select count(*) from orders where payment_status='paid'),
      'pendingOrders',(select count(*) from orders where payment_status='pending'),'refundedOrders',(select count(*) from orders where payment_status='refunded'),
      'paidCents',coalesce((select sum(total_cents) from orders where payment_status='paid'),0),
      'pendingCents',coalesce((select sum(total_cents) from orders where payment_status='pending'),0),
      'quotes',(select count(*) from quotes),'quoteCents',coalesce((select sum(total_cents) from quotes),0),
      'carts',(select count(*) from carts),'guestCarts',(select count(*) from carts where customer_id is null),
      'identifiedCarts',(select count(*) from carts where customer_id is not null),
      'guestQuoteDrafts',(select count(*) from carts where cart_intent='quote' and customer_id is null),
      'identifiedQuoteDrafts',(select count(*) from carts where cart_intent='quote' and customer_id is not null),
      'abandonedCarts',(select count(*) from carts s where s.cart_intent='purchase' and s.cart_updated_at < now()-($4::int*interval '1 hour')
        and not exists(select 1 from commerce_orders o where o.tenant_id=$1 and o.session_id=s.id and o.cart_revision=s.revision and o.deleted_at is null and o.cancelled_at is null)
        and not exists(select 1 from commerce_buyer_quotes q where q.tenant_id=$1 and q.session_id=s.id and q.snapshot->'lines'=s.cart)),
      'legacyQuotes',(select count(*) from commerce_buyer_quotes where tenant_id=$1 and environment='unknown'
        and created_at >= date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - (($2::int-1)*interval '1 day'))
    ) as summary,
    (select coalesce(jsonb_agg(jsonb_build_object('day',d.day,
      'orders',coalesce(o.orders,0),'paidCents',coalesce(o.paid_cents,0),'quotes',coalesce(q.quotes,0)) order by d.day),'[]'::jsonb) from days d left join order_days o on o.day=d.day left join quote_days q on q.day=d.day) as daily,
    (select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from top_products p) as products
  `, [tenantId, Number(query.days), query.environment, settings.abandonmentHours]);
  if (!result.rows[0]) throw new CommerceError("Não foi possível montar os indicadores.", 503);
  return { days: Number(query.days), environment: query.environment, abandonmentHours: settings.abandonmentHours, ...result.rows[0] };
}
