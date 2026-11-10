import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import { CommerceError } from "@/domain/commerce/commerce";
import { billingSchema } from "@/domain/commerce/schemas";
import { buildCommerceOlistCustomer, buildCommerceOlistOrder, commerceOlistTransport, nextCommerceOlistStage, type CommerceOlistJob, type CommerceOlistStage, type CommerceOlistProduct } from "@/domain/commerce/olist";
import { getCommerceOlistSettings } from "@/repositories/commerce-olist";
import type { CommerceOrder } from "@/repositories/commerce";
import { OlistRequestError } from "@/services/olist/olist";
import { commerceOlistConnection, commerceOlistRequest } from "./olist-client";
import { isOlistReconnectRequired } from "@/lib/olist/oauth-errors";

class ReviewRequired extends CommerceError {}
class RetryLater extends Error {}
type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const rows = (value: Row): Row[] => Array.isArray(value.itens) ? value.itens.map(record) : [];
const id = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : typeof value === "string" && /^[1-9]\d{0,14}$/.test(value) ? value : null;
const numeric = (value: unknown) => value === null || value === undefined ? null : Number.isInteger(Number(value)) ? Number(value) : null;
const safeLink = (value: unknown) => { try { const url = new URL(String(value)); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null; } catch { return null; } };
const uncertain = () => new ReviewRequired("Uma chamada anterior pode ter sido concluída no Olist. Não será repetida sem localizar o registro. Confira o Olist e use Conferir e retomar; se não houver retorno, solicite revisão técnica.", 409);

