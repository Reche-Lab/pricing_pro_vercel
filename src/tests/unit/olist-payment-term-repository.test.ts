import { beforeEach, describe, expect, it, vi } from "vitest";
import { getQuotePaymentTerm, upsertQuotePaymentTerm } from "@/repositories/olist-payment-options";

const { query, context } = vi.hoisted(() => ({ query: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ withTenantContext: context }));
beforeEach(() => {
  query.mockReset();
  context.mockReset().mockImplementation((_user, _tenant, callback) => callback({ query }));
});

describe("payment link persistence", () => {
  it("removes incompatible bank data before persisting the term and installments", async () => {
    query.mockResolvedValue({ rows: [{ id: "term" }] });
    await upsertQuotePaymentTerm("user", "tenant", "quote", {
      paymentMethodExternalId: "10", paymentMethodName: "Olist Conta Digital",
      receivingMethodExternalId: "20", receivingMethodName: "Link de pagamento",
      installments: [{ installmentNumber: 1, amount: 100, paymentMethodExternalId: "10", paymentMethodName: "Olist Conta Digital" }]
    });
    expect(context).toHaveBeenCalledWith("user", "tenant", expect.any(Function));
    const term = query.mock.calls.find(([sql]) => sql.includes("insert into quote_payment_terms"))![1];
    expect(term.slice(0, 6)).toEqual(["tenant", "quote", null, null, "20", "Link de pagamento"]);
    const installment = query.mock.calls.find(([sql]) => sql.includes("insert into quote_payment_installments"))![1];
    expect(installment.slice(7)).toEqual([null, null, "20", "Link de pagamento"]);
    expect(installment[5]).toBe(100);
  });

  it("normalizes legacy saved terms on read without updating the database", async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: "term", quote_id: "quote", receiving_method_name: "Link de pagamento",
      payment_method_external_id: "10", payment_method_name: "Olist Conta Digital"
    }] }).mockResolvedValueOnce({ rows: [{
      installment_number: 1, amount: "100", payment_method_external_id: "10",
      payment_method_name: "Olist Conta Digital", notes: "Conferir pagamento"
    }] });
    const result = await getQuotePaymentTerm("user", "tenant", "quote");
    expect(result).toMatchObject({
      payment_method_external_id: null, payment_method_name: null,
      installments: [{ amount: 100, paymentMethodExternalId: null, paymentMethodName: null, notes: "Conferir pagamento" }]
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([sql]) => sql.trim().startsWith("select"))).toBe(true);
  });
});
