import { getPool } from "@/lib/db/client";
import { commerceTransaction, type CommerceOrder } from "./commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { commerceOlistSettingsSchema, type CommerceOlistSettings, type CommerceOlistJob } from "@/domain/commerce/olist";
import { commerceOlistConnection } from "@/services/commerce/olist-client";

export async function getCommerceOlistSettings(tenantId: string) {
  const row = (await getPool().query("select settings from commerce_olist_settings where tenant_id=$1", [tenantId])).rows[0];
  return commerceOlistSettingsSchema.parse(row?.settings ?? {});
}
export async function getCommerceOlistAdmin(tenantId: string) {
  const connection = (await getPool().query("select status,credentials_encrypted is not null as configured from integration_connections where tenant_id=$1 and provider='olist'", [tenantId])).rows[0];
  const settings = await getCommerceOlistSettings(tenantId);
  const options = connection?.configured ? (await getPool().query("select kind,external_id,name from olist_payment_options where tenant_id=$1 and active and kind in ('receiving_method','category') order by kind,name", [tenantId])).rows : [];
  return { configured: Boolean(connection?.configured && connection.status !== "disabled"), settings, options };
}
export async function saveCommerceOlistSettings(tenantId: string, actorId: string, input: CommerceOlistSettings) {
  const settings = commerceOlistSettingsSchema.parse(input);
  if (settings.enabled) {
    await commerceOlistConnection(tenantId);
    if (![settings.pixReceivingId, settings.cardReceivingId, settings.manualReceivingId].some(Boolean)) throw new CommerceError("Selecione ao menos uma forma de recebimento para os pedidos da loja.");
  }
  const ids = [settings.pixReceivingId, settings.cardReceivingId, settings.manualReceivingId];
  const rows = (await getPool().query("select kind,external_id from olist_payment_options where tenant_id=$1 and active and external_id=any($2::text[])", [tenantId, [...ids, settings.categoryId].filter(Boolean)])).rows;
  if (settings.enabled && (ids.some(id => id && !rows.some(row => row.kind === "receiving_method" && row.external_id === id)) || (settings.categoryId && !rows.some(row => row.kind === "category" && row.external_id === settings.categoryId))))
    throw new CommerceError("Selecione opções sincronizadas do Olist deste tenant.");
  await commerceTransaction(async client => {
    await client.query("insert into commerce_olist_settings(tenant_id,settings,updated_by) values($1,$2,$3) on conflict(tenant_id) do update set settings=excluded.settings,updated_by=excluded.updated_by,updated_at=now()", [tenantId, JSON.stringify(settings), actorId]);
    await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type,metadata) values($1,$2,'commerce.olist.settings','commerce_store',$3)", [tenantId, actorId, JSON.stringify(settings)]);
  });
}
export async function getCommerceOlistJob(tenantId: string, orderId: string): Promise<CommerceOlistJob | null> {
  return (await getPool().query("select to_jsonb(j) as job from commerce_olist_orders j join commerce_orders o on o.tenant_id=j.tenant_id and o.id=j.order_id where j.tenant_id=$1 and j.order_id=$2 and o.deleted_at is null", [tenantId, orderId])).rows[0]?.job ?? null;
}
export async function queueCommerceOlistOrder(tenantId: string, orderId: string, actorId: string) {
  await commerceTransaction(async client => {
    const order = (await client.query<CommerceOrder>("select * from commerce_orders where tenant_id=$1 and id=$2 and deleted_at is null for update", [tenantId, orderId])).rows[0];
    if (!order) throw new CommerceError("Pedido não encontrado.", 404);
    if (order.payment_status !== "paid" || order.payment_environment !== "production") throw new CommerceError("Somente pedidos pagos de produção podem ser sincronizados.", 409);
    const settings = (await client.query("select settings from commerce_olist_settings where tenant_id=$1", [tenantId])).rows[0]?.settings;
    if (!settings?.enabled) throw new CommerceError("Ative a integração em Loja online > Olist.", 409);
    await client.query("insert into commerce_olist_orders(tenant_id,order_id) values($1,$2) on conflict(tenant_id,order_id) do update set status=case when commerce_olist_orders.status='stopped' then 'stopped' else 'pending' end,next_attempt_at=now(),updated_at=now()", [tenantId, orderId]);
    await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'olist.queued',$3)", [tenantId, orderId, JSON.stringify({ actor: actorId, note: "Sincronização Olist solicitada pela equipe." })]);
  });
}