async function acquireLease(client: PoolClient, key: string, token: string) {
  return Boolean((await client.query(`insert into commerce_olist_leases(lock_key,token,expires_at) values($1,$2,now()+interval '2 minutes')
    on conflict(lock_key) do update set token=excluded.token,expires_at=excluded.expires_at where commerce_olist_leases.expires_at<now() returning token`, [key, token])).rowCount);
}
// Durable leases work with both session and transaction poolers. No transaction
// stays open across ERP requests; uncertain mutations must be reconciled, not replayed.
export async function processCommerceOlistOrder(tenantId: string, orderId: string, maxSteps = 4) {
  const client = await getPool().connect();
  const lock = `commerce-olist:${tenantId}:${orderId}`;
  const lockToken = randomUUID();
  let locked = false;
  try {
    locked = await acquireLease(client, lock, lockToken);
    if (!locked) return;
    const started = Date.now();
    const deadline = AbortSignal.timeout(45000);
    for (let step = 0; step < Math.min(6, maxSteps) && Date.now() - started < 35000; step++) {
      const order = (await client.query<CommerceOrder>("select o.* from commerce_orders o join commerce_stores s on s.tenant_id=o.tenant_id and s.enabled join tenants t on t.id=o.tenant_id and t.status='active' where o.tenant_id=$1 and o.id=$2", [tenantId, orderId])).rows[0];
      const job = (await client.query<CommerceOlistJob>("select * from commerce_olist_orders where tenant_id=$1 and order_id=$2", [tenantId, orderId])).rows[0];
      if (!order || !job || ["blocked", "review", "stopped"].includes(job.status)) return;
      if (job.status === "pending" && new Date(job.next_attempt_at).getTime() > Date.now()) return;
      const settings = await getCommerceOlistSettings(tenantId);
      if (!settings.enabled) { await client.query("update commerce_olist_orders set status='waiting',updated_at=now() where tenant_id=$1 and order_id=$2 and status<>'stopped'", [tenantId, orderId]); return; }
      if (order.deleted_at || order.payment_status !== "paid" || order.payment_environment !== "production") {
        await client.query("update commerce_olist_orders set status='stopped',updated_at=now() where tenant_id=$1 and order_id=$2", [tenantId, orderId]); return;
      }
      const stage = nextCommerceOlistStage(order, job, settings);
      if (!stage) {
        const status = job.invoice_id && [6, 7].includes(job.invoice_status ?? 0) ? "done" : "waiting";
        await client.query("update commerce_olist_orders set status=$3,last_error=null,error_code=null,updated_at=now() where tenant_id=$1 and order_id=$2 and status<>'stopped' and (production_completed_at is not null)=$4::boolean", [tenantId, orderId, status, Boolean(job.production_completed_at)]); return;
      }
      const debugId = randomUUID();
      await client.query("update commerce_olist_orders set status='processing',debug_id=$3,updated_at=now() where tenant_id=$1 and order_id=$2 and status<>'stopped'", [tenantId, orderId, debugId]);
      console.info("Commerce Olist stage started.", { tenantId, orderId, stage, debugId, recovering: Boolean(job.attempt_stage) });
      let attempted = Boolean(job.attempt_stage);
      const request = async (path: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown) => {
        if (!(await client.query("update commerce_olist_leases set expires_at=now()+interval '2 minutes' where lock_key=$1 and token=$2 and expires_at>now() returning token", [lock, lockToken])).rowCount) throw uncertain();
        return commerceOlistRequest(tenantId, path, method, body, deadline);
      };
      const mutate = async (path: string, body: unknown, method: "POST" | "PUT" = "POST") => {
        const fresh = (await client.query("select payment_status,payment_environment,deleted_at from commerce_orders where tenant_id=$1 and id=$2", [tenantId, orderId])).rows[0];
        const liveSettings = (await client.query("select settings from commerce_olist_settings where tenant_id=$1", [tenantId])).rows[0]?.settings;
        if (!fresh || fresh.payment_status !== "paid" || fresh.payment_environment !== "production" || fresh.deleted_at || !liveSettings?.enabled) throw new CommerceError("Pedido ou integração não permite mais esta operação.", 409);
        if ((stage.startsWith("invoice_") || stage === "shipping") && liveSettings.autoInvoice === false) throw new CommerceError("O faturamento automático foi desativado. Confira as configurações antes de retomar.", 409);
        if (stage === "dispatch" && liveSettings.autoDispatch === false) throw new CommerceError("A expedição automática foi desativada. Confira as configurações antes de retomar.", 409);
        await client.query("update commerce_olist_orders set attempt_stage=$3,attempts=attempts+1,updated_at=now() where tenant_id=$1 and order_id=$2", [tenantId, orderId, stage]);
        attempted = true;
        return request(path, method, body);
      };
      try {
        let changes: Row = {};
        if (stage === "customer") {
          const billing = billingSchema.extend({ personType: z.enum(["F", "J"]).optional() }).safeParse(order.snapshot.billing);
          if (!billing.success || !billing.data.document) throw new CommerceError("Confira CPF/CNPJ e dados de faturamento antes de cadastrar o cliente Olist.", 409);
          const document = billing.data.document.replace(/\D/g, "");
          const hash = createHash("sha256").update(`${tenantId}:${document}`).digest("hex");
          const customerLock = `commerce-olist-customer:${tenantId}:${hash}`;
          if (!await acquireLease(client, customerLock, lockToken)) throw new RetryLater("Outro pedido está sincronizando este cliente. Aguardando conclusão.");
          try {
            const mapped = (await client.query("select external_id,create_attempted from commerce_olist_customers where tenant_id=$1 and document_hash=$2", [tenantId, hash])).rows[0];
            let externalId = id(mapped?.external_id);
            if (!externalId) {
              const found = await request(`/contatos?${new URLSearchParams({ cpfCnpj: document, limit: "100", offset: "0" })}`);
              const matches = rows(found).filter(row => String(row.cpfCnpj ?? "").replace(/\D/g, "") === document);
              if (matches.length > 1) throw new ReviewRequired("Há mais de um contato Olist com o CPF/CNPJ de faturamento. Corrija a duplicidade antes de retomar.", 409);
              externalId = id(matches[0]?.id);
              if (!externalId) {
                if (job.attempt_stage || mapped?.create_attempted) throw uncertain();
                await client.query("insert into commerce_olist_customers(tenant_id,document_hash,create_attempted) values($1,$2,true) on conflict(tenant_id,document_hash) do update set create_attempted=true", [tenantId, hash]);
                try { externalId = id((await mutate("/contatos", buildCommerceOlistCustomer(order))).id); }
                catch (error) {
                  if (error instanceof OlistRequestError && error.status >= 400 && error.status < 500) await client.query("update commerce_olist_customers set create_attempted=false where tenant_id=$1 and document_hash=$2", [tenantId, hash]);
                  throw error;
                }
              }
              if (!externalId) throw uncertain();
              await client.query("insert into commerce_olist_customers(tenant_id,document_hash,external_id) values($1,$2,$3) on conflict(tenant_id,document_hash) do update set external_id=excluded.external_id,create_attempted=false", [tenantId, hash, externalId]);
            }
            changes = { customer_id: externalId };
          } finally { await client.query("delete from commerce_olist_leases where lock_key=$1 and token=$2", [customerLock, lockToken]); }
        } else if (stage === "sales_order") {
          const found = await request(`/pedidos?${new URLSearchParams({ numeroPedidoEcommerce: order.id, limit: "100", offset: "0" })}`);
          const matches: Row[] = [];
          for (const candidate of rows(found)) {
            const externalId = id(candidate.id); if (!externalId) continue;
            const detail = await request(`/pedidos/${externalId}`);
            if (record(detail.ecommerce).numeroPedidoEcommerce === order.id) {
              if (id(record(detail.cliente).id) !== job.customer_id || Math.round(Number(detail.valor) * 100) !== order.total_cents)
                throw new ReviewRequired("O pedido encontrado no Olist tem cliente ou total diferente da compra. Revise antes de vincular.", 409);
              matches.push(detail);
              if (matches.length > 1) throw new ReviewRequired("Mais de um pedido Olist possui a referência desta compra. Revise antes de continuar.", 409);
            }
          }
          if (matches.length > 1) throw new ReviewRequired("Mais de um pedido Olist possui a referência desta compra. Revise antes de continuar.", 409);
          let externalId = id(matches[0]?.id);
          let kind = job.payment_kind;
          if (!externalId) {
            if (job.attempt_stage) throw uncertain();
            const integration = await commerceOlistConnection(tenantId);
            const products = (await client.query<CommerceOlistProduct>("select id as variant_id,external_olist_product_id as external_id,sku from product_variants where tenant_id=$1 and id=any($2::uuid[])", [tenantId, order.snapshot.products.map(product => product.variantId)])).rows;
            if (!kind) {
              if (order.provider === "manual") kind = "manual";
              else {
                const attempt = (await client.query("select method from commerce_payment_attempts where tenant_id=$1 and order_id=$2 and status='paid' and payment_environment='production' order by created_at desc limit 1", [tenantId, orderId])).rows[0];
                const event = (await client.query("select metadata->>'paymentKind' as kind from commerce_order_events where tenant_id=$1 and order_id=$2 and type='payment.paid' order by created_at desc limit 1", [tenantId, orderId])).rows[0];
                kind = attempt?.method === "pix" || attempt?.method === "card" ? attempt.method : event?.kind === "pix" || event?.kind === "card" ? event.kind : "other";
              }
            }
            const payload = buildCommerceOlistOrder(order, job.customer_id!, products, settings, integration.settings, kind, job.package_snapshot);
            externalId = id((await mutate("/pedidos", payload)).id);
          }
          if (!externalId) throw uncertain();
          changes = { sales_order_id: externalId, payment_kind: kind };
        } else if (stage === "shipping") {
          if (!job.package_snapshot) throw new CommerceError("Confira a embalagem antes de faturar este pedido.", 409);
          const connection = await commerceOlistConnection(tenantId);
          const transport = commerceOlistTransport(order, connection.settings);
          const packaging = job.package_snapshot;
          await mutate(`/pedidos/${job.sales_order_id}/despacho`, {
            ...transport, fretePagoEmpresa: order.shipping_cents / 100,
            volumes: packaging.boxesNeeded, pesoBruto: packaging.grossWeightKg, pesoLiquido: packaging.netWeightKg,
            observacoes: `Caixa: ${packaging.box.widthCm} x ${packaging.box.lengthCm} x ${packaging.box.heightCm} cm.`,
          }, "PUT");
          changes = { shipping_synced_at: new Date().toISOString() };
        } else if (stage === "invoice_create") {
          const found = await request(`/notas?${new URLSearchParams({ idVenda: job.sales_order_id!, limit: "100", offset: "0" })}`);
          const matches = rows(found);
          if (matches.length > 1) throw new ReviewRequired("Há várias notas vinculadas a este pedido Olist. Confira antes de faturar.", 409);
          let invoice = matches[0];
          if (!invoice) { if (job.attempt_stage) throw uncertain(); invoice = await mutate(`/pedidos/${job.sales_order_id}/gerar-nota-fiscal`, { modelo: 55 }); }
          if (!id(invoice.id)) throw uncertain();
          changes = { invoice_id: id(invoice.id), invoice_number: invoice.numero != null ? String(invoice.numero) : null, invoice_series: invoice.serie != null ? String(invoice.serie) : null, invoice_status: numeric(invoice.situacao) };
        } else if (stage === "invoice_authorize" || stage === "invoice_status") {
          let invoice = await request(`/notas/${job.invoice_id}`);
          let status = numeric(invoice.situacao);
          if ([3, 5, 10].includes(status ?? 0)) throw new ReviewRequired(`A nota fiscal está ${status === 3 ? "cancelada" : status === 5 ? "rejeitada" : "denegada"} no Olist. Revise os dados fiscais antes de continuar.`, 409);
          if (stage === "invoice_authorize" && ![6, 7].includes(status ?? 0)) {
            if (Math.round(Number(invoice.valor) * 100) !== order.total_cents || String(record(invoice.cliente).cpfCnpj ?? "").replace(/\D/g, "") !== order.snapshot.billing?.document.replace(/\D/g, ""))
              throw new ReviewRequired("O cliente ou o total da nota no Olist diverge da compra paga. Confira a nota antes de autorizar.", 409);
            if (settings.sendInvoiceEmail && String(record(invoice.cliente).email ?? "").trim().toLowerCase() !== order.snapshot.billing?.email.trim().toLowerCase())
              throw new CommerceError("O e-mail da nota no Olist difere do e-mail de faturamento desta compra. Corrija o destinatário no Olist antes de autorizar; não alteramos o cadastro global automaticamente.", 409);
            if (job.attempt_stage) throw uncertain();
            invoice = await mutate(`/notas/${job.invoice_id}/emitir`, { enviarEmail: settings.sendInvoiceEmail });
            status = numeric(invoice.situacao);
            changes.authorization_requested_at = new Date().toISOString();
            if (settings.sendInvoiceEmail) changes.email_requested_at = new Date().toISOString();
          }
          if ([3, 5, 10].includes(status ?? 0)) throw new ReviewRequired("A autorização fiscal foi recusada. Revise a nota no Olist; não emitiremos outra nota automaticamente.", 409);
          changes = { ...changes, invoice_status: status, invoice_link: safeLink(invoice.linkAcesso), invoice_number: invoice.numero != null ? String(invoice.numero) : job.invoice_number, invoice_series: invoice.serie != null ? String(invoice.serie) : job.invoice_series };
          if (![6, 7].includes(status ?? 0)) {
            await persistStage(client, tenantId, orderId, stage, debugId, { ...changes, status: "pending", next_attempt_at: new Date(Date.now() + 60000).toISOString() }); return;
          }
          // Commit fiscal approval before optional document retrieval: a link
          // outage must never make authorization/email look unsubmitted.
          if (order.snapshot.delivery === "pickup" || !settings.autoDispatch) changes.status = "done";
          await persistStage(client, tenantId, orderId, stage, debugId, changes);
          try {
            const link = safeLink((await request(`/notas/${job.invoice_id}/link`)).link);
            if (link) await client.query("update commerce_olist_orders set invoice_link=$3 where tenant_id=$1 and order_id=$2", [tenantId, orderId, link]);
          } catch { console.warn("Commerce Olist document link deferred.", { tenantId, orderId, debugId }); }
          console.info("Commerce Olist stage completed.", { tenantId, orderId, stage, debugId });
          continue;
        } else if (stage === "dispatch") {
          const found = await request(`/expedicao?${new URLSearchParams({ idNota: job.invoice_id!, limit: "100", offset: "0" })}`);
          const matches = rows(found);
          if (matches.length > 1) throw new ReviewRequired("Há várias expedições para esta nota no Olist. Confira antes de continuar.", 409);
          let externalId = id(matches[0]?.id);
          if (!externalId) {
            if (job.attempt_stage) throw uncertain();
            externalId = id((await mutate("/expedicao", { idsNotasFiscais: [Number(job.invoice_id)] })).id);
          }
          if (!externalId) throw uncertain();
          changes = { expedition_id: externalId, status: "done" };
        }
        await persistStage(client, tenantId, orderId, stage, debugId, changes);
        console.info("Commerce Olist stage completed.", { tenantId, orderId, stage, debugId });
      } catch (error) {
        const reconnect = isOlistReconnectRequired(error instanceof OlistRequestError ? { status: error.status, message: error.message } : error instanceof Error ? error.message : error);
        const rejected = error instanceof OlistRequestError && error.status >= 400 && error.status < 500;
        const review = error instanceof ReviewRequired || (attempted && stage !== "shipping" && !rejected && !(error instanceof CommerceError));
        const retry = !reconnect && !review && (error instanceof OlistRequestError ? error.status >= 500 || error.status === 429 : !(error instanceof CommerceError));
        const code = reconnect ? "olist_oauth_invalid" : review ? "olist_review_required" : retry ? "olist_temporarily_unavailable" : "olist_data_required";
        const message = reconnect ? "Reconecte o Olist para continuar. As etapas concluídas foram preservadas." : review && !(error instanceof ReviewRequired) ? uncertain().message : error instanceof Error ? error.message.slice(0, 600) : "Não foi possível concluir esta etapa Olist.";
        await client.query(`update commerce_olist_orders set status=$3,error_code=$4,last_error=$5,debug_id=$6,
          attempt_stage=case when $7::boolean then null else attempt_stage end,
          next_attempt_at=now()+interval '5 minutes',updated_at=now() where tenant_id=$1 and order_id=$2 and status<>'stopped'`,
        [tenantId, orderId, review ? "review" : retry ? "pending" : "blocked", code, message, debugId, rejected || !attempted || stage === "shipping"]);
        await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'olist.error',$3)", [tenantId, orderId, JSON.stringify({ stage, code, debugId, note: message })]);
        console.error("Commerce Olist stage failed.", { tenantId, orderId, stage, debugId, code, httpStatus: error instanceof OlistRequestError ? error.status : undefined, uncertainMutation: review });
        return;
      }
    }
    await client.query("update commerce_olist_orders set status='pending',next_attempt_at=now(),updated_at=now() where tenant_id=$1 and order_id=$2 and status='processing'", [tenantId, orderId]);
  } finally {
    if (locked) await client.query("delete from commerce_olist_leases where lock_key=$1 and token=$2", [lock, lockToken]);
    client.release();
  }
}

