// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertPaymentAllowed, directPaymentSchema, safeChallengeUrl, validateProviderOrder } from "@/domain/commerce/transparent-payment";

const id = "674663df-1a12-4217-a05a-2475fd98ff7e";
const expected = { id, sellerId: "123", totalCents: 12990, method: "pix" as const };
const response = () => ({ id: "ORD01J49MMW3SSBK5PSV3DFR32959", user_id: "123", country_code: "BRA", external_reference: id, total_amount: "129.90", total_paid_amount: "129.90", status: "processed", status_detail: "accredited", transactions: { payments: [{ amount: "129.90", paid_amount: "120.00", status: "processed", status_detail: "accredited", payment_method: { id: "pix", type: "bank_transfer", token: "never-persist-this" } }] } });
describe("transparent payment boundary", () => {
  it("does not instruct Pix buyers to authenticate a card when awaiting a transfer", () => {
    const raw = response();
    raw.status = "action_required"; raw.status_detail = "waiting_transfer";
    raw.transactions.payments[0].status = "action_required";
    const result = validateProviderOrder(raw, expected);
    expect(result.status).toBe("pending");
    expect(result.result.message).toContain("Aguardando");
    expect(result.result.message).not.toContain("identidade");
  });
  it("confirms the gross amount, not the net amount, and discards sensitive data", () => {
    const result = validateProviderOrder(response(), expected);
    expect(result.status).toBe("paid");
    expect(JSON.stringify(result)).not.toContain("never-persist");
  });
  it.each(["user_id", "external_reference", "total_amount", "country_code"])("rejects a mismatched %s", field => {
    expect(() => validateProviderOrder({ ...response(), [field]: "wrong" }, expected)).toThrow();
  });
  it("never confirms a partial payment or a notification without transaction details", () => {
    expect(validateProviderOrder({ ...response(), total_paid_amount: "100.00" }, expected).status).toBe("pending");
    expect(() => validateProviderOrder({ ...response(), transactions: undefined }, expected)).toThrow();
  });
  it("does not allow caller amounts, payer data or card numbers", () => {
    expect(directPaymentSchema.safeParse({ orderId: id, requestId: id, payment: { method: "pix" }, amount: 1 }).success).toBe(false);
    expect(directPaymentSchema.safeParse({ orderId: id, requestId: id, payment: { method: "card", cardNumber: "1234" } }).success).toBe(false);
  });
  it("enforces tenant methods, installment limit and debit in one payment", () => {
    expect(() => assertPaymentAllowed({ method: "pix" }, { pix: false })).toThrow();
    const card = { method: "card", token: "token".repeat(5), paymentMethodId: "visa", paymentType: "debit_card", installments: 2 } as const;
    expect(() => assertPaymentAllowed(card, {})).toThrow();
    expect(() => assertPaymentAllowed({ ...card, paymentType: "credit_card", installments: 4 }, { maxInstallments: 3 })).toThrow();
  });
  it("allows only official bank authentication URLs", () => {
    expect(safeChallengeUrl("https://www.mercadopago.com.br/auth/card/validation/test")).toBeTruthy();
    expect(safeChallengeUrl("https://www.mercadopago.com.br.attacker.test/auth/card/validation/test")).toBeUndefined();
    expect(safeChallengeUrl("javascript:alert(1)")).toBeUndefined();
  });
});
