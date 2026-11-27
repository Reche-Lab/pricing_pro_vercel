import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import { encryptTenantSecret } from "@/lib/crypto/secrets";
import { CommerceError } from "@/domain/commerce/commerce";
import type { CommerceOlistJob } from "@/domain/commerce/olist";
import { commerceTransaction, type CommerceOrder } from "@/repositories/commerce";
import { commerceOlistRequest } from "./olist-client";
import { acquireCommerceOlistLease } from "./olist-lease";
import { readCommerceOlistEmailReview, readCommerceOlistEmailSnapshot, sameOlistEmail } from "./olist-email";
import { buildOlistContactEmailUpdate, OlistContactUpdateValidationError } from "./olist-contact-update";
import { OlistRequestError } from "@/services/olist/olist";
import { consentForOlistEmail } from "./olist-email-consent";

function providerMessage(value: string) {
  return value.replace(/(https?:\/\/)[^\s/@]+@/gi, "$1[credentials]@")
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+/gi, "[email]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[document]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[document]").slice(0, 600);
}

function validate(order: CommerceOrder | undefined, job: CommerceOlistJob | null | undefined) {
  if (!order || order.deleted_at || order.cancelled_at || order.payment_status !== "paid" || order.payment_environment !== "production")
    throw new CommerceError("A correção de e-mail exige um pedido ativo e pago de produção.", 409);
  if (!job?.customer_id || !job.sales_order_id || !["blocked", "review"].includes(job.status) || job.attempt_stage || job.authorization_requested_at || [6, 7].includes(job.invoice_status ?? 0))
    throw new CommerceError("A etapa fiscal mudou ou possui uma operação pendente de conferência. Atualize o painel antes de corrigir o e-mail.", 409);
  if (!order.snapshot.billing?.email || ![11, 14].includes(order.snapshot.billing.document.replace(/\D/g, "").length))
    throw new CommerceError("Confira o CPF/CNPJ e o e-mail de faturamento desta compra.", 409);
  return { order, job };
}
async function context(tenantId: string, orderId: string) {
  const row = (await getPool().query<CommerceOrder & { job: CommerceOlistJob | null }>(`select o.*,to_jsonb(j) as job from commerce_orders o
    left join commerce_olist_orders j on j.tenant_id=o.tenant_id and j.order_id=o.id where o.tenant_id=$1 and o.id=$2 and o.deleted_at is null`, [tenantId, orderId])).rows[0];
  return validate(row, row?.job);
}
export async function commerceOlistEmailReview(tenantId: string, orderId: string) {
  const { order, job } = await context(tenantId, orderId), signal = AbortSignal.timeout(30000);
  return readCommerceOlistEmailReview(path => commerceOlistRequest(tenantId, path, "GET", undefined, signal), order, job);
}