const patchColumns = new Set(["customer_id", "sales_order_id", "shipping_synced_at", "invoice_id", "invoice_number", "invoice_series", "invoice_status", "invoice_link", "authorization_requested_at", "email_requested_at", "expedition_id", "payment_kind", "status", "next_attempt_at"]);
async function persistStage(client: PoolClient, tenantId: string, orderId: string, stage: CommerceOlistStage, debugId: string, patch: Row) {
  const entries = Object.entries(patch).filter(([key]) => patchColumns.has(key));
  await client.query("begin");
  try {
    await client.query(`update commerce_olist_orders set ${entries.length ? entries.map(([key], index) => `${key}=$${index + 3}`).join(",") + "," : ""}attempt_stage=null,last_error=null,error_code=null,updated_at=now() where tenant_id=$1 and order_id=$2 and status<>'stopped'`, [tenantId, orderId, ...entries.map(([, value]) => value)]);
    await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,$3,$4)", [tenantId, orderId, `olist.${stage}`, JSON.stringify({ debugId, note: stage === "invoice_status" && ![6, 7].includes(Number(patch.invoice_status)) ? "Olist processando a autorização fiscal." : `Etapa Olist concluída: ${stage}.`, ...patch })]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
}

export async function processCommerceOlistQueue(tenantId?: string, limit = 2) {
  if (process.env.COMMERCE_ENABLED !== "true") return 0;
  const jobs = (await getPool().query(`select j.tenant_id,j.order_id from commerce_olist_orders j
    join commerce_olist_settings c on c.tenant_id=j.tenant_id and c.settings->>'enabled'='true'
    join commerce_stores s on s.tenant_id=j.tenant_id and s.enabled
    join tenants t on t.id=j.tenant_id and t.status='active'
    where ($1::uuid is null or j.tenant_id=$1) and ((j.status='pending' and j.next_attempt_at<=now()) or (j.status='processing' and j.updated_at<now()-interval '2 minutes'))
    order by j.next_attempt_at limit $2`, [tenantId ?? null, Math.max(1, Math.min(5, limit))])).rows;
  for (const job of jobs) await processCommerceOlistOrder(job.tenant_id, job.order_id);
  return jobs.length;
}
