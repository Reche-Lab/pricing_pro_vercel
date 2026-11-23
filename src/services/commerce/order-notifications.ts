import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { commerceStoreUrl } from "@/domain/commerce/domains";
import { sendStoreEmail } from "@/services/email/store-email";

const MAX_ATTEMPTS = 5;
type Notification = {
  id: string; tenant_id: string; order_id: string; event_type: string; event_key: string;
  claim_token: string; attempts: number;
};
type DeliveryState = {
  payment_environment: string; payment_status: string; fulfillment_status: string;
  cancelled_at: unknown; deleted_at: unknown; store_enabled: boolean; tenant_status: string;
  slug: string; store_name: string | null; customer_name: string; customer_email: string;
  shipment_status: string | null; service_name: string | null; tracking_code: string | null;
  tracking_url: string | null; proof_ready: boolean; delivery: string | null;
  tracking_parcels: Array<{ code: string | null; url: string | null }>;
};
const copy: Record<string, [string, string]> = {
  "order.created": ["Pedido recebido", "Recebemos seu pedido. Acompanhe os detalhes e as próximas etapas na sua conta."],
  "payment.paid": ["Pagamento confirmado", "O pagamento do seu pedido foi confirmado. Obrigado pela compra!"],
  "payment.refunded": ["Pagamento estornado", "O estorno do seu pedido foi registrado. O prazo para o valor aparecer depende do meio de pagamento e da sua instituição financeira."],
  "fulfillment.production": ["Pedido em produção", "Seu pedido entrou em produção. Avisaremos quando houver novidades."],
  "fulfillment.shipped": ["Pedido enviado", "Seu pedido foi enviado. Acompanhe a entrega pelos detalhes abaixo ou pela sua conta."],
  "shipping.posted": ["Pedido enviado", "Seu pedido foi postado. Acompanhe a entrega pelos detalhes abaixo ou pela sua conta."],
  "fulfillment.completed": ["Pedido concluído", "Seu pedido foi retirado na loja. Obrigado por comprar conosco!"],
  "shipping.delivered": ["Pedido entregue", "A transportadora informou que seu pedido foi entregue. Obrigado por comprar conosco!"],
  "artwork.publish": ["Arte pronta para aprovação", "Uma prova da sua arte está disponível. Acesse seu pedido para revisar e aprovar antes da produção."],
  "shipping.exception": ["Atualização sobre a entrega", "A transportadora informou uma ocorrência na entrega. Confira o rastreamento ou entre em contato com a loja pelo seu pedido."],
  "shipping.tracking_available": ["Rastreamento disponível", "O rastreamento do seu pedido está disponível. Consulte os detalhes abaixo ou acesse seu pedido."],
};

function httpsUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
function trackingDetails(job: Notification, state: DeliveryState) {
  const entries = [{ code: state.tracking_code, url: state.tracking_url }, ...(state.tracking_parcels ?? [])];
  const unique = new Map<string, { code: string | null; url: string | null }>();
  for (const entry of entries) {
    const code = entry.code?.trim().toUpperCase();
    const url = httpsUrl(entry.url);
    if (!code && !url) continue;
    if (job.event_type === "shipping.tracking_available"
      && (!code || job.event_key !== `shipping.tracking_available:${createHash("md5").update(code).digest("hex")}`)) continue;
    const key = code || url!;
    const previous = unique.get(key);
    unique.set(key, { code: previous?.code || entry.code, url: url || previous?.url || null });
  }
  return [...unique.values()];
}
function skipReason(job: Notification, state: DeliveryState | undefined) {
  if (!state || !state.store_enabled || state.tenant_status !== "active") return "store_unavailable";
  if (state.payment_environment !== "production" || state.cancelled_at || state.deleted_at) return "order_ineligible";
  if (!Object.hasOwn(copy, job.event_type)) return "unsupported_event";
  if (job.event_type === "payment.refunded") return state.payment_status === "refunded" ? null : "superseded";
  if (state.payment_status === "refunded") return "superseded";
  if (job.event_type === "payment.paid" && state.payment_status !== "paid") return "superseded";
  if (job.event_type === "artwork.publish" && !state.proof_ready) return "superseded";
  if (job.event_type === "fulfillment.production" && state.fulfillment_status !== "production") return "superseded";
  if (["fulfillment.shipped", "shipping.posted"].includes(job.event_type)) {
    if (state.fulfillment_status === "completed" || state.shipment_status === "delivered") return "superseded";
    if (state.fulfillment_status !== "shipped" && !["posted", "in_transit", "exception"].includes(state.shipment_status ?? "")) return "superseded";
  }
  if (["fulfillment.completed", "shipping.delivered"].includes(job.event_type)
    && state.fulfillment_status !== "completed" && state.shipment_status !== "delivered") return "superseded";
  if (job.event_type === "shipping.exception" && state.shipment_status !== "exception") return "superseded";
  if (job.event_type === "shipping.tracking_available"
    && (!trackingDetails(job, state).length || state.shipment_status === "delivered" || state.fulfillment_status === "completed")) return "superseded";
  return null;
}

