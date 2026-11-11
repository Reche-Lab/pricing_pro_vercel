import { z } from "zod";
import { addressSchema, billingSchema } from "./schemas";

export const buyerQuoteSchema = z.object({
  requestId: z.string().uuid(), revision: z.number().int().nonnegative(),
  expectedTotalCents: z.number().int().positive(),
  billing: billingSchema, address: addressSchema.nullable(), deliveryAddressSameAsBilling: z.boolean(),
  delivery: z.enum(["delivery", "pickup", "not_included"]), shippingQuoteId: z.string().uuid().optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.deliveryAddressSameAsBilling && !value.address) ctx.addIssue({ code: "custom", path: ["address"], message: "Informe os dados de entrega, mesmo quando o frete não estiver incluído." });
});
export type BuyerQuoteInput = z.infer<typeof buyerQuoteSchema>;
