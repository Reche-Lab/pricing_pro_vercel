import { z } from "zod";
import { CommerceError } from "./commerce";
import { commercePaymentSettingsSchema, type PaymentEnvironment } from "./payment-settings";
import { isValidCpfOrCnpj } from "@/lib/validation/documents";

export const directPaymentSchema = z.object({
  orderId: z.string().uuid(),
  requestId: z.string().uuid(),
  payment: z.discriminatedUnion("method", [
    z.object({ method: z.literal("pix") }).strict(),
    z.object({
      method: z.literal("card"),
      token: z.string().regex(/^[a-zA-Z0-9_-]{16,256}$/),
      paymentMethodId: z.string().regex(/^[a-z0-9_-]{1,50}$/),
      paymentType: z.enum(["credit_card", "debit_card"]),
      installments: z.number().int().min(1).max(12),
      identification: z.object({ type: z.enum(["CPF", "CNPJ"]), number: z.string().max(20).transform(v => v.replace(/\D/g, "")) }).strict().refine(v => isValidCpfOrCnpj(v.number) && (v.type === "CPF" ? v.number.length === 11 : v.number.length === 14), "Confira o documento do titular do cartão.").optional(),
    }).strict(),
  ]),
}).strict();
export type DirectPayment = z.infer<typeof directPaymentSchema>["payment"];
export type PaymentAttemptStatus = "submitting" | "unknown" | "pending" | "paid" | "failed" | "refunded";
export type PaymentResult = {
  message?: string; qrCode?: string; qrImage?: string; expiresAt?: string;
  challengeUrl?: string; providerStatus?: string;
  failureCode?: string; supportReference?: string;
};
export type BuyerPaymentState = {
  environment?: PaymentEnvironment; canStart?: boolean;
  enabled: boolean; publicKey: string; amountCents: number;
  settings: z.infer<typeof commercePaymentSettingsSchema>;
  hosted: boolean; paymentStatus: string;
  payer?: { email: string; identification?: { type: "CPF" | "CNPJ"; number: string } };
  attempt: null | { id: string; method: "pix" | "card"; status: PaymentAttemptStatus; result: PaymentResult };
};

export function assertPaymentAllowed(payment: DirectPayment, rawSettings: unknown) {
  const settings = commercePaymentSettingsSchema.parse(rawSettings ?? {});
  if (payment.method === "pix" ? !settings.pix : payment.paymentType === "credit_card" ? !settings.credit : !settings.debit)
    throw new CommerceError("Esta forma de pagamento não está disponível.", 409);
  if (payment.method === "card" && payment.installments > (payment.paymentType === "credit_card" ? settings.maxInstallments : 1))
    throw new CommerceError("Confira o número de parcelas.");
}

const money = z.string().regex(/^\d+(\.\d{1,2})?$/);
const providerOrderSchema = z.object({
  live_mode: z.boolean().optional(),
  id: z.string().regex(/^ORD[A-Z0-9]{10,60}$/i),
  user_id: z.union([z.string(), z.number()]).transform(String),
  country_code: z.literal("BRA"), currency: z.literal("BRL").optional(), currency_id: z.literal("BRL").optional(),
  external_reference: z.string().uuid(), total_amount: money, total_paid_amount: money.nullish(),
  status: z.string(), status_detail: z.string().optional(),
  transactions: z.object({ payments: z.array(z.object({
    amount: money, status: z.string(), status_detail: z.string().optional(),
    date_of_expiration: z.string().nullish(),
    payment_method: z.object({
      id: z.string(), type: z.string(), qr_code: z.string().max(10000).nullish(),
      qr_code_base64: z.string().max(500000).nullish(),
      transaction_security: z.object({ url: z.string().nullish() }).nullish(),
    }),
  })).length(1) }),
});
export const amountString = (cents: number) => (cents / 100).toFixed(2);
const toCents = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};

export function safeChallengeUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && ["www.mercadopago.com", "www.mercadopago.com.br"].includes(url.hostname) && url.pathname.startsWith("/auth/card/validation/") && !url.username && !url.password && !url.port)
      return url.toString();
  } catch { /* Untrusted provider URL is never rendered. */ }
  return undefined;
}

export function validateProviderOrder(raw: unknown, expected: {
  id: string; sellerId: string; totalCents: number; method: "pix" | "card";
  environment?: PaymentEnvironment;
}): { providerId: string; status: PaymentAttemptStatus; result: PaymentResult } {
  const parsed = providerOrderSchema.safeParse(raw);
  if (!parsed.success) throw new CommerceError("Resposta de pagamento não reconhecida. Aguarde a confirmação.", 502);
  const order = parsed.data, payment = order.transactions.payments[0];
  if (order.live_mode !== undefined && order.live_mode !== (expected.environment !== "test"))
    throw new CommerceError("O ambiente retornado pelo Mercado Pago não corresponde ao pedido. Revise as credenciais antes de continuar.", 409);
  if (order.user_id !== expected.sellerId || order.external_reference !== expected.id || toCents(order.total_amount) !== expected.totalCents || toCents(payment.amount) !== expected.totalCents ||
    (expected.method === "pix" ? payment.payment_method.id !== "pix" || payment.payment_method.type !== "bank_transfer" : !["credit_card", "debit_card"].includes(payment.payment_method.type)))
    throw new CommerceError("Os dados do pagamento não correspondem ao pedido. Revisão necessária.", 409);
  let status: PaymentAttemptStatus = "pending";
  if (order.status === "processed" && order.status_detail === "accredited" && payment.status === "processed" && payment.status_detail === "accredited" && order.total_paid_amount && toCents(order.total_paid_amount) === expected.totalCents) status = "paid";
  if (["failed", "canceled", "expired"].includes(order.status) && ["failed", "canceled", "expired"].includes(payment.status)) status = "failed";
  if (["refunded", "charged_back"].includes(order.status)) status = "refunded";
  const result: PaymentResult = { providerStatus: order.status };
  result.message = status === "paid" ? "Pagamento confirmado. Seu pedido está pago." : status === "failed" ? "O pagamento não foi concluído. Escolha uma forma de pagamento para tentar novamente." : status === "refunded" ? "Pagamento estornado. Entre em contato com a loja." : "Aguardando a confirmação do Mercado Pago.";
  if (expected.environment === "test" && status === "paid") result.message = "Pagamento de teste aprovado. Nenhuma produção ou expedição foi liberada.";
  if (status === "pending" && expected.method === "pix") {
    if (payment.payment_method.qr_code) result.qrCode = payment.payment_method.qr_code;
    const image = payment.payment_method.qr_code_base64;
    if (image && /^[A-Za-z0-9+/=\r\n]+$/.test(image) && image.startsWith("iVBOR")) result.qrImage = `data:image/png;base64,${image}`;
    if (payment.date_of_expiration && Number.isFinite(Date.parse(payment.date_of_expiration))) result.expiresAt = new Date(payment.date_of_expiration).toISOString();
  }
  if (status === "pending" && expected.method === "card" && order.status === "action_required") {
    result.challengeUrl = safeChallengeUrl(payment.payment_method.transaction_security?.url);
    result.message = "Confirme sua identidade com o banco para concluir o pagamento.";
  }
  return { providerId: order.id, status, result };
}
