import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "./commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { assertOrderDeletionConfirmation, orderDeletionSchema, type OrderDeletionInput } from "@/domain/commerce/order-deletion";
import type { OrderFilter, OrderWorkspace, OrderWorkspaceItem } from "@/domain/commerce/order-workflow";

// Every join and read marker is tenant-scoped; only summary data leaves this query.
const workspace = `with facts as (
  select o.id,o.payment_status,o.fulfillment_status,o.provider,o.total_cents,o.created_at,o.payment_environment,
    coalesce(o.snapshot->'customer'->>'name','Cliente') as customer_name,
    jsonb_array_length(o.snapshot->'lines') as item_count,
    art.required_artworks,art.prepared_artworks,art.approved_artworks,
    date_trunc('milliseconds',greatest(o.updated_at,art.last_artwork_at)) as activity_at,
    r.seen_through
  from commerce_orders o
  left join commerce_order_reads r on r.tenant_id=o.tenant_id and r.order_id=o.id and r.user_id=$2
  cross join lateral (
    select count(*) filter(where (p->>'personalized')::boolean)::integer as required_artworks,
      count(*) filter(where (p->>'personalized')::boolean and a.prepared_path is not null)::integer as prepared_artworks,
      count(*) filter(where (p->>'personalized')::boolean and a.prepared_path is not null and a.approved_at is not null)::integer as approved_artworks,
      max(a.updated_at) as last_artwork_at
    from jsonb_array_elements(o.snapshot->'lines') l
    left join lateral (select product as p from jsonb_array_elements(o.snapshot->'products') product where product->>'id'=l->>'productId' limit 1) product on true
    left join commerce_artwork_proofs a on a.tenant_id=o.tenant_id and a.order_id=o.id and a.line_id=(l->>'id')::uuid
  ) art
  where o.tenant_id=$1 and o.deleted_at is null
), orders as (
  select *, (seen_through is null or seen_through<activity_at) as unread,
    case when payment_environment='test' then 'test' when payment_status='refunded' then 'refunded'
      when fulfillment_status<>'received' then fulfillment_status
      when payment_status<>'paid' then 'payment'
      when prepared_artworks<required_artworks then 'preparation'
      when approved_artworks<required_artworks then 'approval' else 'ready' end as stage
  from facts
)`;

export async function getOrderWorkspace(tenantId: string, userId: string, input: { filter?: OrderFilter; page?: number; pageSize?: number } = {}): Promise<OrderWorkspace> {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.max(1, Math.min(50, Math.trunc(input.pageSize ?? 20)));
  const result = await getPool().query(`${workspace}, filtered as (
      select * from orders where ($3='all' and payment_environment='production') or ($3='unread' and unread and payment_environment='production') or stage=$3
    ) select
      (select jsonb_build_object('total',count(*) filter(where payment_environment='production'),'unread',count(*) filter(where unread and payment_environment='production'),
        'payment',count(*) filter(where stage='payment'),'preparation',count(*) filter(where stage='preparation'),
        'approval',count(*) filter(where stage='approval'),'ready',count(*) filter(where stage='ready'),
        'production',count(*) filter(where stage='production')) from orders) as summary,
      (select count(*)::integer from filtered) as total,
      coalesce((select jsonb_agg(to_jsonb(selected) - 'seen_through' - 'stage' order by activity_at desc,id desc)
        from (select * from filtered order by activity_at desc,id desc limit $4 offset $5) selected),'[]'::jsonb) as orders`,
    [tenantId, userId, input.filter ?? "all", pageSize, (page - 1) * pageSize]);
  return { ...result.rows[0], page, pageSize };
}

export async function getOrderWorkspaceItem(tenantId: string, userId: string, orderId: string): Promise<OrderWorkspaceItem | null> {
  const result = await getPool().query(`${workspace} select * from orders where id=$3`, [tenantId, userId, orderId]);
  const row = result.rows[0];
  return row ? { ...row, activity_at: new Date(row.activity_at).toISOString(), created_at: new Date(row.created_at).toISOString() } : null;
}

export async function markOrderSeen(tenantId: string, userId: string, orderId: string, seenThrough: string) {
  const result = await getPool().query(`insert into commerce_order_reads(tenant_id,order_id,user_id,seen_through)
    select tenant_id,id,$2,least($4::timestamptz,clock_timestamp()) from commerce_orders where tenant_id=$1 and id=$3 and deleted_at is null
    on conflict(tenant_id,order_id,user_id) do update set seen_through=greatest(commerce_order_reads.seen_through,excluded.seen_through)
    returning order_id`, [tenantId, userId, orderId, seenThrough]);
  return Boolean(result.rowCount);
}

export async function deleteCommerceOrder(tenantId: string, actorId: string, orderId: string, input: OrderDeletionInput) {
  const parsed = orderDeletionSchema.safeParse(input);
  if (!parsed.success) throw new CommerceError(parsed.error.issues[0]?.message ?? "Confira os dados de confirmação.");
  assertOrderDeletionConfirmation(orderId, parsed.data.confirmation);
  return commerceTransaction(async client => {
    const order = (await client.query("select id,deleted_at,payment_status,fulfillment_status,total_cents,provider,payment_environment from commerce_orders where tenant_id=$1 and id=$2 for update", [tenantId, orderId])).rows[0];
    if (!order) throw new CommerceError("Pedido não encontrado.", 404);
    if (order.deleted_at) return { alreadyDeleted: true };
    await client.query("update commerce_orders set deleted_at=now(),deleted_by=$3::uuid,deletion_reason=$4,updated_at=now() where tenant_id=$1 and id=$2", [tenantId, orderId, actorId, parsed.data.reason]);
    await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'order.admin_deleted',$3)", [tenantId, orderId, JSON.stringify({ actor: actorId, note: parsed.data.reason })]);
    await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,'commerce.order.deleted','commerce_order',$3,$4)", [tenantId, actorId, orderId, JSON.stringify({ reason: parsed.data.reason, paymentStatus: order.payment_status, fulfillmentStatus: order.fulfillment_status, totalCents: order.total_cents, provider: order.provider, paymentEnvironment: order.payment_environment, financialRecordsPreserved: true })]);
    return { alreadyDeleted: false };
  });
}