async function deliveryState(job: Notification) {
  return (await getPool().query<DeliveryState>(`select o.payment_environment,o.payment_status,o.fulfillment_status,o.cancelled_at,o.deleted_at,o.snapshot->>'delivery' as delivery,
    s.enabled as store_enabled,s.settings->>'name' as store_name,t.status as tenant_status,t.slug,
    c.name as customer_name,c.email::text as customer_email,
    sh.status as shipment_status,sh.service_name,sh.tracking_code,sh.tracking_url,
    coalesce((select jsonb_agg(jsonb_build_object('code',sp.tracking_code,'url',sp.tracking_url) order by sp.parcel_index)
      from commerce_order_shipment_parcels sp where sp.tenant_id=o.tenant_id and sp.shipment_id=sh.id),'[]'::jsonb) as tracking_parcels,
    exists(select 1 from commerce_artwork_proofs p
      join commerce_order_events e on e.id=n.source_event_id and e.tenant_id=p.tenant_id and e.order_id=p.order_id
      where p.tenant_id=o.tenant_id and p.order_id=o.id and p.line_id::text=lower(e.metadata->>'lineId')
        and p.revision::text=e.metadata->>'revision' and p.published_at is not null
        and p.prepared_path is not null and p.approved_at is null) as proof_ready
    from commerce_order_notifications n
    join commerce_orders o on o.tenant_id=n.tenant_id and o.id=n.order_id
    join commerce_stores s on s.tenant_id=o.tenant_id
    join tenants t on t.id=o.tenant_id
    join commerce_customers c on c.tenant_id=o.tenant_id and c.id=o.customer_id
    left join commerce_order_shipments sh on sh.tenant_id=o.tenant_id and sh.order_id=o.id
    where n.tenant_id=$1 and n.id=$2 and n.claim_token=$3 and n.status='sending'`,
  [job.tenant_id, job.id, job.claim_token])).rows[0];
}

async function settle(job: Notification, status: "sent" | "skipped" | "failed" | "pending", code: string | null) {
  // Token fencing prevents a late worker from acknowledging another worker's claim.
  await getPool().query(`update commerce_order_notifications set status=$4,last_error_code=$5,
    sent_at=case when $4='sent' then now() else null end,
    next_attempt_at=case when $4='pending' then now()+make_interval(secs => least(3600,60*power(2,attempts-1))::integer) else next_attempt_at end,
    claim_token=null,claim_expires_at=null,updated_at=now()
    where tenant_id=$1 and id=$2 and claim_token=$3 and status='sending'`,
  [job.tenant_id, job.id, job.claim_token, status, code]);
}

