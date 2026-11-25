import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { commerceStoreUrl } from "@/domain/commerce/domains";
import { sendStoreEmail } from "@/services/email/store-email";
import { renderTransactionalEmail, type EmailOrderSummary } from "@/services/email/email-layout";
import { formatDeliveryDate } from "@/domain/shipping/production-lead-time";

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
  logo_url?: string | null; accent?: string | null; contact_email?: string | null; contact_phone?: string | null;
  pickup_address?: string | null; created_at?: string; subtotal_cents?: number; shipping_cents?: number; total_cents?: number;
  order_items?: unknown; delivery_address?: unknown; production?: unknown; artwork_discount_cents?: number | null;
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
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const receiptSchema = z.object({
  subtotal_cents: cents, shipping_cents: cents, total_cents: cents,
  order_items: z.array(z.object({
    name: z.string().max(300), quantity: z.number().int().positive(), unitCents: cents, totalCents: cents,
    artworkDiscountCents: cents.optional().default(0), artworkName: z.string().max(200).nullish(),
  })).min(1).max(40),
});
const productionSnapshotSchema = z.object({
  productionDays: z.number().int().nonnegative(), transportDays: z.number().int().nonnegative().nullable(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }).nullable(),
});
const deliveryAddressSchema = z.object({
  name: z.string(), street: z.string(), number: z.string(), complement: z.string().optional(),
  district: z.string(), city: z.string(), state: z.string(), postalCode: z.string(), attention: z.string().optional(),
});
function orderSummary(state: DeliveryState, code: string): EmailOrderSummary | undefined {
  const parsed = receiptSchema.safeParse(state);
  if (!parsed.success || parsed.data.subtotal_cents + parsed.data.shipping_cents !== parsed.data.total_cents) return;
  const lineBenefit = parsed.data.order_items.reduce((sum, item) => sum + item.artworkDiscountCents, 0);
  const benefit = cents.safeParse(state.artwork_discount_cents ?? lineBenefit);
  if (!benefit.success || benefit.data !== lineBenefit || parsed.data.order_items.reduce((sum, item) => sum + item.totalCents, 0) !== parsed.data.subtotal_cents) return;
  const date = state.created_at ? new Date(state.created_at) : null;
  return { code, date: date && Number.isFinite(date.getTime()) ? date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : undefined,
    // Line totals before the artwork benefit match the products subtotal below.
    items: parsed.data.order_items.map(item => ({ ...item, totalCents: item.totalCents + item.artworkDiscountCents, artworkName: item.artworkName ?? undefined })),
    subtotalCents: parsed.data.subtotal_cents, shippingCents: parsed.data.shipping_cents, totalCents: parsed.data.total_cents,
    artworkDiscountCents: benefit.data };
}
function deliverySections(state: DeliveryState, includeTiming: boolean) {
  const timing = productionSnapshotSchema.safeParse(state.production);
  const businessDays = (days: number) => days === 1 ? "1 dia útil" : `${days} dias úteis`;
  const deadlines = includeTiming && timing.success ? [{ title: "Prazos informados na compra", lines: [
    `Produção: ${businessDays(timing.data.productionDays)}`,
    ...(state.delivery !== "pickup" ? [`Transporte: ${timing.data.transportDays === null ? "a confirmar" : businessDays(timing.data.transportDays)}`] : []),
    ...(timing.data.deliveryDate ? [`Previsão registrada na compra: ${formatDeliveryDate(timing.data.deliveryDate)}`] : []),
    "A previsão depende da confirmação do pagamento, da aprovação das artes e do transporte. Confira o andamento atualizado no seu pedido.",
  ] }] : [];
  if (state.delivery === "pickup") return [{
    title: "Retirada na loja", lines: [state.pickup_address || "Combine o local e o horário com a loja pelo seu pedido."],
  }, ...deadlines];
  const address = deliveryAddressSchema.safeParse(state.delivery_address);
  return [{ title: "Entrega do pedido", lines: [
    state.service_name || "Entrega conforme escolhida na compra",
    ...(address.success ? [
      address.data.name,
      `${address.data.street}, ${address.data.number}${address.data.complement ? ` · ${address.data.complement}` : ""}`,
      `${address.data.district} · ${address.data.city}/${address.data.state}`, `CEP ${address.data.postalCode}`,
      ...(address.data.attention ? [`Aos cuidados de: ${address.data.attention}`] : []),
    ] : []),
  ] }, ...deadlines];
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
    s.settings->>'logoUrl' as logo_url,s.settings->>'accent' as accent,s.settings->>'contactEmail' as contact_email,
    s.settings->>'contactPhone' as contact_phone,s.settings->>'pickupAddress' as pickup_address,
    o.created_at::text,o.subtotal_cents,o.shipping_cents,o.total_cents,o.snapshot->'items' as order_items,
    o.snapshot->'address' as delivery_address,o.snapshot->'production' as production,o.snapshot->'artworkDiscountCents' as artwork_discount_cents,
    c.name as customer_name,c.email::text as customer_email,
    sh.status as shipment_status,coalesce(sh.service_name,o.snapshot->'shippingOption'->>'name') as service_name,sh.tracking_code,sh.tracking_url,
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
  let orderUrl: string, storeUrl: string;
  try {
    const base = commerceStoreUrl(state.slug);
    storeUrl = base;
    orderUrl = `${base}/pedidos/${encodeURIComponent(job.order_id)}`;
    if (!httpsUrl(orderUrl)) throw new Error("Unsafe store URL");
  } catch {
    await settle(job, job.attempts >= MAX_ATTEMPTS ? "failed" : "pending", "store_url_unavailable"); return;
  }
  const [title, body] = job.event_type === "fulfillment.completed" && state.delivery !== "pickup"
    ? ["Pedido entregue", "A entrega do seu pedido foi concluída. Obrigado por comprar conosco!"]
    : job.event_type === "fulfillment.shipped" && state.delivery === "pickup"
      ? ["Retirada confirmada", "A retirada do seu pedido foi registrada pela loja. Obrigado por comprar conosco!"]
      : copy[job.event_type];
  const shipping = state.delivery !== "pickup" && (job.event_type.startsWith("shipping.") || ["fulfillment.shipped", "fulfillment.completed"].includes(job.event_type));
  const tracking = shipping ? trackingDetails(job, state) : [];
  const store = state.store_name || "Sua loja";
  const orderCode = job.order_id.slice(0, 8).toUpperCase();
  const greeting = `Olá, ${state.customer_name}.`;
  const actionLabel = job.event_type === "artwork.publish" ? "Revisar e aprovar arte" : "Acompanhar pedido";
  const summary = orderSummary(state, orderCode);
  const content = renderTransactionalEmail({
    brand: { name: store, url: storeUrl, logoUrl: state.logo_url, accent: state.accent, contactEmail: state.contact_email, contactPhone: state.contact_phone },
    title, preheader: `Pedido #${orderCode} · ${body}`, eyebrow: `Pedido #${orderCode} · Atualização da compra`, greeting, paragraphs: [body],
    facts: [...(summary ? [] : [{ label: "Pedido", value: `#${orderCode}` }]), { label: "Pagamento", value: state.payment_status === "paid" ? "Confirmado" : state.payment_status === "refunded" ? "Estornado" : "Aguardando confirmação" }],
    summary, sections: deliverySections(state, !["fulfillment.completed", "shipping.delivered", "payment.refunded"].includes(job.event_type)), tracking,
    action: { label: actionLabel, url: orderUrl },
    notice: job.event_type === "payment.paid" ? "Se houver artes para aprovação, revise-as na sua conta para liberar a produção. Acompanhe as próximas etapas pelo pedido." : job.event_type === "artwork.publish" ? "Confira o enquadramento e os detalhes da arte antes de aprovar. A aprovação libera a preparação para produção." : undefined,
    footerNote: "Você recebeu esta mensagem por uma atualização do seu pedido. Para conferir os dados ou falar com a loja, acesse sua conta pelo site oficial.",
  });
  // Message-ID allows correlation across transports, not provider idempotency.
  const input = {
    to: email.data,
    messageId: `<commerce-order-${job.id}@commerce-notifications.invalid>`,
    subject: `${title} - Pedido #${orderCode} - ${store}`.replace(/[\r\n]/g, " "),
    ...content,
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
