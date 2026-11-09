import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { CommerceError } from "@/domain/commerce/commerce";
import { commercePaymentSettingsSchema, paymentEnvironment, type PaymentEnvironment } from "@/domain/commerce/payment-settings";
import { amountString, assertPaymentAllowed, validateProviderOrder, type BuyerPaymentState, type directPaymentSchema, type PaymentAttemptStatus, type PaymentResult } from "@/domain/commerce/transparent-payment";
import { commerceTransaction, type CommerceOrder } from "@/repositories/commerce";
import { paymentCredentials } from "./payments";
import { paymentFailureMessage, readPaymentProviderResponse } from "./payment-diagnostics";

type Attempt = {
  payment_environment?: PaymentEnvironment;
  id: string; tenant_id: string; order_id: string; request_id: string; fingerprint: string;
  seller_id: string; method: "pix" | "card"; status: PaymentAttemptStatus;
  provider_order_id: string | null; result: PaymentResult;
};
const providerId = /^ORD[A-Z0-9]{10,60}$/i;
const activeStatuses = ["submitting", "unknown", "pending", "paid", "refunded"];
const uncertainMessage = paymentFailureMessage(502);

async function ownedOrder(tenantId: string, customerId: string, orderId: string) {
  const order = (await getPool().query<CommerceOrder>(
    "select * from commerce_orders where tenant_id=$1 and customer_id=$2 and id=$3 and provider='mercado_pago'",
    [tenantId, customerId, orderId],
  )).rows[0];
  if (!order) throw new CommerceError("Pedido não encontrado.", 404);
  return order;
}

export async function buyerPaymentState(tenantId: string, customerId: string, orderId: string): Promise<BuyerPaymentState> {
  const order = await ownedOrder(tenantId, customerId, orderId);
  const account = (await getPool().query("select mp_enabled,transparent_enabled,public_key,test_public_key,payment_environment,checkout_settings from commerce_payment_connections where tenant_id=$1", [tenantId])).rows[0];
  const attempt = (await getPool().query<Attempt>("select * from commerce_payment_attempts where tenant_id=$1 and order_id=$2 order by created_at desc,id desc limit 1", [tenantId, orderId])).rows[0];
  const environment = paymentEnvironment(order.payment_environment);
  const publicKey = environment === "test" ? account?.test_public_key : account?.public_key;
  return {
    environment, canStart: environment === paymentEnvironment(account?.payment_environment),
    enabled: Boolean(account?.mp_enabled && account?.transparent_enabled && publicKey),
    publicKey: publicKey ?? "", amountCents: order.total_cents,
    settings: commercePaymentSettingsSchema.parse(account?.checkout_settings ?? {}),
    hosted: Boolean(order.checkout_url), paymentStatus: order.payment_status,
    payer: environment === "test" ? { email: "test_payer@example.com", identification: { type: "CPF", number: "12345678909" } } : { email: order.snapshot.billing?.email ?? order.snapshot.customer.email, ...(order.snapshot.billing?.document ? { identification: { type: order.snapshot.billing.personType === "J" ? "CNPJ" as const : "CPF" as const, number: order.snapshot.billing.document.replace(/\D/g, "") } } : {}) },
    attempt: attempt ? { id: attempt.id, method: attempt.method, status: attempt.status, result: attempt.result } : null,
  };
}

