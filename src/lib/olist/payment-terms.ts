import type { QuotePaymentTermInput, QuotePaymentTermRow } from "@/repositories/olist-payment-options";

export function isOlistPaymentLink(name: string | null | undefined) {
  const normalized = (name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\blink\s+de\s+pagamento\b/.test(normalized);
}

export function normalizeOlistPaymentTermInput(input: QuotePaymentTermInput): QuotePaymentTermInput {
  const isLink = isOlistPaymentLink(input.receivingMethodName);
  return {
    ...input,
    paymentMethodExternalId: isLink ? null : input.paymentMethodExternalId,
    paymentMethodName: isLink ? null : input.paymentMethodName,
    installments: input.installments?.map((installment) => {
      const omitBank = isLink || isOlistPaymentLink(installment.receivingMethodName);
      return {
        ...installment,
        paymentMethodExternalId: omitBank ? null : installment.paymentMethodExternalId,
        paymentMethodName: omitBank ? null : installment.paymentMethodName
      };
    })
  };
}

// Apply the same compatibility rule to legacy saved terms and outbound previews.
export function normalizeOlistPaymentTermRow(term: QuotePaymentTermRow): QuotePaymentTermRow {
  const normalized = normalizeOlistPaymentTermInput({
    paymentMethodExternalId: term.payment_method_external_id,
    paymentMethodName: term.payment_method_name,
    receivingMethodName: term.receiving_method_name,
    installments: term.installments
  });
  return {
    ...term,
    payment_method_external_id: normalized.paymentMethodExternalId ?? null,
    payment_method_name: normalized.paymentMethodName ?? null,
    installments: normalized.installments ?? []
  };
}