export async function updateCommerceOlistEmail(tenantId: string, orderId: string, actorId: string, reviewToken: string, note: string, strategy: "purchase" | "olist" = "purchase") {
  const original = await context(tenantId, orderId), pool = getPool(), debugId = randomUUID();
  const document = original.order.snapshot.billing!.document.replace(/\D/g, "");
  const locks: string[] = [], keys = [`commerce-olist:${tenantId}:${orderId}`, `commerce-olist-customer:${tenantId}:${createHash("sha256").update(`${tenantId}:${document}`).digest("hex")}`];
  let phase = "acquire_locks";
  let lastRequest: { method: string; path: string } | undefined;
  const assertCurrent = async (client: PoolClient) => {
    const order = (await client.query<CommerceOrder>("select * from commerce_orders where tenant_id=$1 and id=$2 for update", [tenantId, orderId])).rows[0];
    const job = (await client.query<CommerceOlistJob>("select * from commerce_olist_orders where tenant_id=$1 and order_id=$2 for update", [tenantId, orderId])).rows[0];
    validate(order, job);
    if (job.customer_id !== original.job.customer_id || job.invoice_id !== original.job.invoice_id || order.total_cents !== original.order.total_cents || order.snapshot.billing?.document.replace(/\D/g, "") !== document || !sameOlistEmail(order.snapshot.billing?.email ?? "", original.order.snapshot.billing!.email))
      throw new CommerceError("Os dados do pedido mudaram. Confira os e-mails novamente.", 409);
    const settings = (await client.query("select settings from commerce_olist_settings where tenant_id=$1 for share", [tenantId])).rows[0]?.settings;
    if (!settings?.enabled || (await client.query("select lock_key from commerce_olist_leases where lock_key=any($1::text[]) and token=$2 and expires_at>now() for update", [keys, debugId])).rowCount !== 2)
      throw new CommerceError("A integração mudou ou a conferência expirou. Atualize o painel.", 409);
  };
  try {
    for (const key of keys) {
      if (!await acquireCommerceOlistLease(pool, key, debugId)) throw new CommerceError("Outro processo está conferindo este cliente ou pedido. Aguarde e tente novamente.", 409);
      locks.push(key);
    }
    const signal = AbortSignal.timeout(40000);
    const request = (path: string) => { lastRequest = { method: "GET", path }; return commerceOlistRequest(tenantId, path, "GET", undefined, signal); };
    phase = "review_current_emails";
    const { review: before, contact } = await readCommerceOlistEmailSnapshot(request, original.order, original.job);
    if (before.reviewToken !== reviewToken) throw new CommerceError("Os e-mails no Olist mudaram desde a conferência. Consulte novamente antes de confirmar.", 409);
    if (strategy === "olist") {
      if (!before.canUseOlistEmail) throw new CommerceError("O Olist não possui destinatários válidos para esta confirmação. Confira os e-mails do cadastro e da nota.", 409);
      phase = "approve_existing_recipients";
      const consent = consentForOlistEmail(original.order, before, actorId);
      await commerceTransaction(async client => {
        await assertCurrent(client);
        await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'olist.email_recipient_approved',$3)", [tenantId, orderId, JSON.stringify({ actor: actorId, debugId, note, customer_id: original.job.customer_id, invoice_id: original.job.invoice_id, consent_encrypted: encryptTenantSecret(consent) })]);
        await client.query("update commerce_olist_orders set status='pending',error_code=null,last_error=null,debug_id=$3,next_attempt_at=now(),updated_at=now() where tenant_id=$1 and order_id=$2", [tenantId, orderId, debugId]);
      });
      console.info("Commerce Olist existing email recipients approved.", { tenantId, orderId, debugId, customerId: before.customerId, invoiceId: before.invoiceId, recipientCount: before.olistRecipients.length, actorId });
      return { emailReview: before, resumed: true, recipientSource: "olist" as const };
    }
    phase = "prepare_contact_update";
    lastRequest = undefined;
    const payload = before.contactMatches ? null : buildOlistContactEmailUpdate(contact, before.targetEmail);
    phase = "record_update_intent";
    await commerceTransaction(async client => {
      await assertCurrent(client);
      await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'olist.email_update_requested',$3)", [tenantId, orderId, JSON.stringify({ actor: actorId, debugId, note, customer_id: original.job.customer_id, invoice_id: original.job.invoice_id, emails_encrypted: encryptTenantSecret({ previousEmail: before.contactEmail, previousNfeEmail: before.contactNfeEmail, invoiceEmail: before.invoiceEmail, targetEmail: before.targetEmail }) })]);
      await client.query("update commerce_olist_orders set status='blocked',error_code='olist_email_update_required',last_error='A atualização do e-mail está em conferência. Use Atualizar e-mail no Olist antes de retomar.',debug_id=$3,updated_at=now() where tenant_id=$1 and order_id=$2", [tenantId, orderId, debugId]);
    });
    if (payload) {
      phase = "update_contact_emails";
      lastRequest = { method: "PUT", path: `/contatos/${original.job.customer_id}` };
      console.info("Commerce Olist contact email update prepared.", { tenantId, orderId, debugId, ...lastRequest, customerId: before.customerId, preservedFields: Object.keys(payload).filter(field => field !== "email" && field !== "emailNfe") });
      await commerceOlistRequest(tenantId, `/contatos/${original.job.customer_id}`, "PUT", payload, signal);
    }
    phase = "verify_contact_and_invoice";
    const after = await readCommerceOlistEmailReview(request, original.order, original.job);
    const resumed = after.contactMatches && after.invoiceMatches;
    phase = "record_update_result";
    await commerceTransaction(async client => {
      await assertCurrent(client);
      await client.query(`update commerce_olist_orders set status=$3,error_code=$4,last_error=$5,debug_id=$6,next_attempt_at=now(),updated_at=now()
        where tenant_id=$1 and order_id=$2`, [tenantId, orderId, resumed ? "pending" : "blocked", resumed ? null : after.contactMatches ? "olist_invoice_email_required" : "olist_email_update_required", resumed ? null : after.contactMatches ? "O cadastro do cliente foi atualizado, mas a nota pendente ainda mantém outro e-mail. Corrija o destinatário da nota no Olist e consulte novamente; não geraremos outra nota." : "O Olist ainda não confirmou os e-mails atualizados. Consulte novamente antes de retomar.", debugId]);
      await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'olist.email_update_checked',$3)", [tenantId, orderId, JSON.stringify({ actor: actorId, debugId, note, customer_id: original.job.customer_id, invoice_id: original.job.invoice_id, contactConfirmed: after.contactMatches, invoiceConfirmed: after.invoiceMatches, resumed })]);
    });
    console.info("Commerce Olist email update checked.", { tenantId, orderId, debugId, customerId: original.job.customer_id, invoiceId: original.job.invoice_id, contactConfirmed: after.contactMatches, invoiceConfirmed: after.invoiceMatches, resumed });
    return { emailReview: after, resumed, recipientSource: "purchase" as const };
  } catch (error) {
    const details = error instanceof OlistRequestError && error.data && typeof error.data === "object" && "detalhes" in error.data && Array.isArray(error.data.detalhes) ? error.data.detalhes : [];
    const validationFields = error instanceof OlistContactUpdateValidationError ? error.validationFields : details.flatMap(item => item && typeof item === "object" && "campo" in item && typeof item.campo === "string" ? [item.campo.slice(0, 100)] : []);
    console.error("Commerce Olist email update failed.", { tenantId, orderId, debugId, phase, strategy, ...lastRequest, failureSource: error instanceof OlistRequestError ? "provider" : "local", status: error instanceof CommerceError || error instanceof OlistRequestError ? error.status : undefined, errorType: error instanceof Error ? error.name : "Unknown", message: error instanceof Error ? providerMessage(error.message) : undefined, errorCode: error instanceof CommerceError ? error.details?.code : error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code.slice(0, 80) : undefined, providerMessage: error instanceof OlistRequestError ? providerMessage(error.message) : undefined, validationFields, validationIssues: error instanceof OlistContactUpdateValidationError ? error.validationIssues : undefined });
    if (error instanceof OlistRequestError && error.status === 403) throw new CommerceError("O Olist não permitiu atualizar o contato. Confira a permissão de edição de Contatos da integração.", 409);
    if (error instanceof OlistRequestError && [400, 404, 409, 422].includes(error.status))
      throw new CommerceError(`O Olist recusou a correção de e-mail (HTTP ${error.status}).${validationFields.length ? ` Confira os campos: ${validationFields.join(", ")}.` : " Confira o cadastro e consulte novamente."} Referência: ${debugId}`, 409, { code: "olist_email_update_rejected" });
    if (!(error instanceof CommerceError) && !(error instanceof OlistRequestError && error.status === 401))
      throw new CommerceError(`Não foi possível confirmar a atualização no Olist. Consulte novamente os e-mails antes de repetir ou escolha manter os e-mails do Olist. Referência: ${debugId}`, 503, { code: "olist_email_update_failed" });
    throw error;
  } finally {
    if (locks.length) await pool.query("delete from commerce_olist_leases where lock_key=any($1::text[]) and token=$2", [locks, debugId]);
  }
}
