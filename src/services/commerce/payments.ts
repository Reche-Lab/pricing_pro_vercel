import { createHmac, timingSafeEqual } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { decryptTenantSecret, encryptTenantSecret } from "@/lib/crypto/secrets";
import { CommerceError, validatePayment } from "@/domain/commerce/commerce";
import {
  commerceTransaction,
  type CommerceOrder,
  type CommerceStore,
} from "@/repositories/commerce";

type Credentials = {
  accessToken: string;
  webhookSecret: string;
  sellerId: string;
};
export async function paymentCredentials(
  tenantId: string,
): Promise<Credentials> {
  const row = (
    await getPool().query(
      "select encrypted_credentials from commerce_payment_connections where tenant_id=$1",
      [tenantId],
    )
  ).rows[0];
  if (!row?.encrypted_credentials)
    throw new CommerceError("O pagamento online não está configurado.", 409);
  return decryptTenantSecret<Credentials>(row.encrypted_credentials);
}
async function mpRequest(path: string, accessToken: string, body?: unknown) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  console.info("Commerce payment provider response.", {
    provider: "mercado_pago",
    operation: body ? "checkout.create" : "lookup",
    status: response.status,
  });
  if (!response.ok || !data)
    throw new CommerceError(
      "O Mercado Pago não concluiu a operação. Confira a conexão ou tente novamente.",
      502,
    );
  return data;
}
export async function savePaymentConnection(
  tenantId: string,
  userId: string,
  input: {
    manualEnabled: boolean;
    manualInstructions: string;
    mpEnabled: boolean;
    accessToken?: string;
    webhookSecret?: string;
  },
) {
  let credentials: Credentials | undefined;
  if (input.accessToken || input.webhookSecret) {
    let old: Credentials | undefined;
    try {
      old = await paymentCredentials(tenantId);
    } catch {
      /* First connection. */
    }
    const accessToken = input.accessToken || old?.accessToken;
    const webhookSecret = input.webhookSecret || old?.webhookSecret;
    if (!accessToken || !webhookSecret)
      throw new CommerceError(
        "Informe o access token do vendedor e a chave de assinatura dos webhooks.",
      );
    const seller = await mpRequest("/users/me", accessToken);
    if (!seller.id)
      throw new CommerceError("Não foi possível validar a conta do vendedor.");
    credentials = { accessToken, webhookSecret, sellerId: String(seller.id) };
  }
  if (input.mpEnabled && !credentials) await paymentCredentials(tenantId);
  if (input.manualEnabled && !input.manualInstructions.trim())
    throw new CommerceError(
      "Informe como o comprador deverá realizar o pagamento manual.",
    );
  await commerceTransaction(async (client) => {
    await client.query(
      `insert into commerce_payment_connections(tenant_id,manual_enabled,manual_instructions,mp_enabled,encrypted_credentials) values($1,$2,$3,$4,$5) on conflict(tenant_id) do update set manual_enabled=$2,manual_instructions=$3,mp_enabled=$4,encrypted_credentials=coalesce($5,commerce_payment_connections.encrypted_credentials),updated_at=now()`,
      [
        tenantId,
        input.manualEnabled,
        input.manualInstructions,
        input.mpEnabled,
        credentials ? encryptTenantSecret(credentials) : null,
      ],
    );
    await client.query(
      `insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,'commerce.payments.configure','commerce_store',$1,$3)`,
      [
        tenantId,
        userId,
        JSON.stringify({
          manualEnabled: input.manualEnabled,
          mpEnabled: input.mpEnabled,
        }),
      ],
    );
  });
}
export async function checkoutPayment(
  store: CommerceStore,
  customerId: string,
  orderId: string,
) {
  const credentials = await paymentCredentials(store.tenant_id);
  const base = process.env.APP_URL?.replace(/\/$/, "");
  if (!base || !base.startsWith("https://"))
    throw new CommerceError("O pagamento online exige APP_URL com HTTPS.", 409);
  return commerceTransaction(async (client) => {
    const order = (
      await client.query<CommerceOrder>(
        "select * from commerce_orders where tenant_id=$1 and customer_id=$2 and id=$3 for update",
        [store.tenant_id, customerId, orderId],
      )
    ).rows[0];
    if (!order || order.provider !== "mercado_pago")
      throw new CommerceError("Pedido não encontrado.", 404);
    if (order.payment_status !== "pending")
      throw new CommerceError(
        "Este pedido já teve seu pagamento processado.",
        409,
      );
    if (order.checkout_url) return { url: order.checkout_url };
    const account = (
      await client.query(
        "select mp_enabled from commerce_payment_connections where tenant_id=$1",
        [store.tenant_id],
      )
    ).rows[0];
    if (!account?.mp_enabled)
      throw new CommerceError(
        "O pagamento online está temporariamente indisponível.",
        409,
      );
    const back = `${base}/loja/${store.slug}/pedidos/${order.id}`;
    const preference = await mpRequest(
      "/checkout/preferences",
      credentials.accessToken,
      {
        items: [
          {
            id: order.id,
            title: `Pedido ${store.settings.name} - ${order.id.slice(0, 8)}`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: order.total_cents / 100,
          },
        ],
        external_reference: order.id,
        payer: { email: order.snapshot.customer.email },
        back_urls: { success: back, pending: back, failure: back },
        auto_return: "approved",
        notification_url: `${base}/api/store/${store.slug}/payment-webhook?source_news=webhooks`,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 24 * 3600000).toISOString(),
      },
    );
    const url = new URL(preference.init_point);
    if (
      url.protocol !== "https:" ||
      !(
        url.hostname === "www.mercadopago.com.br" ||
        url.hostname.endsWith(".mercadopago.com.br")
      )
    )
      throw new CommerceError("URL de pagamento inválida.", 502);
    await client.query(
      "update commerce_orders set checkout_url=$3,provider_preference_id=$4,snapshot=jsonb_set(snapshot,'{paymentSellerId}',to_jsonb($5::text)),updated_at=now() where tenant_id=$1 and id=$2",
      [
        store.tenant_id,
        order.id,
        url.toString(),
        String(preference.id),
        credentials.sellerId,
      ],
    );
    await client.query(
      "insert into commerce_order_events(tenant_id,order_id,type) values($1,$2,'payment.checkout_created')",
      [store.tenant_id, order.id],
    );
    return { url: url.toString() };
  });
}
export function verifyMpWebhook(headers: Headers, id: string, secret: string) {
  const parts = new Map(
    (headers.get("x-signature") ?? "")
      .split(",")
      .map((part) => part.trim().split("=")) as [string, string][],
  );
  const timestamp = parts.get("ts") ?? "";
  const signature = parts.get("v1") ?? "";
  const requestId = headers.get("x-request-id");
  if (
    !/^\d+$/.test(timestamp) ||
    !/^\d+$/.test(id) ||
    !requestId ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`id:${id};request-id:${requestId};ts:${timestamp};`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export async function reconcileCommercePayment(
  tenantId: string,
  paymentId: string,
) {
  const credentials = await paymentCredentials(tenantId);
  const payment = await mpRequest(
    `/v1/payments/${encodeURIComponent(paymentId)}`,
    credentials.accessToken,
  );
  if (
    typeof payment.external_reference !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(payment.external_reference)
  )
    return;
  await commerceTransaction(async (client) => {
    const row = (
      await client.query<CommerceOrder & { seller_id: string }>(
        "select *,snapshot->>'paymentSellerId' as seller_id from commerce_orders where tenant_id=$1 and id=$2 and provider='mercado_pago' for update",
        [tenantId, payment.external_reference],
      )
    ).rows[0];
    if (!row) return;
    const status = validatePayment(
      { ...row, sellerId: row.seller_id },
      payment,
    );
    if (
      row.provider_payment_id &&
      row.provider_payment_id !== String(payment.id)
    ) {
      console.error("Commerce duplicate payment requires review.", {
        tenantId,
        orderId: row.id,
      });
      throw new CommerceError(
        "Há outro pagamento vinculado a este pedido. Revisão necessária.",
        409,
      );
    }
    if (
      status === row.payment_status ||
      (status === "pending" && row.payment_status !== "pending")
    )
      return;
    if (row.payment_status === "refunded") return;
    await client.query(
      "update commerce_orders set payment_status=$3,provider_payment_id=$4,updated_at=now() where tenant_id=$1 and id=$2",
      [tenantId, row.id, status, String(payment.id)],
    );
    await client.query(
      "insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,$3,$4)",
      [
        tenantId,
        row.id,
        `payment.${status}`,
        JSON.stringify({
          paymentId: String(payment.id),
          status: payment.status,
        }),
      ],
    );
  });
}
