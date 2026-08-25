import { z } from "zod";

const optionalText = z.string().trim().max(200).nullable().optional().transform((value) => value || undefined);
const optionalMoney = z.number().int().min(0).max(999999999999).nullable().optional().transform((value) => value ?? undefined);

export const financialRuleSchema = z.object({
  name: z.string().trim().min(3).max(100),
  priority: z.number().int().min(1).max(9999),
  sourceType: z.enum(["nubank", "olist", "mercado_pago", "paypal", "generic"]).nullable().optional(),
  financialAccountId: z.string().uuid().nullable().optional(),
  conditions: z.object({
    descriptionContains: optionalText,
    descriptionStartsWith: optionalText,
    regex: optionalText,
    direction: z.enum(["inflow", "outflow", "neutral"]).nullable().optional().transform((value) => value ?? undefined),
    minimumAmountCents: optionalMoney,
    maximumAmountCents: optionalMoney,
    exactAmountCents: optionalMoney
  }).refine((conditions) => Object.values(conditions).some((value) => value !== undefined), "Informe pelo menos uma condição."),
  actions: z.object({
    nature: z.string().trim().min(2).max(60),
    categoryId: z.string().uuid().nullable().optional(),
    includeExternalCashFlow: z.boolean(),
    includeOperatingResult: z.boolean(),
    reviewRequired: z.boolean()
  }),
  enabled: z.boolean(),
  autoApply: z.boolean()
});

export const competenceSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
