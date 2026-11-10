import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { getCommerceOlistJob, getCommerceOlistSettings, queueCommerceOlistOrder } from "@/repositories/commerce-olist";
import { authorizedCommerceOrder, assertCommerceProofsReady } from "@/services/commerce/order-artworks";
import { requireCommerceOrderAccess } from "@/services/commerce/order-access";
import { checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody } from "@/services/commerce/http";
import { scheduleCommerceOlist } from "@/services/commerce/olist-schedule";
import { estimatePackagingWithClient } from "@/repositories/packaging";
import { commerceOlistConnection, commerceOlistRequest } from "@/services/commerce/olist-client";
import { isOlistReconnectRequired } from "@/lib/olist/oauth-errors";
import { OlistRequestError } from "@/services/olist/olist";

export const maxDuration = 60;
const schema = z.object({ action: z.enum(["retry", "production_ready", "tracking"]), note: z.string().trim().min(5).max(500),
  trackingCode: z.string().trim().max(100).optional(), trackingUrl: z.string().url().max(1000).refine(value => value.startsWith("https://"), "Use uma URL HTTPS.").optional() }).strict();
function parseOrderId(value: string) {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new CommerceError("Pedido não encontrado.", 404);
  return parsed.data;
}
async function state(tenantId: string, orderId: string) {
  const settings = await getCommerceOlistSettings(tenantId);
  const connection = (await getPool().query("select credentials_encrypted is not null as configured,status from integration_connections where tenant_id=$1 and provider='olist'", [tenantId])).rows[0];
  return { enabled: settings.enabled, autoInvoice: settings.autoInvoice, autoDispatch: settings.autoDispatch,
    configured: Boolean(connection?.configured && connection.status !== "disabled"), job: await getCommerceOlistJob(tenantId, orderId) };
}
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { session } = await requireCommerceOrderAccess();
    const orderId = parseOrderId((await params).orderId);
    await authorizedCommerceOrder(session.tenantId, orderId, null);
    return commerceJson(await state(session.tenantId, orderId));
  } catch (error) { return commerceFailure(error, "olist.order.read"); }
}
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    checkCommerceOrigin(request);
    const { session } = await requireCommerceOrderAccess("commerce:orders:manage");
    const orderId = parseOrderId((await params).orderId);
    const input = await readCommerceBody(request, schema, 4096);
    const order = await authorizedCommerceOrder(session.tenantId, orderId, null);
    if (order.payment_status !== "paid" || order.payment_environment !== "production") throw new CommerceError("Confirme o pagamento de produção antes de sincronizar com Olist.", 409);
    const settings = await getCommerceOlistSettings(session.tenantId);
    if (!settings.enabled) throw new CommerceError("Ative esta integração em Loja online > Olist.", 409);
    await commerceOlistConnection(session.tenantId);
    if (input.action === "production_ready") {
      if (order.fulfillment_status !== "production") throw new CommerceError("Inicie a produção antes de concluí-la.", 409);
      await commerceTransaction(async client => {
        const fresh = (await client.query("select * from commerce_orders where tenant_id=$1 and id=$2 and deleted_at is null for update", [session.tenantId, orderId])).rows[0];
        if (!fresh || fresh.payment_status !== "paid" || fresh.fulfillment_status !== "production") throw new CommerceError("A etapa do pedido mudou. Atualize a página.", 409);
        await assertCommerceProofsReady(client, fresh);
        const items = order.snapshot.items.map(item => ({ productVariantId: order.snapshot.products.find(product => product.id === item.productId)!.variantId, quantity: item.quantity }));
        let packaging = null;
        if (order.snapshot.delivery !== "pickup") {
          try { packaging = await estimatePackagingWithClient(client, session.tenantId, { items }); }
          catch (error) { if (error instanceof Error && /Product|dimensions|weight|packag/i.test(error.message)) throw new CommerceError("Confira peso e dimensões dos produtos e cadastre uma caixa compatível em Embalagens antes de faturar.", 409); throw error; }
        }
        if (order.snapshot.delivery !== "pickup" && !packaging) throw new CommerceError("Cadastre peso, dimensões e uma caixa compatível antes de faturar o envio.", 409);
        await client.query(`insert into commerce_olist_orders(tenant_id,order_id,production_completed_at,package_snapshot) values($1,$2,now(),$3)
          on conflict(tenant_id,order_id) do update set production_completed_at=coalesce(commerce_olist_orders.production_completed_at,now()),
          package_snapshot=coalesce(commerce_olist_orders.package_snapshot,excluded.package_snapshot),status=case when commerce_olist_orders.status in ('review','stopped') then commerce_olist_orders.status else 'pending' end,next_attempt_at=now()`, [session.tenantId, orderId, JSON.stringify(packaging)]);
        await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'olist.production_ready',$3)", [session.tenantId, orderId, JSON.stringify({ actor: session.userId, note: input.note })]);
      });
    } else if (input.action === "tracking") {
      const job = await getCommerceOlistJob(session.tenantId, orderId);
      if (!job?.sales_order_id || !job.invoice_id || ![6, 7].includes(job.invoice_status ?? 0)) throw new CommerceError("Aguarde o pedido Olist e a NF-e autorizada antes de atualizar o rastreio.", 409);
      if (!input.trackingCode || !input.trackingUrl) throw new CommerceError("Informe código e URL de rastreamento.");
      if (order.snapshot.delivery === "pickup") throw new CommerceError("Pedidos para retirada não utilizam rastreamento.", 409);
      const payload = { codigoRastreamento: input.trackingCode, urlRastreamento: input.trackingUrl };
      await commerceOlistRequest(session.tenantId, `/pedidos/${job.sales_order_id}/despacho`, "PUT", payload);
      await commerceOlistRequest(session.tenantId, `/notas/${job.invoice_id}/despacho`, "PUT", payload);
      await commerceTransaction(async client => {
        await client.query("update commerce_olist_orders set tracking_code=$3,tracking_url=$4,updated_at=now() where tenant_id=$1 and order_id=$2", [session.tenantId, orderId, input.trackingCode, input.trackingUrl]);
        await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'olist.tracking',$3)", [session.tenantId, orderId, JSON.stringify({ actor: session.userId, note: input.note, ...payload })]);
      });
    } else await queueCommerceOlistOrder(session.tenantId, orderId, session.userId);
    if (input.action !== "tracking") scheduleCommerceOlist(session.tenantId, orderId);
    return commerceJson({ ok: true, ...(await state(session.tenantId, orderId)) });
  } catch (error) {
    if (isOlistReconnectRequired(error instanceof OlistRequestError ? { status: error.status, message: error.message } : error instanceof Error ? error.message : error))
      return commerceJson({ ok: false, reconnectRequired: true, code: "olist_oauth_invalid", error: "Reconecte o Olist para continuar. Os dados do pedido foram preservados." }, 409);
    return commerceFailure(error, "olist.order.action");
  }
}
