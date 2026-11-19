import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { CommerceOrder } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { paymentEnvironment } from "@/domain/commerce/payment-settings";
import { validateProviderOrder } from "@/domain/commerce/transparent-payment";
import { paymentCredentials } from "./payments";

const blocked = () => new CommerceError("Há um pagamento em processamento ou ainda sem confirmação de cancelamento. Atualize a situação ou fale com a loja antes de alterar os itens. Seu carrinho foi preservado.", 409);

// The caller holds the order lock, preventing a new payment reservation/link.
export async function revokePendingPayment(client: Pick<PoolClient, "query">, order: CommerceOrder & { provider_preference_id?: string | null }) {
  if (order.provider !== "mercado_pago") return;
  const attempts = (await client.query<{ id: string; seller_id: string; method: "pix" | "card"; status: string; provider_order_id: string | null }>(
    "select id,seller_id,method,status,provider_order_id from commerce_payment_attempts where tenant_id=$1 and order_id=$2 order by created_at for update", [order.tenant_id, order.id])).rows;
  if (attempts.some(attempt => ["submitting", "unknown"].includes(attempt.status) && !attempt.provider_order_id)) throw blocked();
  if (attempts.some(attempt => ["paid", "refunded"].includes(attempt.status))) throw blocked();
  if (!order.checkout_url && !attempts.some(attempt => attempt.provider_order_id && attempt.status !== "failed")) return;
  const environment = paymentEnvironment(order.payment_environment);
  const credentials = await paymentCredentials(order.tenant_id, environment);
  async function request(path: string, method = "GET", payload?: unknown) {
    const started = Date.now();
    const response = await fetch(`https://api.mercadopago.com${path}`, {
      method, headers: { authorization: `Bearer ${credentials.accessToken}`, "content-type": "application/json",
        ...(method === "POST" ? { "X-Idempotency-Key": createHash("sha256").update(`cancel:${order.tenant_id}:${order.id}:${path}`).digest("hex") } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}), cache: "no-store", signal: AbortSignal.timeout(8000),
    }).catch(() => {
      console.error("Commerce pending payment cancellation unconfirmed.", { tenantId: order.tenant_id, orderId: order.id, method, path });
      throw blocked();
    });
    console.info("Commerce pending payment revocation.", { tenantId: order.tenant_id, orderId: order.id, method, path, httpStatus: response.status, durationMs: Date.now() - started });
    if (!response.ok) throw blocked();
    return response.json().catch(() => { throw blocked(); });
  }
  for (const attempt of attempts) {
    if (!attempt.provider_order_id || attempt.status === "failed") continue;
    const id = attempt.provider_order_id;
    if (!/^ORD[A-Z0-9]{10,60}$/i.test(id)) throw blocked();
    const path = `/v1/orders/${encodeURIComponent(id)}`;
    let data = await request(path);
    const expected = { id: attempt.id, sellerId: attempt.seller_id, totalCents: order.total_cents, method: attempt.method, environment };
    let verified = validateProviderOrder(data, expected);
    if (["paid", "refunded"].includes(verified.status)) throw blocked();
    if (verified.status !== "failed") {
      if (!["created", "action_required"].includes(data.status)) throw blocked();
      await request(`${path}/cancel`, "POST");
      data = await request(path);
      verified = validateProviderOrder(data, expected);
    }
    if (verified.status !== "failed") throw blocked();
    await client.query("update commerce_payment_attempts set status='failed',result=$3,updated_at=now() where tenant_id=$1 and id=$2", [order.tenant_id, attempt.id, JSON.stringify({ message: "Pagamento encerrado a pedido do comprador.", providerStatus: data.status })]);
  }
  if (order.checkout_url) {
    if (!order.provider_preference_id || !/^[A-Za-z0-9_-]{1,150}$/.test(order.provider_preference_id)) throw blocked();
    const path = `/checkout/preferences/${encodeURIComponent(order.provider_preference_id)}`;
    const preference = await request(path);
    if (String(preference.collector_id) !== credentials.sellerId || preference.external_reference !== order.id) throw blocked();
    // Expiring the preference prevents new attempts; an existing payment may
    // still settle, so authoritative payment search is required afterwards.
    await request(path, "PUT", { expires: true, expiration_date_from: new Date(Date.now() - 172800000).toISOString(), expiration_date_to: new Date(Date.now() - 1000).toISOString() });
    const confirmed = await request(path);
    if (!confirmed.expires || !(Date.parse(confirmed.expiration_date_to) < Date.now())) throw blocked();
    const search = new URLSearchParams({ external_reference: order.id, limit: "50", offset: "0" });
    const payments = await request(`/v1/payments/search?${search}`);
    if (!Array.isArray(payments.results) || !Number.isInteger(payments.paging?.total) || payments.paging.total !== payments.results.length ||
      payments.results.some((payment: { status: string; collector_id: string; external_reference: string }) => payment.external_reference !== order.id || String(payment.collector_id) !== credentials.sellerId || !["cancelled", "rejected"].includes(payment.status))) throw blocked();
  }
}
