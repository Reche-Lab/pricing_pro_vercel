import { z } from "zod";

const optionalUuidList = z.array(z.string().uuid()).max(50).optional();
const optionalTextList = z.array(z.string().trim().min(1).max(100)).max(50).optional();

export const indicatorFormulaSchema = z.object({
  components: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(2).max(100),
    operation: z.enum(["add", "subtract"]),
    aggregation: z.enum(["sum", "average", "count"]),
    amountMode: z.enum(["absolute", "signed"]),
    filters: z.object({
      directions: z.array(z.enum(["inflow", "outflow", "neutral"])).max(3).optional(),
      natureKeys: optionalTextList,
      categoryIds: optionalUuidList,
      subcategoryIds: optionalUuidList,
      accountIds: optionalUuidList,
      sourceTypes: z.array(z.enum(["nubank", "olist", "mercado_pago", "paypal", "generic"])).max(5).optional(),
      reviewStatuses: z.array(z.enum(["pending", "reviewed", "ignored"])).max(3).optional(),
      includeInternalTransfers: z.boolean().optional()
    }).strict()
  }).strict()).max(12),
  sourceIndicatorId: z.string().uuid().optional(),
  adjustment: z.object({
    operation: z.enum(["percentage", "multiply", "divide"]),
    factor: z.number().finite().min(0).max(1_000_000)
  }).strict().refine((value) => value.operation !== "divide" || value.factor > 0, "O divisor deve ser maior que zero.").optional()
}).strict().superRefine((formula, context) => {
  if (formula.sourceIndicatorId ? formula.components.length > 0 : formula.components.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Selecione um indicador-base ou inclua os componentes do cálculo." });
  }
});

export const indicatorInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  unit: z.enum(["currency", "number"]),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
  effectiveFrom: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  formula: indicatorFormulaSchema
}).strict();

export const indicatorPreviewSchema = z.object({
  indicatorId: z.string().uuid().optional(),
  competence: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  unit: z.enum(["currency", "number"]),
  formula: indicatorFormulaSchema
}).strict();