export async function startDirectPayment(tenantId: string, customerId: string, input: z.infer<typeof directPaymentSchema>) {
  const fingerprint = createHash("sha256").update(JSON.stringify(input.payment)).digest("hex");
  // Reserve under the order lock, then call the provider outside the transaction.
  // A crash or timeout leaves a visible, blocking attempt, not a second charge.
  const reservation = await commerceTransaction(async client => {
    const order = (await client.query<CommerceOrder>("select * from commerce_orders where tenant_id=$1 and customer_id=$2 and id=$3 for update", [tenantId, customerId, input.orderId])).rows[0];
    if (!order || order.provider !== "mercado_pago") throw new CommerceError("Pedido não encontrado.", 404);
    if (order.payment_status !== "pending") throw new CommerceError("Este pedido já teve seu pagamento processado.", 409);
    if (order.checkout_url) throw new CommerceError("Este pedido já possui um pagamento na carteira Mercado Pago. Continue pelo link emitido.", 409);
    const previous = (await client.query<Attempt>("select * from commerce_payment_attempts where tenant_id=$1 and order_id=$2 and (request_id=$3 or status=any($4::text[])) order by created_at desc limit 1", [tenantId, order.id, input.requestId, activeStatuses])).rows[0];
    if (previous) {
      if (previous.request_id === input.requestId && previous.fingerprint === fingerprint) return null;
      throw new CommerceError("Já existe um pagamento em andamento. Atualize a situação antes de continuar.", 409);
    }
    const account = (await client.query("select mp_enabled,transparent_enabled,public_key,test_public_key,payment_environment,checkout_settings from commerce_payment_connections where tenant_id=$1 for share", [tenantId])).rows[0];
    const environment = paymentEnvironment(order.payment_environment);
    if (environment !== paymentEnvironment(account?.payment_environment)) throw new CommerceError("Este pedido pertence a outro ambiente de pagamento. Crie um novo pedido no ambiente atual da loja.", 409);
    const publicKey = environment === "test" ? account?.test_public_key : account?.public_key;
    if (!account?.mp_enabled || !account?.transparent_enabled || !publicKey) throw new CommerceError("O pagamento dentro da loja não está disponível.", 409);
    assertPaymentAllowed(input.payment, account.checkout_settings);
    const credentials = await paymentCredentials(tenantId, environment);
    const id = randomUUID();
    await client.query("insert into commerce_payment_attempts(id,tenant_id,order_id,request_id,fingerprint,seller_id,method,payment_environment) values($1,$2,$3,$4,$5,$6,$7,$8)", [id, tenantId, order.id, input.requestId, fingerprint, credentials.sellerId, input.payment.method, environment]);
    await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,'payment.attempt_started',$3)", [tenantId, order.id, JSON.stringify({ attemptId: id, method: input.payment.method, environment })]);
    return { id, order, environment, credentials };
  });
  if (!reservation) return;
  const { id, order, environment, credentials } = reservation;
  const card = input.payment.method === "card" ? input.payment : null;
  const billing = order.snapshot.billing;
  const payload = {
    type: "online", processing_mode: "automatic", external_reference: id,
    total_amount: amountString(order.total_cents),
    config: {
      ...(billing?.state ? { location: { state_id: `BR-${billing.state}` } } : {}),
      ...(card ? { online: { transaction_security: { validation: "on_fraud_risk", liability_shift: "required" } } } : {}),
    },
    payer: environment === "test" && !card ? { email: "test_payer@example.com", first_name: "APRO" } : { email: environment === "test" ? "test_payer@example.com" : billing?.email ?? order.snapshot.customer.email, ...(card?.identification ? { identification: card.identification } : environment === "test" ? { identification: { type: "CPF", number: "12345678909" } } : billing?.document ? { identification: { type: billing.personType === "J" ? "CNPJ" : "CPF", number: billing.document.replace(/\D/g, "") } } : {}) },
    transactions: { payments: [{
      amount: amountString(order.total_cents),
      payment_method: card ? { id: card.paymentMethodId, type: card.paymentType, token: card.token, installments: card.installments } : { id: "pix", type: "bank_transfer" },
      ...(!card ? { expiration_time: "PT30M" } : {}),
    }] },
  };
  const secrets = [credentials.accessToken, credentials.webhookSecret, card?.token, billing?.email, billing?.document, billing?.document?.replace(/\D/g, ""), card?.identification?.number, order.snapshot.customer.email].filter((value): value is string => Boolean(value));
  const startedAt = Date.now();
  try {
    const response = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST", headers: { authorization: `Bearer ${credentials.accessToken}`, "content-type": "application/json", "X-Idempotency-Key": id },
      body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    const { data, diagnostics } = await readPaymentProviderResponse(response, secrets);
    const context = {
      tenantId, orderId: order.id, attemptId: id, method: input.payment.method, environment,
      operation: "orders.create", endpoint: "/v1/orders", httpStatus: response.status,
      durationMs: Date.now() - startedAt, providerCode: diagnostics.codes[0] ?? `http_${response.status}`,
      providerCodes: diagnostics.codes, providerMessages: diagnostics.messages,
      providerRequestId: diagnostics.providerRequestId, responseBodyKind: diagnostics.bodyKind,
    };
    if (response.ok) console.info("Commerce direct payment submitted.", context);
    else console.error("Commerce direct payment rejected.", context);
    if (typeof data?.id === "string" && providerId.test(data.id)) {
      await getPool().query("update commerce_payment_attempts set provider_order_id=$3,updated_at=now() where tenant_id=$1 and id=$2 and provider_order_id is null", [tenantId, id, data.id]);
      // Creation can include a token and incomplete seller data. Only reconcile
      // the authoritative GET response, never persist the raw provider response.
      await reconcileDirectPayment(tenantId, data.id, environment);
      return;
    }
    const definiteFailure = [400, 401, 403, 404, 422].includes(response.status);
    await getPool().query("update commerce_payment_attempts set status=$3,result=$4,updated_at=now() where tenant_id=$1 and id=$2 and status in ('submitting','unknown')", [tenantId, id, definiteFailure ? "failed" : "unknown", JSON.stringify({ message: paymentFailureMessage(response.status) })]);
  } catch (error) {
    console.error("Commerce direct payment awaiting reconciliation.", { tenantId, orderId: order.id, attemptId: id, errorType: error instanceof Error ? error.name : "unknown" });
    await getPool().query("update commerce_payment_attempts set status=$3,result=$4,updated_at=now() where tenant_id=$1 and id=$2 and status in ('submitting','unknown')", [tenantId, id, "unknown", JSON.stringify({ message: uncertainMessage })]);
  }
}

