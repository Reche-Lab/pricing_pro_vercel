import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import { commerceTransaction, type CommerceOrder } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import type { CommerceOlistJob } from "@/domain/commerce/olist";
import { commerceOlistRequest } from "./olist-client";
import { listCommerceOlistCustomerChoices, verifyCommerceOlistCustomer } from "./olist-customer";
import { acquireCommerceOlistLease } from "./olist-lease";

function reviewable(order: CommerceOrder | undefined, job: CommerceOlistJob | null | undefined) {
  if (!order || order.deleted_at || order.cancelled_at || order.payment_status !== "paid" || order.payment_environment !== "production")
    throw new CommerceError("Somente pedidos ativos e pagos de produção permitem conferir o cliente Olist.", 409);
  if (!job || !["review", "blocked"].includes(job.status) || job.customer_id || job.sales_order_id || job.invoice_id || (job.attempt_stage && job.attempt_stage !== "customer"))
    throw new CommerceError("A etapa do cliente mudou. Atualize a integração antes de continuar.", 409);
  const document = order.snapshot.billing?.document.replace(/\D/g, "") ?? "";
  if (![11, 14].includes(document.length)) throw new CommerceError("Confira o CPF/CNPJ de faturamento deste pedido.", 409);
  return document;
}
async function context(tenantId: string, orderId: string) {
  const row = (await getPool().query<CommerceOrder & { job: CommerceOlistJob | null }>(`select o.*,to_jsonb(j) as job from commerce_orders o
    left join commerce_olist_orders j on j.tenant_id=o.tenant_id and j.order_id=o.id where o.tenant_id=$1 and o.id=$2 and o.deleted_at is null`, [tenantId, orderId])).rows[0];
  return { document: reviewable(row, row?.job) };
}

export async function commerceOlistCustomerChoices(tenantId: string, orderId: string) {
  const { document } = await context(tenantId, orderId), debugId = randomUUID();
  const signal = AbortSignal.timeout(30000);
  const customers = await listCommerceOlistCustomerChoices(path => commerceOlistRequest(tenantId, path, "GET", undefined, signal), document,
    details => console.info("Commerce Olist customer review lookup.", { tenantId, orderId, debugId, ...details }));
  console.info("Commerce Olist customer choices available.", { tenantId, orderId, debugId, count: customers.length });
  return { customers, billingDocument: document };
}

// Use the same durable locks as the worker. ERP verification happens outside a
// transaction; the final transaction rechecks payment, progress and lock ownership.
export async function linkCommerceOlistCustomer(tenantId: string, orderId: string, actorId: string, externalId: string, note: string) {
  const { document } = await context(tenantId, orderId), pool = getPool(), token = randomUUID();
  const hash = createHash("sha256").update(`${tenantId}:${document}`).digest("hex");
  const orderLock = `commerce-olist:${tenantId}:${orderId}`, customerLock = `commerce-olist-customer:${tenantId}:${hash}`;
  const locks: string[] = [];
  try {
    for (const key of [orderLock, customerLock]) {
      if (!await acquireCommerceOlistLease(pool, key, token)) throw new CommerceError("Esta integração está sendo processada. Aguarde e consulte novamente.", 409);
      locks.push(key);
    }
    const signal = AbortSignal.timeout(30000);
    await verifyCommerceOlistCustomer(path => commerceOlistRequest(tenantId, path, "GET", undefined, signal), externalId, document);
    await commerceTransaction(async (client: PoolClient) => {
      const order = (await client.query<CommerceOrder>("select * from commerce_orders where tenant_id=$1 and id=$2 for update", [tenantId, orderId])).rows[0];
      const job = (await client.query<CommerceOlistJob>("select * from commerce_olist_orders where tenant_id=$1 and order_id=$2 for update", [tenantId, orderId])).rows[0];
      if (reviewable(order, job) !== document) throw new CommerceError("O faturamento do pedido mudou. Consulte os clientes novamente.", 409);
      const settings = (await client.query("select settings from commerce_olist_settings where tenant_id=$1 for share", [tenantId])).rows[0]?.settings;
      if (!settings?.enabled) throw new CommerceError("A integração Olist foi desativada. Atualize o painel.", 409);
      if ((await client.query("select lock_key from commerce_olist_leases where lock_key=any($1::text[]) and token=$2 and expires_at>now() for update", [locks, token])).rowCount !== 2)
        throw new CommerceError("A conferência expirou. Consulte o cliente novamente antes de vincular.", 409);
      const mapping = await client.query(`insert into commerce_olist_customers(tenant_id,document_hash,external_id,create_attempted) values($1,$2,$3,false)
        on conflict(tenant_id,document_hash) do update set external_id=excluded.external_id,create_attempted=false
        where commerce_olist_customers.external_id is null or commerce_olist_customers.external_id=excluded.external_id returning external_id`, [tenantId, hash, externalId]);
      if (!mapping.rowCount) throw new CommerceError("Este CPF/CNPJ já foi vinculado a outro contato Olist pela equipe. Atualize o painel antes de continuar.", 409);
      await client.query(`update commerce_olist_orders set customer_id=$3,status='pending',attempt_stage=null,error_code=null,last_error=null,next_attempt_at=now(),updated_at=now()
        where tenant_id=$1 and order_id=$2`, [tenantId, orderId, externalId]);
      await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'olist.customer_linked',$3)", [tenantId, orderId, JSON.stringify({ actor: actorId, customer_id: externalId, note })]);
    });
    console.info("Commerce Olist customer manually linked.", { tenantId, orderId, debugId: token, externalCustomerId: externalId, actorId });
  } finally {
    if (locks.length) await pool.query("delete from commerce_olist_leases where lock_key=any($1::text[]) and token=$2", [locks, token]);
  }
}
