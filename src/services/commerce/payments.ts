import { createHmac, timingSafeEqual } from "node:crypto";
import { getPool } from "@/lib/db/client";
import { decryptTenantSecret, encryptTenantSecret } from "@/lib/crypto/secrets";
import { CommerceError, validatePayment } from "@/domain/commerce/commerce";
import { mercadoPagoPaymentMethods, paymentEnvironment, type PaymentEnvironment, type CommercePaymentSettings } from "@/domain/commerce/payment-settings";
import { commerceStoreUrl } from "@/domain/commerce/domains";
import {
  commerceTransaction,
  type CommerceOrder,
  type CommerceStore,
} from "@/repositories/commerce";

export type CommercePaymentCredentials = {
  accessToken: string;
  webhookSecret: string;
  sellerId: string;
};
export async function paymentCredentials(
  tenantId: string,
  environment: PaymentEnvironment = "production",
): Promise<CommercePaymentCredentials> {
  const column = environment === "test" ? "test_encrypted_credentials" : "encrypted_credentials";
  const row = (
    await getPool().query(
      `select ${column} as encrypted_credentials from commerce_payment_connections where tenant_id=$1`,
      [tenantId],
    )
  ).rows[0];
  if (!row?.encrypted_credentials)
    throw new CommerceError(environment === "test" ? "Cadastre as credenciais de teste desta loja. As de produção não serão utilizadas como alternativa." : "O pagamento online não está configurado.", 409);
  return decryptTenantSecret<CommercePaymentCredentials>(row.encrypted_credentials);
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
    publicKey?: string;
    transparentEnabled?: boolean;
    checkoutSettings?: CommercePaymentSettings;
    paymentEnvironment?: PaymentEnvironment;
    testPublicKey?: string;
    testAccessToken?: string;
    testWebhookSecret?: string;
    testSellerId?: string;
    testCredentialsConfirmed?: boolean;
  },
) {
  const current = (await getPool().query("select payment_environment,public_key,test_public_key,test_encrypted_credentials from commerce_payment_connections where tenant_id=$1", [tenantId])).rows[0];
  const environment = input.paymentEnvironment ?? paymentEnvironment(current?.payment_environment);
  let credentials: CommercePaymentCredentials | undefined;
  if (input.accessToken || input.webhookSecret) {
    let old: CommercePaymentCredentials | undefined;
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
  let testCredentials: CommercePaymentCredentials | undefined;
  if (input.testAccessToken || input.testWebhookSecret || input.testSellerId) {
    if (input.testAccessToken && !input.testCredentialsConfirmed) throw new CommerceError("Confirme que as credenciais foram copiadas do ambiente Teste do Mercado Pago.");
    const old = current?.test_encrypted_credentials ? decryptTenantSecret<CommercePaymentCredentials>(current.test_encrypted_credentials) : undefined;
    const accessToken = input.testAccessToken || old?.accessToken;
    if (!accessToken) throw new CommerceError("Informe o Access Token de teste.");
    let production: CommercePaymentCredentials | undefined = credentials;
    if (!production) { try { production = await paymentCredentials(tenantId); } catch { /* Store may be configured for tests only. */ } }
    if (production?.accessToken === accessToken) throw new CommerceError("O Access Token de teste deve ser diferente do token de produção cadastrado.");
    let sellerId = input.testSellerId || (!input.testAccessToken ? old?.sellerId : undefined);
    if (!sellerId) {
      try { sellerId = String((await mpRequest("/users/me", accessToken)).id ?? ""); }
      catch { throw new CommerceError("Não foi possível consultar a identidade com o token de teste. Informe o User ID do vendedor exibido no painel Mercado Pago, em Identificação do vendedor de teste."); }
    }
    if (!/^\d+$/.test(sellerId)) throw new CommerceError("Informe o User ID numérico do vendedor usado no teste.");
    testCredentials = { accessToken, sellerId, webhookSecret: input.testWebhookSecret || old?.webhookSecret || "" };
  }
  if (input.mpEnabled && environment === "production" && !credentials) await paymentCredentials(tenantId);
  if (credentials && current?.test_encrypted_credentials && decryptTenantSecret<CommercePaymentCredentials>(current.test_encrypted_credentials).accessToken === credentials.accessToken) throw new CommerceError("As credenciais de produção não podem reutilizar o Access Token de teste cadastrado.");
  if (input.mpEnabled && environment === "test" && !testCredentials && !current?.test_encrypted_credentials) throw new CommerceError("Cadastre o Access Token de teste antes de habilitar o modo de teste.");
  if (environment === "test" && input.mpEnabled && !(input.testPublicKey ?? current?.test_public_key)) throw new CommerceError("Informe a Public Key de teste.");
  if ((input.testPublicKey ?? current?.test_public_key) && (input.testPublicKey ?? current?.test_public_key) === (input.publicKey ?? current?.public_key)) throw new CommerceError("Cadastre Public Keys diferentes para teste e produção.");
  if (input.transparentEnabled) {
    const key = environment === "test" ? input.testPublicKey ?? current?.test_public_key : input.publicKey ?? current?.public_key;
    if (!key) throw new CommerceError("Informe a Public Key do ambiente selecionado para receber Pix e cartão dentro da loja.");
    if (!input.mpEnabled) throw new CommerceError("Habilite o Mercado Pago antes de ativar o pagamento dentro da loja.");
    if (input.checkoutSettings && !input.checkoutSettings.pix && !input.checkoutSettings.credit && !input.checkoutSettings.debit) throw new CommerceError("Habilite Pix ou cartão para receber dentro da loja.");
  }
  if (input.mpEnabled && environment === "test" && !input.transparentEnabled) throw new CommerceError("O modo de teste utiliza Pix e cartão dentro da loja. Habilite o Checkout Transparente.");
  if (environment === "production" && input.manualEnabled && !input.manualInstructions.trim())
    throw new CommerceError(
      "Informe como o comprador deverá realizar o pagamento manual.",
    );
  await commerceTransaction(async (client) => {
    await client.query(
      `insert into commerce_payment_connections(tenant_id,manual_enabled,manual_instructions,mp_enabled,encrypted_credentials,checkout_settings) values($1,$2,$3,$4,$5,coalesce($6::jsonb,'{}'::jsonb)) on conflict(tenant_id) do update set manual_enabled=$2,manual_instructions=$3,mp_enabled=$4,encrypted_credentials=coalesce($5,commerce_payment_connections.encrypted_credentials),checkout_settings=coalesce($6::jsonb,commerce_payment_connections.checkout_settings),updated_at=now()`,
      [
        tenantId,
        input.manualEnabled,
        input.manualInstructions,
        input.mpEnabled,
        credentials ? encryptTenantSecret(credentials) : null,
        input.checkoutSettings ? JSON.stringify(input.checkoutSettings) : null,
      ],
    );
    await client.query("update commerce_payment_connections set public_key=coalesce($2,public_key),transparent_enabled=coalesce($3,transparent_enabled) where tenant_id=$1", [tenantId, input.publicKey ?? null, input.transparentEnabled ?? null]);
    await client.query("update commerce_payment_connections set payment_environment=$2,test_public_key=coalesce($3,test_public_key),test_encrypted_credentials=coalesce($4,test_encrypted_credentials) where tenant_id=$1", [tenantId, environment, input.testPublicKey ?? null, testCredentials ? encryptTenantSecret(testCredentials) : null]);
    await client.query(
      `insert into audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) values($1,$2,'commerce.payments.configure','commerce_store',$1,$3)`,
      [
        tenantId,
        userId,
        JSON.stringify({
          manualEnabled: input.manualEnabled,
          mpEnabled: input.mpEnabled,
          transparentEnabled: input.transparentEnabled,
          paymentEnvironment: environment,
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
    const mode = (await client.query("select payment_environment from commerce_payment_connections where tenant_id=$1 for share", [store.tenant_id])).rows[0];
    if (paymentEnvironment(order.payment_environment) === "test" || paymentEnvironment(mode?.payment_environment) === "test") throw new CommerceError("O modo de teste permite apenas Pix e cartão dentro da loja. A carteira de produção não será aberta.", 409);
    const credentials = await paymentCredentials(store.tenant_id);
    if (order.checkout_url) return { url: order.checkout_url };
    const active = (await client.query("select id from commerce_payment_attempts where tenant_id=$1 and order_id=$2 and status in ('submitting','unknown','pending','paid','refunded') limit 1", [store.tenant_id, order.id])).rows[0];
    if (active) throw new CommerceError("Já existe um pagamento em andamento dentro da loja. Atualize a situação antes de continuar.", 409);
    const account = (
      await client.query(
        "select mp_enabled,checkout_settings from commerce_payment_connections where tenant_id=$1",
        [store.tenant_id],
      )
    ).rows[0];
    if (!account?.mp_enabled)
      throw new CommerceError(
        "O pagamento online está temporariamente indisponível.",
        409,
      );
    const back = `${commerceStoreUrl(store.slug, base)}/pedidos/${order.id}`;
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
        payment_methods: mercadoPagoPaymentMethods(account.checkout_settings),
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
    !/^(?:\d+|ORD[A-Z0-9]{10,60})$/i.test(id) ||
    !requestId ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`id:${id.toLowerCase()};request-id:${requestId};ts:${timestamp};`)
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
    if (payment.live_mode === false || row.payment_environment === "test") throw new CommerceError("Uma notificação de teste não pode confirmar um pagamento de produção.", 409);
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