export async function reconcileDirectPayment(tenantId: string, id: string, environment: PaymentEnvironment = "production") {
  if (!providerId.test(id)) throw new CommerceError("Identificador de pagamento inválido.");
  const credentials = await paymentCredentials(tenantId, environment);
  const startedAt = Date.now();
  const response = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${credentials.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  const { data, diagnostics } = await readPaymentProviderResponse(response, [credentials.accessToken, credentials.webhookSecret]);
  const context = { tenantId, providerOrderId: id, environment, operation: "orders.get", httpStatus: response.status, durationMs: Date.now() - startedAt, providerCodes: diagnostics.codes, providerMessages: diagnostics.messages, providerRequestId: diagnostics.providerRequestId, responseBodyKind: diagnostics.bodyKind };
  if (response.ok) console.info("Commerce direct payment lookup.", context);
  else console.error("Commerce direct payment lookup rejected.", context);
  if (!response.ok) throw new CommerceError("Não foi possível confirmar o pagamento. Aguarde e atualize a situação.", 502);
  const reference = z.string().uuid().safeParse(data?.external_reference);
  if (!reference.success) return;
  const candidate = (await getPool().query<Attempt>("select * from commerce_payment_attempts where tenant_id=$1 and id=$2", [tenantId, reference.data])).rows[0];
  if (!candidate) return;
  // Lock order first everywhere (including hosted checkout) to avoid deadlocks.
  await commerceTransaction(async client => {
    const order = (await client.query<CommerceOrder>("select * from commerce_orders where tenant_id=$1 and id=$2 for update", [tenantId, candidate.order_id])).rows[0];
    const attempt = (await client.query<Attempt>("select * from commerce_payment_attempts where tenant_id=$1 and id=$2 for update", [tenantId, candidate.id])).rows[0];
    if (!order || !attempt) return;
    if (paymentEnvironment(attempt.payment_environment) !== environment || paymentEnvironment(order.payment_environment) !== environment) throw new CommerceError("O ambiente da notificação não corresponde ao pedido.", 409);
    const verified = validateProviderOrder(data, { id: attempt.id, sellerId: attempt.seller_id, totalCents: order.total_cents, method: attempt.method, environment });
    if (verified.providerId !== id || (attempt.provider_order_id && attempt.provider_order_id !== id) || (order.provider_payment_id && order.provider_payment_id !== id) || order.checkout_url)
      throw new CommerceError("Pagamento divergente. A loja precisa revisar este pedido.", 409);
    if (attempt.status === "refunded" || (attempt.status === "paid" && verified.status !== "refunded")) return;
    if (order.payment_status === "refunded" || (order.payment_status === "paid" && !["paid", "refunded"].includes(verified.status))) return;
    await client.query("update commerce_payment_attempts set provider_order_id=$3,status=$4,result=$5,updated_at=now() where tenant_id=$1 and id=$2", [tenantId, attempt.id, id, verified.status, JSON.stringify(verified.result)]);
    if (["paid", "refunded"].includes(verified.status)) {
      await client.query("update commerce_orders set payment_status=$3,provider_payment_id=$4,updated_at=now() where tenant_id=$1 and id=$2", [tenantId, order.id, verified.status, id]);
    }
    if (attempt.status !== verified.status) {
      await client.query("insert into commerce_order_events(tenant_id,order_id,type,metadata) values($1,$2,$3,$4)", [tenantId, order.id, environment === "test" ? `payment.test_${verified.status}` : `payment.${verified.status}`, JSON.stringify({ attemptId: attempt.id, providerOrderId: id, method: attempt.method, environment })]);
      console.info("Commerce direct payment reconciled.", { tenantId, orderId: order.id, attemptId: attempt.id, status: verified.status, environment });
    }
  });
}

export async function refreshDirectPayment(tenantId: string, customerId: string, orderId: string) {
  await ownedOrder(tenantId, customerId, orderId);
  const attempt = (await getPool().query<Attempt>("select * from commerce_payment_attempts where tenant_id=$1 and order_id=$2 order by created_at desc,id desc limit 1", [tenantId, orderId])).rows[0];
  if (attempt?.provider_order_id) await reconcileDirectPayment(tenantId, attempt.provider_order_id, paymentEnvironment(attempt.payment_environment));
  return buyerPaymentState(tenantId, customerId, orderId);
}
