import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "./commerce";
import { aggregateShipmentStatus, nextShipmentStatus, normalizedShipmentStatus, safeShippingUrl, shippingStatusLabel, trackingValue, type OrderShipment, type ShipmentParcel } from "@/domain/commerce/order-shipping";

export async function getOrderShipment(tenantId: string, orderId: string): Promise<OrderShipment | null> {
  const row = (await getPool().query<OrderShipment>(`select s.*,coalesce((select jsonb_agg(p order by p.parcel_index) from commerce_order_shipment_parcels p where p.tenant_id=s.tenant_id and p.shipment_id=s.id),'[]'::jsonb) as parcels
    from commerce_order_shipments s where s.tenant_id=$1 and s.order_id=$2`, [tenantId, orderId])).rows[0];
  return row ?? null;
}

export async function buyerShippingForOrders(tenantId: string, orderIds: string[]) {
  if (!orderIds.length) return new Map<string, BuyerShipping>();
  const rows = (await getPool().query<OrderShipment & { events: Array<{ status: string; occurred_at: string; parcel_index: number }> }>(`select s.*,
    coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'tracking_code',p.tracking_code,'tracking_url',p.tracking_url,'status',p.status) order by p.parcel_index)
      from commerce_order_shipment_parcels p where p.tenant_id=s.tenant_id and p.shipment_id=s.id),'[]'::jsonb) as parcels,
    coalesce((select jsonb_agg(e) from (select e.status,e.occurred_at,p.parcel_index from commerce_shipment_events e
      join commerce_order_shipment_parcels p on p.tenant_id=e.tenant_id and p.id=e.parcel_id
      where e.tenant_id=s.tenant_id and e.shipment_id=s.id order by e.occurred_at desc limit 30) e),'[]'::jsonb) as events
    from commerce_order_shipments s where s.tenant_id=$1 and s.order_id=any($2::uuid[])`, [tenantId, orderIds])).rows;
  return new Map(rows.map(row => [row.order_id, {
    status: row.status, serviceName: row.service_name, trackingCode: trackingValue(row.tracking_code), trackingUrl: safeShippingUrl(row.tracking_url),
    postedAt: iso(row.posted_at), deliveredAt: iso(row.delivered_at), updatedAt: iso(row.updated_at),
    parcels: row.parcels.map(p => ({ id: p.id, status: p.status, trackingCode: trackingValue(p.tracking_code), trackingUrl: safeShippingUrl(p.tracking_url) })),
    events: row.events.map(event => ({ status: event.status, occurredAt: iso(event.occurred_at)!, description: `${row.parcels.length > 1 ? `Volume ${event.parcel_index + 1} · ` : ""}${shippingStatusLabel(event.status)}` })),
  }]));
}
export type BuyerShipping = {
  status: string; serviceName: string; trackingCode: string | null; trackingUrl: string | null;
  postedAt: string | null; deliveredAt: string | null; updatedAt: string | null;
  parcels: Array<{ id: string; status: string; trackingCode: string | null; trackingUrl: string | null }>;
  events: Array<{ status: string; occurredAt: string; description: string }>;
};

