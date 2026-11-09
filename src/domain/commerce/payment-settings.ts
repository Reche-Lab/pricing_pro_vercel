import { z } from "zod";

export const paymentEnvironmentSchema = z.enum(["production", "test"]);
export type PaymentEnvironment = z.infer<typeof paymentEnvironmentSchema>;
export const paymentEnvironment = (value: unknown): PaymentEnvironment => value === "test" ? "test" : "production";

export type PaymentConnectionCheck = {
  key: "identity" | "orders_read";
  endpoint: string;
  outcome: "ok" | "failed" | "unavailable";
  httpStatus: number | null;
  message: string;
  code?: string;
  supportReference?: string;
};
export type PaymentConnectionDiagnosis = {
  environment: PaymentEnvironment;
  checks: PaymentConnectionCheck[];
};

export const commercePaymentSettingsSchema = z.object({
  pix: z.boolean().default(true),
  credit: z.boolean().default(true),
  debit: z.boolean().default(true),
  boleto: z.boolean().default(true),
  maxInstallments: z.number().int().min(1).max(12).default(12),
}).strict();
export type CommercePaymentSettings = z.infer<typeof commercePaymentSettingsSchema>;
export const defaultCommercePaymentSettings = (): CommercePaymentSettings => commercePaymentSettingsSchema.parse({});

export function mercadoPagoPaymentMethods(value?: unknown) {
  const settings = commercePaymentSettingsSchema.parse(value ?? {});
  return {
    excluded_payment_methods: settings.pix ? [] : [{ id: "pix" }],
    excluded_payment_types: [
      ...(!settings.credit ? [{ id: "credit_card" }] : []),
      ...(!settings.debit ? [{ id: "debit_card" }] : []),
      ...(!settings.boleto ? [{ id: "ticket" }] : []),
    ],
    installments: settings.credit ? settings.maxInstallments : 1,
  };
}