async function deliver(job: Notification) {
  const state = await deliveryState(job);
  const reason = skipReason(job, state);
  if (reason || !state) { await settle(job, "skipped", reason ?? "order_ineligible"); return; }
  const email = z.string().email().max(254).safeParse(state.customer_email?.trim());
  if (!email.success) { await settle(job, "failed", "invalid_recipient"); return; }
  let orderUrl: string;
  try {
    const base = commerceStoreUrl(state.slug);
    orderUrl = `${base}/pedidos/${encodeURIComponent(job.order_id)}`;
    if (!httpsUrl(orderUrl)) throw new Error("Unsafe store URL");
  } catch {
    await settle(job, job.attempts >= MAX_ATTEMPTS ? "failed" : "pending", "store_url_unavailable"); return;
  }
  const [title, body] = job.event_type === "fulfillment.completed" && state.delivery !== "pickup"
    ? ["Pedido entregue", "A entrega do seu pedido foi concluída. Obrigado por comprar conosco!"]
    : job.event_type === "fulfillment.shipped" && state.delivery === "pickup"
      ? ["Pedido pronto para retirada", "Seu pedido está pronto para retirada na loja. Acesse os detalhes para combinar o recebimento."]
      : copy[job.event_type];
  const shipping = state.delivery !== "pickup" && (job.event_type.startsWith("shipping.") || ["fulfillment.shipped", "fulfillment.completed"].includes(job.event_type));
  const tracking = shipping ? trackingDetails(job, state) : [];
  const details = shipping ? [state.service_name && `Entrega: ${state.service_name}`,
    ...tracking.map(entry => entry.code && `Código de rastreio: ${entry.code}`)].filter((value): value is string => Boolean(value)) : [];
  const links = tracking.map(entry => entry.url).filter((url): url is string => Boolean(url));
  const store = state.store_name || "Sua loja";
  const orderCode = job.order_id.slice(0, 8).toUpperCase();
  const greeting = `Olá, ${state.customer_name}.`;
  // The tenant SMTP spreads this extra Nodemailer option. The platform fallback
  // currently drops it. Message-ID is correlation, not provider idempotency.
  const input = {
    to: email.data,
    messageId: `<commerce-order-${job.id}@commerce-notifications.invalid>`,
    subject: `${title} - Pedido #${orderCode} - ${store}`.replace(/[\r\n]/g, " "),
    text: [greeting, "", `Pedido #${orderCode}`, body, ...details, ...links.map(url => `Rastrear entrega: ${url}`), `Acompanhar pedido: ${orderUrl}`, "", store].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#18181b"><h1 style="font-size:20px">${escapeHtml(title)}</h1><p><strong>Pedido #${escapeHtml(orderCode)}</strong></p><p>${escapeHtml(greeting)}</p><p>${escapeHtml(body)}</p>${details.map(detail => `<p>${escapeHtml(detail)}</p>`).join("")}${links.map(url => `<p><a href="${escapeHtml(url)}">Rastrear entrega</a></p>`).join("")}<p><a style="display:inline-block;padding:12px 18px;background:#047857;color:#fff;border-radius:6px;text-decoration:none" href="${escapeHtml(orderUrl)}">Acompanhar pedido</a></p><p>${escapeHtml(store)}</p></div>`,
  };
  const lease = await getPool().query(`update commerce_order_notifications set claim_expires_at=now()+interval '2 minutes',updated_at=now()
    where tenant_id=$1 and id=$2 and claim_token=$3 and status='sending' and claim_expires_at>now() returning id`,
  [job.tenant_id, job.id, job.claim_token]);
  if (!lease.rowCount) return;
  let accepted = false;
  try { accepted = (await sendStoreEmail(job.tenant_id, input)).sent; }
  catch { /* Transport/configuration errors are retried without persisting raw SMTP PII. */ }
  // A DB failure after SMTP acceptance deliberately leaves the lease recoverable.
  // Re-delivery after that crash window is possible; this is not exactly-once SMTP.
  await settle(job, accepted ? "sent" : job.attempts >= MAX_ATTEMPTS ? "failed" : "pending", accepted ? null : "smtp_unavailable");
}

/** Returns the number of claimed rows, including suppressed and retried messages. */
export async function processCommerceOrderNotifications(tenantId?: string, limit = 5, orderId?: string) {
  if (process.env.COMMERCE_ENABLED !== "true") return 0;
  if (orderId && !tenantId) throw new Error("Order notification scope requires tenantId");
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(10, Math.trunc(limit))) : 5;
  const pool = getPool();
  // A crash on the last attempt must not leave an unreclaimable sending row.
  await pool.query(`update commerce_order_notifications set status='failed',claim_token=null,claim_expires_at=null,
    last_error_code='attempts_exhausted',updated_at=now()
    where ($1::uuid is null or tenant_id=$1) and ($2::uuid is null or order_id=$2) and attempts>=$3
      and (status='pending' or (status='sending' and claim_expires_at<=now()))`, [tenantId ?? null, orderId ?? null, MAX_ATTEMPTS]);
  const started = Date.now();
  let processed = 0;
  while (processed < boundedLimit && Date.now() - started < 45000) {
    // One claim at a time avoids expiring a whole batch while SMTP is slow.
    // This single statement commits the lease before any external I/O.
    const job = (await pool.query<Notification>(`with candidate as (
      select id from commerce_order_notifications
      where ($1::uuid is null or tenant_id=$1) and ($2::uuid is null or order_id=$2) and attempts<$4
        and ((status='pending' and next_attempt_at<=now()) or (status='sending' and claim_expires_at<=now()))
      order by next_attempt_at,created_at,id limit 1 for update skip locked
    ) update commerce_order_notifications n set status='sending',claim_token=$3,claim_expires_at=now()+interval '2 minutes',
      attempts=n.attempts+1,last_error_code=null,updated_at=now() from candidate c where n.id=c.id returning n.*`,
    [tenantId ?? null, orderId ?? null, randomUUID(), MAX_ATTEMPTS])).rows[0];
    if (!job) break;
    processed++;
    await deliver(job);
  }
  return processed;
}