export async function persistShippingParcel(tenantId: string, shipmentId: string, parcelId: string, data: Record<string, unknown>, eventKey: string, occurredAt: string, authoritative = false) {
  return commerceTransaction(async client => {
    const parent = (await client.query<OrderShipment>("select * from commerce_order_shipments where tenant_id=$1 and id=$2", [tenantId, shipmentId])).rows[0];
    if (!parent) return false;
    const order = (await client.query("select payment_status,payment_environment,cancelled_at,deleted_at from commerce_orders where tenant_id=$1 and id=$2 for update", [tenantId, parent.order_id])).rows[0];
    const shipment = (await client.query<OrderShipment>("select * from commerce_order_shipments where tenant_id=$1 and id=$2 for update", [tenantId, shipmentId])).rows[0];
    const parcel = (await client.query<ShipmentParcel & { provider_updated_at: Date | null }>("select * from commerce_order_shipment_parcels where tenant_id=$1 and shipment_id=$2 and id=$3 for update", [tenantId, shipmentId, parcelId])).rows[0];
    if (!parcel) return false;
    const status = normalizedShipmentStatus(data);
    const stale = parcel.provider_updated_at && parcel.provider_updated_at.getTime() > new Date(occurredAt).getTime();
    if (stale) return false;
    const recorded = await client.query(`insert into commerce_shipment_events(tenant_id,shipment_id,parcel_id,event_key,status,occurred_at) values($1,$2,$3,$4,$5,$6::timestamptz)
      on conflict(event_key) do nothing returning id`, [tenantId, shipmentId, parcelId, eventKey, status, occurredAt]);
    if (!recorded.rowCount) return false;
    const reversed = authoritative && status === "cart" && ["purchased", "label_ready", "posted"].includes(parcel.status);
    const next = reversed ? "review" : nextShipmentStatus(parcel.status, status);
    const tracking = trackingValue(data.tracking) ?? trackingValue(data.tracking_code);
    const url = safeShippingUrl(data.tracking_url);
    await client.query(`update commerce_order_shipment_parcels set status=$4,tracking_code=coalesce($5,tracking_code),tracking_url=coalesce($6,tracking_url),
      paid_at=coalesce(paid_at,$7::timestamptz),posted_at=coalesce(posted_at,$8::timestamptz),delivered_at=coalesce(delivered_at,$9::timestamptz),
      provider_updated_at=greatest(provider_updated_at,$10::timestamptz),updated_at=now() where tenant_id=$1 and shipment_id=$2 and id=$3`,
    [tenantId, shipmentId, parcelId, next, tracking, url, isoUnknown(data.paid_at), isoUnknown(data.posted_at) ?? (next === "posted" ? occurredAt : null), isoUnknown(data.delivered_at) ?? (next === "delivered" ? occurredAt : null), occurredAt]);
    const parcels = (await client.query("select status,tracking_code,tracking_url,posted_at,delivered_at from commerce_order_shipment_parcels where tenant_id=$1 and shipment_id=$2 order by parcel_index", [tenantId, shipmentId])).rows;
    const expected = shipment.snapshot.carrier?.volumes.length;
    const aggregate = expected && parcels.length === expected ? aggregateShipmentStatus(parcels.map(p => p.status)) : "review";
    const code = parcels.find(p => p.tracking_code)?.tracking_code ?? null;
    const trackingUrl = parcels.find(p => p.tracking_url)?.tracking_url ?? null;
    const posted = parcels.every(p => p.posted_at || p.delivered_at) ? parcels.find(p => p.posted_at)?.posted_at ?? occurredAt : null;
    const delivered = parcels.every(p => p.delivered_at) ? parcels[parcels.length - 1].delivered_at : null;
    await client.query(`update commerce_order_shipments set status=$3,tracking_code=$4,tracking_url=$5,posted_at=coalesce(posted_at,$6::timestamptz),delivered_at=coalesce(delivered_at,$7::timestamptz),updated_at=now() where tenant_id=$1 and id=$2`,
      [tenantId, shipmentId, aggregate, code, trackingUrl, posted, delivered]);
    const active = order && order.payment_status === "paid" && order.payment_environment === "production" && !order.cancelled_at && !order.deleted_at;
    if (active && ["posted", "delivered"].includes(aggregate)) await client.query(`update commerce_orders set fulfillment_status=$3,updated_at=now() where tenant_id=$1 and id=$2 and fulfillment_status in ('production','shipped')`, [tenantId, parent.order_id, aggregate === "delivered" ? "completed" : "shipped"]);
    const eventType = aggregate !== shipment.status ? `shipping.${aggregate}` : code && code !== shipment.tracking_code ? "shipping.tracking_available" : null;
    if (eventType) await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,$3,$4)", [tenantId, parent.order_id, eventType,
      JSON.stringify({ shipmentId, status: aggregate, serviceName: parent.service_name, trackingCode: code, trackingUrl, occurredAt })]);
    if (tracking && tracking !== parcel.tracking_code && !["shipping.posted", "shipping.delivered", "shipping.tracking_available"].includes(eventType ?? ""))
      await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'shipping.tracking_available',$3)", [tenantId, parent.order_id,
        JSON.stringify({ shipmentId, status: aggregate, serviceName: parent.service_name, trackingCode: tracking, trackingCodes: parcels.map(p => p.tracking_code).filter(Boolean), trackingUrl: url, occurredAt })]);
    return true;
  });
}
const iso = (value: string | Date | null) => value ? new Date(value).toISOString() : null;
export function isoUnknown(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
